# Lifts individual desserts out of the two reference arrangements so each one can be
# shown on its own on the empty overhead table (Build Your Dessert Table).
# Dev-time only (not run on Vercel): needs `pip install "rembg[cpu]" opencv-python-headless numpy pillow`.
#   python scripts/extract-table-desserts.py
#
# Sources (assets/source):
#   dessert-table-overhead.png       the empty table (the site's fixed background)
#   reference-arrangement-a.png      populated reference arrangement 1
#   reference-arrangement-b.png      populated reference arrangement 2
# Both references were rendered from the empty table, so they line up with it almost exactly:
# each is registered to the table (SIFT + homography), so every dessert keeps the table's own
# camera angle, position and lighting. A dessert is cut out on its own (rembg — no plate, stand
# or flowers), colour-matched to the empty table and given a soft contact shadow.
#
# Output: public/media/table/desserts/<id>.webp (transparent, cropped) and
#         src/data/table-assets.js (where each asset sits on its own serving surface).
import json, os
import numpy as np
import cv2
from PIL import Image
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/source')
OUT = os.path.join(ROOT, 'public/media/table/desserts')
DATA = os.path.join(ROOT, 'src/data/table-assets.js')
W, H = 1536, 1024
os.makedirs(OUT, exist_ok=True)

ZONES = {z['id']: z for z in json.loads(open(os.path.join(ROOT, 'src/data/table-placement.js')).read().split('export default ', 1)[1].rstrip().rstrip(';'))['zones']}
def zone_plate(zid):
    z = ZONES[zid]
    return [round(z['center']['x'] / 100 * W, 1), round(z['center']['y'] / 100 * H, 1),
            round(z['bounds']['width'] / 100 * W, 1), round(z['bounds']['height'] / 100 * H, 1)]

# id: (reference, crop box x0 y0 x1 y1 in table pixels, serving surface it stands on).
# The surface is a zone id when the reference used the table's own stand/tray, otherwise the
# reference's own vessel [cx, cy, w, h] (the asset then carries that vessel with it).
ASSETS = {
    'chocolate-cake':        ('a', (335, 112, 552, 318), 'R01'),
    'raspberry-cake':        ('a', (648, 128, 886, 322), 'R03'),
    'pistachio-cake':        ('a', (1003, 128, 1222, 318), 'R05'),
    'lemon-berry-cake':      ('a', (1203, 200, 1397, 352), [1300, 302, 186, 100]),
    'cherry-cake':           ('a', (173, 258, 362, 422), 'R06'),
    'assorted-mini-cakes':   ('a', (515, 248, 667, 390), 'R02'),
    'macaron-tower':         ('a', (22, 248, 188, 488), 'M01'),
    'madeleine-tower':       ('a', (1372, 282, 1536, 545), 'M03'),
    'nutella-profiterole':   ('a', (313, 423, 507, 582), [410, 505, 190, 118]),
    'mini-tarts':            ('a', (1098, 438, 1302, 582), [1200, 506, 196, 118]),
    'mini-eclairs':          ('a', (560, 418, 760, 536), 'S01'),
    'mini-cupcakes':         ('a', (558, 586, 752, 698), [655, 642, 196, 110]),
    'chocolate-pieces':      ('a', (180, 704, 466, 800), 'T01'),
    'mousse-cups':           ('a', (195, 610, 446, 702), [320, 668, 256, 98]),
    'brownie-bar-pistachio': ('a', (1078, 652, 1442, 806), 'T03'),
    'mini-cheesecakes':      ('b', (528, 243, 652, 362), 'R02'),
    'caramel-pecan':         ('b', (1188, 292, 1352, 422), [1268, 360, 170, 114]),
    'mini-macarons':         ('b', (638, 716, 932, 802), 'T04'),
}

# Cut-out model per dessert where u2net keeps a bit of table: isnet is tighter on those.
MODEL = {'cherry-cake': 'isnet-general-use'}

base = cv2.imread(os.path.join(SRC, 'dessert-table-overhead.png'))
base = cv2.resize(base, (W, H), interpolation=cv2.INTER_AREA)

