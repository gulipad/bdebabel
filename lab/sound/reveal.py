"""
The sound of the cover's reveal, synthesised: a deep hum that swells as the plan melts in, a rubbed, slightly
wrong ring as the clearing's words begin, a bloom when the title arrives, and a long settling tail.

Timed to the cover (seconds from load, the order /portada plays in):
    0.8   the paper is there; the plan starts to melt in
    3.6   the clearing's words start to stream
    4.5   the title starts to melt in
    6.5   the title is in; the ways and the first bands follow
    14    silence

Writes three variants to app/static/sound/: zumbido (hum and bowl), vertigo (darker, bending), aliento (airier).
Run: python3 lab/sound/reveal.py [--length 20] [--only vertigo] [--out DIR]
"""

import argparse
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

ARGS = argparse.ArgumentParser()
ARGS.add_argument("--length", type=float, default=14.0, help="seconds (the tail stretches to fill them)")
ARGS.add_argument("--only", help="one variant: zumbido, vertigo or aliento")
ARGS.add_argument("--cues", help="plan,words,title,title_in in seconds, to fit another timing (a recording's)")
ARGS.add_argument("--outro", type=float, help="seconds at which everything melts away, for a loop")
ARGS.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "app" / "static" / "sound")
OPTS = ARGS.parse_args()

SR = 48000
LENGTH = OPTS.length
PLAN, WORDS, TITLE, TITLE_IN = map(float, OPTS.cues.split(",")) if OPTS.cues else (0.8, 3.6, 4.5, 6.5)
OUTRO = OPTS.outro
OUT = OPTS.out

t = np.arange(int(SR * LENGTH)) / SR
rng = np.random.default_rng(1941)


def curve(points):
    """A smooth envelope through (time, level) points: linear between them, then eased with a short lowpass."""
    xs, ys = zip(*points)
    e = np.interp(t, xs, ys)
    b, a = signal.butter(1, 3 / (SR / 2))
    return signal.filtfilt(b, a, e)


def tone(f, phase=0.0):
    """A sine whose frequency may change over time (f: a number or an array the length of t)."""
    f = np.broadcast_to(np.asarray(f, dtype=float), t.shape)
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def noise(lo, hi, order=2):
    """Band-limited noise between lo and hi Hz (lo 0: lowpass)."""
    x = rng.standard_normal(t.size)
    sos = (
        signal.butter(order, hi / (SR / 2), "low", output="sos")
        if lo <= 0
        else signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band", output="sos")
    )
    y = signal.sosfilt(sos, x)
    return y / (np.abs(y).max() + 1e-9)


def hum(f0, beat=0.25, sub=0.35):
    """The drone: a few harmonics of f0, a twin a hair out of tune (a slow wobble), a felt sub-octave, warmed."""
    x = sum(a * tone(f0 * k, k) for k, a in [(1, 1.0), (2, 0.45), (3, 0.16), (5, 0.05)])
    x += 0.6 * tone(f0 + beat, 2.0) + sub * tone(f0 / 2)
    return np.tanh(0.8 * x) / 1.2


def bowl(f, ratios=(1, 2.756, 5.404, 8.933), amps=(1, 0.5, 0.25, 0.12), shimmer=0.8, bend=None):
    """A rubbed bowl or glass: inharmonic partials, each with a twin slightly sharp so they beat and shimmer."""
    wobble = 1 + 0.0015 * np.sin(2 * np.pi * 4.3 * t)  # a faint vibrato, as a rubbing hand gives
    drift = 1 if bend is None else bend
    x = np.zeros_like(t)
    for i, (r, a) in enumerate(zip(ratios, amps)):
        fr = f * r * wobble * drift
        x += a * (tone(fr, i) + 0.7 * tone(fr + shimmer * (1 + i * 0.3), i + 1))
    return x / sum(amps) / 1.7


def bloom(f_from, f_to, at, decay=2.5):
    """A soft, falling low swell at `at`: the moment something arrives."""
    k = np.clip((t - at) / 0.9, 0, 1)
    f = f_from + (f_to - f_from) * k
    env = np.where(t < at, np.exp((t - at) / 0.35), np.exp(-(t - at) / decay))
    return tone(f) * env


def reverse_swell(at, length=1.8, lo=180, hi=2600):
    """Noise that rises into `at` and stops, like a reverb played backwards."""
    env = np.where((t > at - length) & (t <= at), np.exp((t - at) / (length / 4)), 0.0)
    return noise(lo, hi) * env


def reverb(x, seconds=3.5, tone_hz=3500, seed=0):
    """A plain hall: convolution with decaying, darkened noise; a different tail per channel."""
    r = np.random.default_rng(seed)
    n = int(SR * seconds)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 5))
    ir = signal.sosfilt(signal.butter(2, tone_hz / (SR / 2), output="sos"), ir)
    ir /= np.sqrt((ir**2).sum())
    return signal.fftconvolve(x, ir)[: x.size]


