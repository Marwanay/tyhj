# Music and sound effects for the launch film: a violin instrumental over a fast beat, synthesised
# from scratch (bowed-string modelling — no samples, no licensed music) and locked to the picture: 120 bpm, so one beat = 0.5 s and one bar = 2 s,
# and every cut in launch.html lands on a bar.
#   python video/sound.py video/out/soundtrack.wav [bpm]     (needs numpy + scipy; default 140 bpm)
# Everything below is written on a 120 bpm grid (beat 0.5 s, bar 2 s) and scaled to the chosen
# tempo by K, exactly as launch.html scales its timeline.
# render.mjs mixes the result into the MP4.
#
# Arrangement:  0–4 s intro build · 4 s DROP · 4–22 s groove (collection, fillings, events)
#               22–34 s groove + bright arp (quote request, dessert table) · 34–38 s build
#               (send → quote → booking confirmed) · 38 s FINAL DROP · 41.5 s stop, tail to 42 s.
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, lfilter
from scipy.io import wavfile

SR = 48000
BPM = float(sys.argv[2]) if len(sys.argv) > 2 else 140.0
K = 120.0 / BPM                      # grid seconds → real seconds
DUR = 42.0
N = int(SR * DUR * K)
BEAT = 0.5
BAR = 2.0
rng = np.random.default_rng(5)

def buf():
    return np.zeros((N, 2))

drums, fx = buf(), buf()

def T(sec):
    return np.arange(int(sec * SR)) / SR

def add(b, start, sig, gain=1.0, pan=0.0):
    i = int(round(start * K * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        sig = np.stack([sig * l, sig * r], 1)
    b[i:i + len(sig)] += sig * gain

def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x, axis=0)

def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# ---- Drums ------------------------------------------------------------------------------
def kick():
    t = T(0.45)
    f = 45 + 130 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = filt(rng.standard_normal(len(t)), 'high', 2500) * np.exp(-t * 300) * 0.4
    return np.tanh((body + click) * 1.8)

def clap():
    t = T(0.35)
    n = rng.standard_normal(len(t))
    e = sum(np.exp(-np.clip(t - d, 0, None) * 120) * (t >= d) for d in (0, .011, .022)) + 0.5 * np.exp(-np.clip(t - .03, 0, None) * 14) * (t >= .03)
    return filt(n * e, 'band', [900, 3200])

def snare():
    t = T(0.25)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return tone * .5 + filt(rng.standard_normal(len(t)), 'band', [1500, 7000]) * np.exp(-t * 18)

def hat(open_=False):
    t = T(0.35 if open_ else 0.06)
    return filt(rng.standard_normal(len(t)), 'high', 7500) * np.exp(-t * (8 if open_ else 70))

def crash(dur=2.6):
    t = T(dur)
    return filt(rng.standard_normal(len(t)), 'high', 4000) * np.exp(-t * 2.2)

def impact(dur=2.5):
    t = T(dur)
    f = 32 + 80 * np.exp(-t * 9)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8) * 2) + filt(rng.standard_normal(len(t)), 'low', 600) * np.exp(-t * 5) * .5

# ---- Tonal ----------------------------------------------------------------------------------
def bell(m, dur=1.6):
    t = T(dur); f = hz(m)
    s = np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 5) + .2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 8)
    return s * np.exp(-t * 3) * np.clip(t / .002, 0, 1)

# ---- FX -------------------------------------------------------------------------------------
def whoosh(dur=0.6, lo=300, hi=7000, rise=True):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n + 2000); out = np.zeros(n); steps = 40
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        fr = k / steps if rise else 1 - k / steps
        c = lo * (hi / lo) ** fr
        out[a:b] = filt(noise[a:b + 2000], 'band', [c * .7, min(c * 1.45, 20000)])[-(b - a):]
    return out * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.2 if rise else 2.5) * (np.linspace(.4, 1, n) if rise else np.linspace(1, .4, n))

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (2.5 * t / dur)) / SR)
    return whoosh(dur, 200, 12000) * (t / dur) ** 1.5 + tone * (t / dur) ** 3 * .35

def pop(pitch=700):
    t = T(0.1)
    return np.sin(2 * np.pi * np.cumsum(pitch * np.exp(-t * 28) + 220) / SR) * np.exp(-t * 45)

