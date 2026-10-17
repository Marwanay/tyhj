# Music and sound effects for the launch film, synthesised from scratch (no samples, no
# licensed music) and timed to the cues in launch.html.
#   python video/sound.py video/out/soundtrack.wav      (needs numpy + scipy)
# render.mjs muxes the result into the MP4.
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 34.0
N = int(SR * DUR)
rng = np.random.default_rng(11)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))

def t_(sec):
    return np.arange(int(sec * SR)) / SR

def add(buf, start, sig, gain=1.0, pan=0.0):
    """Mix a mono (or stereo) signal into buf at `start` seconds, panned -1..1."""
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        sig = np.stack([sig * l, sig * r], 1)
    buf[i:i + len(sig)] += sig * gain

def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x, axis=0)

def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)

def env(n, a, d, sustain=0.0, curve=6.0):
    """Attack (s) then exponential decay over the rest."""
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = np.exp(-curve * np.clip(t - a, 0, None) / max(d, 1e-4))
    return att * (sustain + (1 - sustain) * dec)

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

def reverb(x, seconds=2.6, mix=0.35, damp=4000):
    n = int(seconds * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-np.linspace(0, 7, n))[:, None]
    ir = lp(ir, damp)
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    wet /= np.max(np.abs(wet)) + 1e-9
    wet *= np.max(np.abs(x)) + 1e-9
    return x * (1 - mix) + wet * mix

# ---- Instruments ---------------------------------------------------------------------------
def piano(note, dur=2.4, vel=1.0):
    t = t_(dur); f = hz(note)
    s = sum(a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k)) * np.exp(-t * (1.6 + 0.9 * k))
            for k, a in [(1, 1.0), (2, 0.45), (3, 0.22), (4, 0.1), (5, 0.05)])
    s *= np.clip(t / 0.004, 0, 1)
    return s * vel

def pad(notes, dur, attack=1.2, release=1.4):
    t = t_(dur)
    s = np.zeros(len(t))
    for n in notes:
        for det in (-0.07, 0.0, 0.07):
            f = hz(n + det)
            s += np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.2 * t)) + 0.25 * np.sin(4 * np.pi * f * t)
    e = np.clip(t / attack, 0, 1) * np.clip((dur - t) / release, 0, 1)
    return lp(s * e, 2200) / (len(notes) * 3)

def bass(note, dur):
    t = t_(dur); f = hz(note)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return s * env(len(t), 0.01, dur, sustain=0.3, curve=2.5)

def kick():
    t = t_(0.5)
    f = 48 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)

def snap():  # soft clap / rim
    t = t_(0.25)
    return bp(rng.standard_normal(len(t)), 1200, 5200) * np.exp(-t * 26)

def hat(open_=False):
    t = t_(0.3 if open_ else 0.07)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (9 if open_ else 60))

def shaker():
    t = t_(0.12)
    return bp(rng.standard_normal(len(t)), 5000, 11000) * np.sin(np.pi * np.clip(t / 0.12, 0, 1)) ** 2

# ---- Sound effects -------------------------------------------------------------------------
def whoosh(dur=0.9, lo=300, hi=6000, rise=True):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 60
    for k in range(steps):  # sweep a band-pass across the noise
        a, b = k * n // steps, (k + 1) * n // steps
        frac = k / steps if rise else 1 - k / steps
        c = lo * (hi / lo) ** frac
        out[a:b] = bp(noise[max(0, a - 2000):b], c * 0.7, min(c * 1.4, 20000))[-(b - a):]
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return out * shape

def shimmer(dur=1.8, base=84, count=26):
    s = np.zeros(int((dur + 1.5) * SR))
    for k in range(count):
        at = rng.uniform(0, dur)
        note = base + rng.choice([0, 2, 4, 7, 9, 12, 14, 16, 19])
        tone = np.sin(2 * np.pi * hz(note) * t_(1.2)) * np.exp(-t_(1.2) * 5)
        i = int(at * SR); s[i:i + len(tone)] += tone * rng.uniform(.3, 1)
    return s / count * 4