def register(img):
    g1, g2 = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY), cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sift = cv2.SIFT_create(8000)
    k1, d1 = sift.detectAndCompute(g1, None); k2, d2 = sift.detectAndCompute(g2, None)
    m = cv2.BFMatcher().knnMatch(d2, d1, k=2)
    good = [a for a, b in m if a.distance < 0.7 * b.distance]
    src = np.float32([k2[a.queryIdx].pt for a in good]); dst = np.float32([k1[a.trainIdx].pt for a in good])
    hm, _ = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    return cv2.warpPerspective(img, hm, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

refs = {k: register(cv2.imread(os.path.join(SRC, f'reference-arrangement-{k}.png'))) for k in ('a', 'b')}

sessions = {}
def cutout(rgb, model):
    """Dessert only (no plate, stand or table) with a soft alpha edge."""
    sessions.setdefault(model, new_session(model))
    out = np.array(remove(Image.fromarray(rgb), session=sessions[model], post_process_mask=False))
    a = out[..., 3].astype(np.float32) / 255
    # Drop specks: keep the components that hold most of the dessert.
    n, labels, stats, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8))
    if n > 1:
        big = stats[1:, 4].max()
        keep = np.isin(labels, [i for i in range(1, n) if stats[i, 4] >= big * 0.04])
        a *= cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    return a

def colour_match(a, b, alpha):
    """Matches the reference's colour grade to the empty table, using the pixels around the dessert."""
    bg = cv2.dilate((alpha > 0.1).astype(np.uint8), np.ones((15, 15), np.uint8)) == 0
    out = a.astype(np.float32)
    if bg.sum() > 500:
        for c in range(3):
            pa, pb = a[..., c][bg].astype(np.float32), b[..., c][bg].astype(np.float32)
            g = float(np.clip(pb.std() / max(pa.std(), 1), 0.9, 1.12))
            out[..., c] = out[..., c] * g + float(np.clip(pb.mean() - g * pa.mean(), -14, 14))
    return np.clip(out, 0, 255).astype(np.uint8)

def with_shadow(rgb, alpha, pad=14):
    """Adds a soft contact shadow beneath the dessert (light falls from the back of the table)."""
    h, w = alpha.shape
    a = np.zeros((h + 2 * pad, w + 2 * pad), np.float32); a[pad:pad + h, pad:pad + w] = alpha
    c = np.zeros((h + 2 * pad, w + 2 * pad, 3), np.uint8); c[pad:pad + h, pad:pad + w] = rgb
    sh = cv2.GaussianBlur(np.roll(a, (5, 2), (0, 1)), (0, 0), 4.5) * 0.42
    out_a = a + sh * (1 - a)
    shadow_rgb = np.array([40, 22, 18], np.float32)          # warm brown shadow, like the table's own
    col = (c.astype(np.float32) * a[..., None] + shadow_rgb * (sh * (1 - a))[..., None]) / np.maximum(out_a, 1e-4)[..., None]
    return np.clip(col, 0, 255).astype(np.uint8), out_a, pad

manifest = {}
for pid, (ref, box, surface) in ASSETS.items():
    x0, y0, x1, y1 = box
    crop = refs[ref][y0:y1, x0:x1]
    alpha = cutout(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), MODEL.get(pid, 'u2net'))
    rgb = colour_match(crop, base[y0:y1, x0:x1], alpha)
    rgb, alpha, pad = with_shadow(rgb, alpha)
    box = (x0 - pad, y0 - pad)
    ys, xs = np.where(alpha > 0.02)
    cx0, cy0, cx1, cy1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB), (alpha * 255).round().astype(np.uint8)])[cy0:cy1, cx0:cx1]
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'{pid}.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    x, y = box[0] + int(cx0), box[1] + int(cy0)
    manifest[pid] = {
        'src': f'/media/table/desserts/{pid}.webp',
        'source': f'reference-arrangement-{ref}',
        # Where the asset sat in the reference, in table pixels: left, top, width, height.
        'rect': [x, y, int(cx1 - cx0), int(cy1 - cy0)],
        'surface': surface if isinstance(surface, str) else None,
        # The serving surface it stands on (centre x, centre y, width, height), used for scaling.
        'plate': zone_plate(surface) if isinstance(surface, str) else surface,
    }
    print(f'{pid:24s} {manifest[pid]["rect"]}')

os.makedirs(os.path.dirname(DATA), exist_ok=True)
with open(DATA, 'w') as f:
    f.write('// Written by scripts/extract-table-desserts.py — do not edit by hand.\n'
            '// Each dessert render: where it sat on the table (rect, table pixels) and the serving footprint it stands on.\n'
            'export default ' + json.dumps(manifest, indent=2) + ';\n')