def click():
    t = T(0.03)
    return filt(rng.standard_normal(len(t)), 'band', [2000, 6000]) * np.exp(-t * 200) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 150) * .5

def shimmer(dur=1.8, base=86, count=26):
    s = np.zeros(int((dur + 1.3) * SR))
    for _ in range(count):
        at = rng.uniform(0, dur); m = base + rng.choice([0, 2, 3, 5, 7, 10, 12, 14, 15, 17])
        b = np.sin(2 * np.pi * hz(m) * T(1.1)) * np.exp(-T(1.1) * 6)
        i = int(at * SR); s[i:i + len(b)] += b * rng.uniform(.3, 1)
    return s / count * 4

def notify():  # two-tone "message sent" chime
    return np.concatenate([bell(88, .18)[:int(.12 * SR)], bell(93, 1.2)])

# ---- Strings ------------------------------------------------------------------------------------

def peaking(x, f0, gain_db, q):
    """RBJ peaking EQ (the violin's body resonances)."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    bb = [1 + al * A, -2 * np.cos(w), 1 - al * A]; aa = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(np.array(bb) / aa[0], np.array(aa) / aa[0], x, axis=0)

def body(x, cello=False):
    """Wooden body: resonances, then the bridge roll-off."""
    peaks = [(110, 5, 1.2), (210, 4, 1.4), (380, 3, 2.0), (1200, 2, 1.5)] if cello else \
            [(290, 6, 1.6), (460, 4, 2.0), (1050, 3, 1.8), (2600, 4, 1.4), (3500, 2, 2.0)]
    for f0, g, q in peaks:
        x = peaking(x, f0, g, q)
    x = filt(x, 'high', 70 if cello else 190)
    return filt(x, 'low', 5000 if cello else 7500)

def bowed(m, dur, att=0.05, rel=0.18, vib=0.0045, bright=1.0, noise=0.05, rate=5.6, detune=0.0, ph=0.0):
    """One bowed note: band-limited sawtooth (the bow's stick-slip) with delayed vibrato and bow hiss."""
    t = T(dur + rel); f = hz(m + detune)
    v = 1 + vib * np.sin(2 * np.pi * rate * t + ph) * np.clip((t - 0.15) / 0.35, 0, 1) + 0.0008 * np.sin(2 * np.pi * 1.3 * t + ph)
    phase = 2 * np.pi * np.cumsum(f * v) / SR
    s = np.zeros(len(t))
    for k in range(1, 40):
        if f * k > 11000:
            break
        s += np.sin(k * phase) / k ** (1.05 / bright)
    s += filt(rng.standard_normal(len(t)), 'band', [2500, 7000]) * noise
    e = np.clip(t / att, 0, 1) ** 1.5 * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 4)))
    e *= 1 + 0.08 * np.clip(t / max(dur, .01), 0, 1)          # bow swell
    return s * e * 0.25

def pizz(m, dur=0.45):
    t = T(dur); f = hz(m)
    s = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.4 * np.exp(-t * (9 + 6 * k)) for k in range(1, 9))
    return s * np.clip(t / 0.0015, 0, 1) * 0.5

def section_strings(notes, dur, gain=1.0):
    """String section: several detuned players per note, slow attack."""
    out = np.zeros(int((dur + 0.4) * SR))
    for m in notes:
        for v in range(4):
            x = bowed(m, dur, att=0.18, rel=0.4, vib=0.004, bright=0.8, noise=0.02, rate=5.0 + v * 0.35,
                      detune=rng.uniform(-0.09, 0.09), ph=rng.uniform(0, 6.28))
            out[:len(x)] += x
    return out * gain / (len(notes) * 2.2)