def chime(note, dur=1.6):
    t = t_(dur); f = hz(note)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9)
    return s * np.exp(-t * 3.2) * np.clip(t / 0.002, 0, 1)

def pop():
    t = t_(0.12)
    f = 900 * np.exp(-t * 30) + 260
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)

def pluck(note):
    t = t_(0.9); f = hz(note)
    s = sum(np.sin(2 * np.pi * f * k * t) / k * np.exp(-t * (5 + 3 * k)) for k in range(1, 6))
    return s

def boom(dur=2.4):
    t = t_(dur)
    f = 38 + 50 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    return s + lp(rng.standard_normal(len(t)), 400) * np.exp(-t * 6) * 0.4

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = whoosh(dur, 200, 9000) * (t / dur) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / dur)) / SR) * (t / dur) ** 3 * 0.25
    return s + tone

def tick():
    t = t_(0.04)
    return hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 120)

# ---- Music: D major, 96 bpm, warm and elegant ------------------------------------------------
BPM = 96; BEAT = 60 / BPM; BAR = 4 * BEAT
# Chords (pad voicings) and their roots, one per bar: Dmaj9 · Bm9 · Gmaj7 · A6sus
CHORDS = [([62, 66, 69, 73, 76], 38), ([59, 62, 66, 69, 73], 35), ([55, 59, 62, 66, 71], 31), ([57, 62, 64, 66, 69], 33)]
bars = int(np.ceil(DUR / BAR))
for b in range(bars):
    start = b * BAR
    notes, root = CHORDS[b % 4]
    if start >= 30.5:  # end card: one long resolving chord instead
        break
    add(music, start, pad(notes, BAR + 1.2), 0.20, 0)
    if start >= 6.0:
        add(music, start, bass(root, BAR * .5), 0.30)
        add(music, start + BAR * .625, bass(root, BAR * .3), 0.22)
    # Piano arpeggio, gentle at first, fuller from the collection on.
    arp = [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[4] + 12, notes[3] + 12, notes[2] + 12, notes[4] + 12, notes[2] + 24]
    for k, n in enumerate(arp):
        at = start + k * BEAT / 2
        if at < 1.5 and k % 2:
            continue
        add(music, at, piano(n, 2.2, 0.5 if start < 6 else 0.62), 0.16, pan=(-0.35 if k % 2 else 0.35))

# Beat from the Collection (6.4 s) to the end card; lifts at the dessert table.
first = int(np.ceil(6.4 / BEAT))
for k in range(first, int(29.0 / BEAT)):
    at = k * BEAT
    if k % 4 == 0:
        add(music, at, kick(), 0.55)
    if k % 4 == 2:
        add(music, at, kick(), 0.32); add(music, at, snap(), 0.10, pan=0.1)
    if k % 2 == 1:
        add(music, at, snap(), 0.16, pan=-0.1)
    add(music, at, shaker(), 0.07, pan=0.4)
    add(music, at + BEAT / 2, shaker(), 0.05, pan=-0.4)
    if at >= 20.2:
        add(music, at + BEAT / 2, hat(), 0.07, pan=0.3)
        if k % 4 == 3:
            add(music, at + BEAT / 2, hat(True), 0.05, pan=-0.3)
# A breath before the events wall, then back in.
music[int(15.0 * SR):int(15.3 * SR)] *= np.linspace(1, 0.35, int(0.3 * SR))[:, None]

# End card: resolving Dmaj9 with a bell melody.
add(music, 29.1, pad([50, 57, 62, 66, 69, 73, 76], 5.2, attack=0.3, release=2.8), 0.30)
add(music, 29.1, bass(38, 4.5), 0.35)
for k, n in enumerate([81, 78, 76, 74, 81, 86]):
    add(music, 29.5 + k * 0.42, chime(n, 2.4), 0.10, pan=(-0.3 if k % 2 else 0.3))