def master(left, right, wet=0.35, name=""):
    """Reverb, a fade at both ends, and a peak of -1 dBFS; written as 24-bit stereo."""
    L = (1 - wet) * left + wet * reverb(left, seed=1)
    R = (1 - wet) * right + wet * reverb(right, seed=2)
    fade = np.clip(t / 0.05, 0, 1) * np.clip((LENGTH - t) / 1.5, 0, 1)
    st = np.stack([L * fade, R * fade], axis=1)
    st *= 10 ** (-1 / 20) / np.abs(st).max()
    OUT.mkdir(parents=True, exist_ok=True)
    wavfile.write(OUT / f"{name}.wav", SR, (st * (2**31 - 1)).astype(np.int32))
    print(name, f"{LENGTH:.0f} s", "rms", f"{20 * np.log10(np.sqrt((st**2).mean())):.1f} dBFS")


# the shapes the three share: the hum swells with the melt and settles; the ring is rubbed up with the words
# for a loop, everything sinks away from the outro to silence at the end
swell = curve(
    [(0, 0), (PLAN, 0), (TITLE, 0.55), (TITLE_IN, 1.0), (TITLE_IN + 3.5, 0.6)]
    + ([(OUTRO, 0.55), (LENGTH - 0.3, 0)] if OUTRO else [(LENGTH, 0.35)])
)
rubbed = curve(
    [(0, 0), (WORDS, 0), (TITLE_IN, 1.0), (TITLE_IN + 2, 0.55)]
    + ([(OUTRO, 0.4), (LENGTH - 0.8, 0), (LENGTH, 0)] if OUTRO else [(LENGTH, 0.15)])
)
melting = curve([(0, 0), (PLAN, 0.0), (2.5, 1.0), (5.5, 0.7), (7, 0), (LENGTH, 0)])


def zumbido():
    """Hum and bowl: E1 below, a bowl a tritone off (A#4) above, a bloom as the title arrives."""
    low = hum(41.2)
    rumble = noise(0, 110)
    ring_l = bowl(466.2)
    ring_r = bowl(466.2 * 1.002, shimmer=0.95)
    air = noise(3500, 9000) * melting
    arrive = bloom(62, 41.2, TITLE_IN)  # no swell of noise into it: the low bloom alone
    L = swell * (0.62 * low + 0.18 * rumble) + 0.16 * rubbed * ring_l + 0.025 * air + 0.22 * arrive
    R = swell * (0.62 * low + 0.18 * rumble) + 0.16 * rubbed * ring_r + 0.025 * air + 0.22 * arrive
    master(L, R, name="zumbido")


def vertigo():
    """Darker: a tritone inside the hum, a slow breathing, and a ring that bends down once the title is in."""
    breathe = 1 + 0.18 * np.sin(2 * np.pi * 0.17 * t)
    low = (hum(36.7) + 0.45 * hum(51.9, beat=0.4, sub=0)) * breathe  # D1 and the G#1 a tritone above
    rumble = noise(0, 90)
    bend = 1 - 0.035 * np.clip((t - TITLE_IN) / 6, 0, 1) ** 1.5
    tremble = 1 + 0.25 * np.sin(2 * np.pi * 5.5 * t) * rubbed
    ring_l = bowl(415.3, bend=bend) * tremble
    ring_r = bowl(415.3 * 1.003, shimmer=1.1, bend=bend) * tremble
    arrive = bloom(55, 36.7, TITLE_IN, decay=3.2)  # the low bloom alone
    L = swell * (0.6 * low + 0.22 * rumble) + 0.17 * rubbed * ring_l + 0.26 * arrive
    R = swell * (0.6 * low + 0.22 * rumble) + 0.17 * rubbed * ring_r + 0.26 * arrive
    master(L, R, wet=0.42, name="vertigo")


def aliento():
    """Airier: a thinner hum, a breath of noise that brightens as the plan melts in, a high glass ring."""
    low = hum(46.2, beat=0.18, sub=0.2)  # F#1
    centre = 250 + 1300 * np.clip((t - PLAN) / (TITLE_IN - PLAN), 0, 1)
    breath = np.zeros_like(t)
    hop = SR // 20
    raw = rng.standard_normal(t.size)
    for i in range(0, t.size, hop):  # a band of noise whose centre rises with the melt, in short frames
        c = centre[min(i, t.size - 1)]
        sos = signal.butter(2, [c * 0.6 / (SR / 2), c * 1.6 / (SR / 2)], "band", output="sos")
        seg = signal.sosfilt(sos, raw[max(0, i - hop) : i + hop])
        breath[i : i + hop] = seg[-hop:][: t.size - i] if i else seg[:hop]
    breath /= np.abs(breath).max()
    ring_l = bowl(1318.5, ratios=(1, 2.32, 4.25), amps=(1, 0.35, 0.12), shimmer=1.6)
    ring_r = bowl(1318.5 * 1.002, ratios=(1, 2.32, 4.25), amps=(1, 0.35, 0.12), shimmer=1.9)
    arrive = 0.6 * bloom(70, 46.2, TITLE_IN, decay=2.0) + 0.8 * reverse_swell(TITLE_IN, length=1.4, lo=600, hi=5000)
    L = swell * 0.5 * low + 0.2 * (melting + 0.3 * swell) * breath + 0.09 * rubbed * ring_l + 0.2 * arrive
    R = swell * 0.5 * low + 0.2 * (melting + 0.3 * swell) * breath + 0.09 * rubbed * ring_r + 0.2 * arrive
    master(L, R, wet=0.45, name="aliento")


if __name__ == "__main__":
    for make in (zumbido, vertigo, aliento):
        if OPTS.only in (None, make.__name__):
            make()