# ---- Music: violin over a fast beat ---------------------------------------------------------------
# D minor: Dm – Bb – F – C, one chord per bar (bar = 2 grid seconds; 16 sixteenths of .125).
CH = [([50, 57, 62, 65, 69], 38), ([46, 53, 58, 62, 65], 34), ([45, 53, 57, 60, 65], 41), ([48, 55, 60, 64, 67], 36)]
# The violin theme, four bars: (start 16th, length in 16ths, midi note).
THEME = [
    [(0, 6, 81), (6, 2, 86), (8, 2, 84), (10, 2, 81), (12, 4, 77)],
    [(0, 4, 79), (4, 2, 77), (6, 2, 74), (8, 4, 77), (12, 2, 79), (14, 2, 81)],
    [(0, 6, 81), (6, 2, 84), (8, 4, 89), (12, 2, 88), (14, 2, 84)],
    [(0, 6, 86), (6, 2, 84), (8, 2, 82), (10, 2, 81), (12, 4, 79)],
]
S16 = BEAT / 4

def section(t):
    if t < 4: return 'intro'
    if t < 22: return 'A'
    if t < 34: return 'B'
    if t < 38: return 'build'
    if t < 41.5: return 'drop'
    return 'end'

violin, strings, cello = buf(), buf(), buf()

def play_violin(start, length16, m, gain, pan=0.1, accent=False):
    dur = length16 * S16 * K
    add(violin, start, bowed(m, dur * 0.96, att=0.02 if accent else 0.045, bright=1.15 if accent else 1.0), gain, pan)

# Intro: a lone violin, long notes, then a rising run into the drop.
play_violin(0.2, 14, 81, .55)
play_violin(2.0, 8, 86, .5)
for i, m in enumerate([74, 76, 77, 79, 81, 82, 84, 86]):
    play_violin(3.0 + i * S16, 1, m, .45 + i * .03, accent=True)
add(strings, 0.0, section_strings([50, 57, 62], 4.0 * K), .5)

for bar in range(2, 21):
    start = bar * BAR; sec = section(start)
    if sec == 'end':
        break
    notes, root = CH[bar % 4]
    phrase = THEME[(bar - 2) % 4]
    # Strings section under everything (fuller in B and the drop).
    if sec != 'build':
        add(strings, start, section_strings(notes[1:], BAR * K * 0.98, 1.0 if sec == 'A' else 1.25), .55)
    # The theme on solo violin; a second violin a sixth below in B and the drop.
    if sec in ('A', 'B', 'drop'):
        for st, ln, m in phrase:
            play_violin(start + st * S16, ln, m, .62 if sec != 'drop' else .72, accent=st % 4 == 0)
            if sec in ('B', 'drop'):
                play_violin(start + st * S16, ln, m - 9 + (1 if (m - 9) % 12 in (1, 6) else 0), .32, pan=-.35)
            if sec == 'drop':
                play_violin(start + st * S16, ln, m - 12, .28, pan=.35)
    # Pizzicato 16ths in B and the drop.
    if sec in ('B', 'drop'):
        arp = [notes[2] + 12, notes[3] + 12, notes[4] + 12, notes[3] + 12]
        for k in range(16):
            add(strings, start + k * S16, pizz(arp[k % 4] + (12 if k % 8 >= 4 else 0)), .16, pan=(-.5 if k % 2 else .5))
    # Cello: driving off-beat spiccato (every 8th in the drop).
    if sec in ('A', 'B', 'drop'):
        for k in range(8):
            if k % 2 == 1 or sec == 'drop':
                add(cello, start + k * BEAT / 2, bowed(root + (12 if k == 7 else 0), 0.16 * K, att=0.008, rel=0.08, vib=0, bright=1.2, noise=0.08), .9)
    # Build: violins tremolo (32nds), climbing a step each half bar, strings swell.
    if sec == 'build':
        climb = [74, 76, 77, 79, 81, 82, 84, 86]
        for h in range(4):
            seg = start + h * BEAT
            m = climb[(bar - 17) * 4 + h]
            for q in range(8):
                add(violin, seg + q * BEAT / 8, bowed(m, BEAT / 8 * K * 0.9, att=0.006, rel=0.03, vib=0, bright=1.2, noise=0.08), .3 + .1 * h + .25 * (bar - 17), pan=.1)
                add(violin, seg + q * BEAT / 8, bowed(m - 12, BEAT / 8 * K * 0.9, att=0.006, rel=0.03, vib=0, noise=0.08), .2 + .05 * h, pan=-.3)
        add(strings, start, section_strings(notes[1:], BAR * K, .9 + .5 * (bar - 17)), .55)
        add(cello, start, bowed(root, BAR * K * 0.95, att=0.3, rel=0.2, vib=0.003), .6)