# ---- Sound effects on the picture cues -----------------------------------------------------
add(sfx, 0.05, shimmer(1.9, 84, 30), 0.12, 0)                     # monogram draws in gold
add(sfx, 1.15, whoosh(1.1, 400, 5000), 0.10, 0)                   # gold fill
add(sfx, 1.45, whoosh(1.0, 2000, 9000), 0.08, 0.4)                # wordmark unveiled
add(sfx, 2.85, whoosh(1.0, 150, 4000), 0.32, 0)                   # circle of light opens
add(sfx, 3.75, boom(2.2), 0.42, 0)                                # the tray lands
add(sfx, 3.8, shimmer(1.2, 88, 14), 0.09, 0)                      # gold frame draws
add(sfx, 6.3, whoosh(0.9, 200, 6000), 0.30, -0.2)                 # ivory wipe up
for k, at in enumerate([7.3, 8.35, 9.4]):                          # trays swing in from the right
    add(sfx, at - 0.1, whoosh(0.8, 300, 3500, rise=False), 0.26, 0.6)
    add(sfx, at + 0.55, chime(74 + 4 * k, 1.2), 0.06, 0)
add(sfx, 10.2, whoosh(0.9, 500, 4000), 0.18, 0)                   # fan out
add(sfx, 11.1, whoosh(0.9, 150, 5000), 0.30, 0)                   # circle into fillings
add(sfx, 11.55, pop(), 0.30); add(sfx, 11.55, chime(69, 1.8), 0.08)   # chocolate orb
for i in range(6):                                                 # six fillings fly out
    add(sfx, 12.3 + i * 0.18, pluck([74, 76, 78, 81, 83, 86][i]), 0.13, pan=[-0.0, .5, .5, 0, -.5, -.5][i])
    add(sfx, 12.3 + i * 0.18, tick(), 0.10)
add(sfx, 15.2, whoosh(1.2, 120, 7000), 0.34, 0.5)                 # events wall slides in
add(sfx, 15.6, whoosh(3.4, 300, 1200), 0.10, -0.3)                # streaming past
add(sfx, 18.45, whoosh(1.0, 3000, 300, rise=True), 0.20, 0)       # ballroom opens
add(sfx, 18.95, boom(1.8), 0.28)
add(sfx, 20.1, whoosh(0.9, 150, 5000), 0.30, 0)                   # circle into the table
add(sfx, 20.6, whoosh(0.9, 200, 2500, rise=False), 0.18, 0)       # table tilts down
scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93, 95]
for i in range(15):                                                # each dessert pops on
    at = 21.35 + i * 0.25
    add(sfx, at, pop(), 0.22, pan=np.sin(i * 1.3) * 0.5)
    add(sfx, at + 0.03, chime(scale[i], 1.1), 0.07, pan=np.sin(i * 1.3) * 0.5)
add(sfx, 25.35, chime(86, 2), 0.10); add(sfx, 25.35, pop(), 0.2)   # "Send for a quote"
add(sfx, 25.7, whoosh(0.9, 150, 5000), 0.30, 0)                   # circle into the phone
add(sfx, 26.1, whoosh(1.1, 200, 3000, rise=False), 0.26, 0)       # phone swings up
for i in range(4):                                                 # labels appear
    add(sfx, 26.8 + i * 0.35, pop(), 0.16, pan=[-.6, .6, -.6, .6][i])
add(sfx, 27.0, whoosh(2.4, 400, 2000), 0.06, 0)                   # page scrolls
add(sfx, 27.3, riser(1.8), 0.20, 0)                                # rise into the end card
add(sfx, 29.1, boom(3.0), 0.38, 0)
add(sfx, 29.3, shimmer(2.6, 86, 34), 0.10, 0)                     # monogram & logo sparkle

# ---- Mix ---------------------------------------------------------------------------------
music = reverb(music, 2.8, 0.30, 5000)
sfx = reverb(sfx, 1.8, 0.22, 7000)
mix = music * 0.9 + sfx
fade_in = np.clip(np.arange(N) / (0.4 * SR), 0, 1)
fade_out = np.clip((N - np.arange(N)) / (2.2 * SR), 0, 1)
mix *= (fade_in * fade_out)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)          # gentle glue / limiting
mix /= np.max(np.abs(mix)) / 0.89                # peak about -1 dBFS
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', SR, (mix * 32767).astype(np.int16))
