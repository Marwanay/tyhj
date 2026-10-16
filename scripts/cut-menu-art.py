# Builds the dessert cut-outs used by the catering menu's live dessert table.
# Dev-time only (not run on Vercel): needs `pip install "rembg[cpu]" scipy pillow`.
#   python scripts/cut-menu-art.py
# Sources: assets/source/menu-grid-a.png (5x3 cards) and menu-grid-b.png (6x3 cards),
# the approved Cocoa Caramel menu renders. Output: public/media/menu/<item>.webp
import os
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/media/menu')
os.makedirs(OUT, exist_ok=True)

B = ['chocolate-cake', 'raspberry-cake', 'pistachio-cake', 'lemon-berry-cake', 'cherry-cake', 'assorted-mini-cakes',
     None, None, 'lemon-berry-tart', 'classic-cheesecake', 'mini-cheesecakes', 'mini-tarts',
     'mini-chocolate-sticks', None, 'brownie-bar-pistachio', 'caramel-pecan', 'snickers-bites', 'ferrero-rocher']
# Taken from grid A instead: cleaner cream edges / the dark chocolate pieces. (row, col, model)
A = {'raspberry-wedding': (1, 1, 'isnet-general-use'), 'tiramisu-wedding': (1, 2, 'u2net'), 'chocolate-pieces': (2, 3, 'u2net')}
# Whole cakes are lifted off their pedestal so they sit on the table's own stands.
OFF_STAND = {'chocolate-cake', 'raspberry-cake', 'lemon-berry-cake', 'pistachio-cake', 'cherry-cake', 'classic-cheesecake'}

sessions = {}
def cut(tile, model):
    sessions.setdefault(model, new_session(model))
    return remove(tile, session=sessions[model], post_process_mask=True)

def clean(img, name):
    a = np.array(img)
    alpha = a[:, :, 3]
    labels, n = ndimage.label(alpha > 40)
    if n > 1:  # keep the main dessert, drop specks of background
        sizes = ndimage.sum(np.ones_like(alpha), labels, range(1, n + 1))
        keep = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.08])
        a[:, :, 3] = np.where(keep, alpha, 0)
    if name in OFF_STAND:
        widths = (a[:, :, 3] > 40).sum(axis=1)
        top = int(np.argmax(widths > 0))
        for y in range(len(widths) - 1, top, -1):  # lowest row that is still plate-wide
            if widths[y] >= widths.max() * 0.72:
                a = a[: y + 3]
                break
    out = Image.fromarray(a)
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())

def save(img, name):
    img.thumbnail((320, 320), Image.LANCZOS)
    img.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=86, method=6)
    print(name, img.size)

gb = Image.open(os.path.join(ROOT, 'assets/source/menu-grid-b.png')).convert('RGB')
for i, name in enumerate(B):
    if not name:
        continue
    r, c = divmod(i, 6)
    x0, y0 = c * 256, r * 341
    save(clean(cut(gb.crop((x0 + 14, y0 + 92, x0 + 242, y0 + 282)), 'isnet-general-use'), name), name)

ga = Image.open(os.path.join(ROOT, 'assets/source/menu-grid-a.png')).convert('RGB')
for name, (r, c, model) in A.items():
    x0, y0 = c * 307, r * 341
    save(clean(cut(ga.crop((x0 + 15, y0 + 85, x0 + 292, y0 + 270)), model), name), name)

# ---- Build Your Dessert Table: overhead table + assets from the real Cocoa Caramel photos ----
TABLE = os.path.join(ROOT, 'public/media/table')
os.makedirs(TABLE, exist_ok=True)
src = lambda f: os.path.join(ROOT, 'assets/source', f)

top = Image.open(src('dessert-table-overhead.png')).convert('RGB')
for w in (960, 1536):
    t = top.resize((w, round(w * top.height / top.width)), Image.LANCZOS)
    t.save(os.path.join(TABLE, f'table-{w}.webp'), 'WEBP', quality=82, method=6)
    t.save(os.path.join(TABLE, f'table-{w}.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)

def real_cut(name, file, box, model='isnet-general-use', width=520):
    img = clean(cut(Image.open(src(file)).convert('RGB').crop(box), model), name)
    img.thumbnail((width, width * 2), Image.LANCZOS)
    img.save(os.path.join(TABLE, f'{name}.webp'), 'WEBP', quality=86, method=6); print('table', name, img.size)

def real_fill(name, file, box, width=640):
    img = Image.open(src(file)).convert('RGB').crop(box)
    img.thumbnail((width, width), Image.LANCZOS)
    img.save(os.path.join(TABLE, f'{name}-fill.webp'), 'WEBP', quality=84, method=6); print('table fill', name, img.size)

real_cut('macaron-tower', 'real-macaron-tower.png', (0, 0, 528, 1040))
real_cut('mini-eclairs', 'real-mini-eclairs.png', (0, 80, 1000, 560))
real_fill('chocolate-pieces', 'real-chocolate-pieces.png', (120, 290, 760, 620))
real_fill('mini-cheesecakes', 'real-mini-cheesecakes.png', (0, 200, 470, 560))