# Final: one long chord, the violin holds the top D, then a clean stop at 41.5.
add(strings, 41.5, section_strings([50, 57, 62, 65, 69, 74], 0.6 * K, 1.4), .6)
add(violin, 41.5, bowed(86, 0.5 * K, att=0.01, rel=1.2, bright=1.2), .7)
add(cello, 41.5, bowed(38, 0.5 * K, att=0.01, rel=1.0), .9)
add(fx, 41.5, impact(1.5), .5)

# Drums.
for k in range(int(DUR / BEAT)):
    at = k * BEAT; sec = section(at)
    if sec in ('A', 'B', 'drop'):
        add(drums, at, kick(), .9)
        if k % 2 == 1:
            add(drums, at, clap(), .45, pan=.05)
        add(drums, at + BEAT / 2, hat(True), .14, pan=.25)
        if sec != 'A' or at >= 8:
            for q in range(4):
                add(drums, at + q * BEAT / 4, hat(), .07 if q % 2 else .1, pan=-.3)
# Fills into the cuts at 22 and 30, and the build's snare roll (8ths → 16ths → 32nds).
for c in (22, 30):
    for q in range(4):
        add(drums, c - .5 + q * .125, snare(), .25 + q * .05)
roll = []
t_ = 34.0
while t_ < 38:
    roll.append(t_)
    t_ += .25 if t_ < 36 else .125 if t_ < 37.5 else .0625
for i, at in enumerate(roll):
    add(drums, at, snare(), .12 + .3 * (at - 34) / 4, pan=.1)
for at in np.arange(34, 37, BEAT):          # half-time kick under the build
    add(drums, at, kick(), .6)
add(fx, 34.0, riser(4.0 * K), .55)
# Intro: filtered riser and snare roll into the first drop.
add(fx, 1.0, riser(3.0 * K), .45)
for i, at in enumerate(np.arange(3.0, 4.0, .125)):
    add(drums, at, snare(), .1 + i * .03)
# The drops.
for d in (4.0, 38.0):
    add(drums, d, crash(), .35); add(fx, d, impact(), .7)

# ---- Sound effects on the picture --------------------------------------------------------------
add(fx, 0.1, shimmer(1.8, 86, 30), .16)                    # monogram draws in gold
add(fx, 2.0, whoosh(.8, 2000, 9000), .14, .4)               # wordmark unveiled
add(fx, 4.5, shimmer(1.0, 91, 14), .1)                      # gold frame
for c in (8, 14, 18, 22, 26, 30, 34):                       # whoosh into every cut
    add(fx, c - .35, whoosh(.5, 400, 8000), .35, (-.4 if c % 4 else .4))
for at in (9, 10, 11):                                      # trays swing in and land
    add(fx, at - .5, whoosh(.5, 3000, 300, rise=False), .3, .6)
    add(fx, at, impact(.6), .25)
add(fx, 11.5, whoosh(.5, 400, 3000), .25)                   # fan out
add(fx, 14.4, pop(500), .5)                                 # chocolate orb
for i in range(6):                                          # fillings fire out
    at = 15.0 + i * .25
    add(fx, at, pop(900 + i * 120), .3, pan=[0, .6, .6, 0, -.6, -.6][i]); add(fx, at, bell([74, 77, 81, 79, 84, 86][i], .8), .12)
add(fx, 18.0, whoosh(2.2, 200, 1200), .18, -.3)             # events wall streams past
add(fx, 20.0, impact(1.2), .35)                             # ballroom opens
for i in range(4):                                          # event-type chips
    add(fx, 22.5 + i * .25, pop(700 + i * 100), .3, pan=[-.4, .4, -.4, .4][i])
add(fx, 23.75, click(), .6); add(fx, 23.75, bell(86, 1), .18)   # "Engagement" chosen
for at in (24.0, 24.5, 25.0):                               # date flips
    add(fx, at, whoosh(.18, 1500, 6000), .25); add(fx, at + .05, click(), .4)
for k in range(24):                                         # guests count up
    add(fx, 24.25 + k * 0.042, click(), .18 * (1 - k / 30), pan=.3)
steps = [(26 + a, i) for i, ats in enumerate([[1.0, 1.25, 1.5, 1.75], [2.0, 2.125, 2.25, 2.375, 2.5], [3.0], [3.5]]) for a in ats]
for j, (at, i) in enumerate(steps):                         # steppers tick up
    add(fx, at, click(), .45); add(fx, at, pop(600 + j * 60), .22)
add(fx, 30.3, whoosh(.6, 3000, 300, rise=False), .3)        # table tilts down
scale = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91, 93, 96]
for i in range(15):                                         # desserts pop on the table
    at = 31.0 + i * .125
    add(fx, at, pop(800), .28, pan=np.sin(i * 1.7) * .5); add(fx, at + .01, bell(scale[i], .7), .1, pan=np.sin(i * 1.7) * .5)
add(fx, 33.0, pop(600), .35); add(fx, 33.5, click(), .6)    # "Request a quote" appears, is pressed
add(fx, 34.3, pop(600), .35); add(fx, 34.75, click(), .6)   # "Send on WhatsApp"
add(fx, 35.0, whoosh(.3, 800, 6000), .3); add(fx, 35.1, notify(), .22)   # message sent
add(fx, 35.5, whoosh(.5, 3000, 300, rise=False), .35)       # quote slides up
for i in range(4):
    add(fx, 35.75 + i * .125, click(), .3)
add(fx, 36.75, click(), .7)                                 # accept & pay deposit
add(fx, 37.25, impact(1.2), .6); add(fx, 37.25, crash(1.2), .2)  # BOOKING CONFIRMED stamp
add(fx, 38.1, shimmer(2.5, 86, 36), .14)                    # end card sparkle
add(fx, 38.5, whoosh(.6, 1500, 9000), .18)

# ---- Mix ---------------------------------------------------------------------------------------
def reverb(x, seconds, mix, damp):
    n = int(seconds * SR)
    ir = filt(rng.standard_normal((n, 2)) * np.exp(-np.linspace(0, 7, n))[:, None], 'low', damp)
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    wet *= (np.max(np.abs(x)) + 1e-9) / (np.max(np.abs(wet)) + 1e-9)
    return x * (1 - mix) + wet * mix

# Sidechain: the strings and cello breathe with every kick in the groove.
tt = np.arange(N) / SR / K          # grid time
duck = np.ones(N)
for a, b in ((4, 34), (38, 41.5)):
    m = (tt >= a) & (tt < b)
    duck[m] = 1 - 0.75 * np.exp(-((tt[m] - a) % BEAT) * 12)
m = (tt >= 34) & (tt < 37)
duck[m] = 1 - 0.5 * np.exp(-((tt[m] - 34) % BEAT) * 12)
violin = body(violin); strings = body(strings); cello = body(cello, cello=True)
strings *= (0.55 + 0.45 * duck)[:, None]; cello *= (0.5 + 0.5 * duck)[:, None]
violin = reverb(violin, 2.4, .3, 7000)
strings = reverb(strings, 2.6, .4, 6000)
cello = reverb(cello, 1.2, .15, 5000)
fx = reverb(fx, 1.4, .2, 8000)
sub = buf()                                   # a little sub under the cello for weight on phones/speakers
for bar in range(2, 21):
    start = bar * BAR; sec = section(start)
    if sec in ('A', 'B', 'drop'):
        for k in range(1, 8, 2):
            add(sub, start + k * BEAT / 2, np.sin(2 * np.pi * hz(CH[bar % 4][1]) * T(.2 * K)) * np.exp(-T(.2 * K) * 6), .35)
norm = lambda x: x / (np.max(np.abs(x)) + 1e-9)
ref = np.max(np.abs(drums)) + 1e-9               # drums and effects keep their relative levels
mix = drums / ref * .5 + fx / ref * .55 + norm(violin) * .62 + norm(strings) * .32 + norm(cello) * .4 + norm(sub) * .2
mix = filt(mix, 'high', 28)
mix *= np.clip((N - np.arange(N)) / (0.25 * SR), 0, 1)[:, None]
mix /= np.max(np.abs(mix))
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix /= np.max(np.abs(mix)) / 0.9
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', SR, (mix * 32767).astype(np.int16))
