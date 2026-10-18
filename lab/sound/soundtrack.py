"""
The city's soundtrack: Vértigo's world (a low D with the tritone inside it, breathing, rubbed bowls slightly out
of tune) stretched into a slow loop to keep on while you read. Nothing arrives and nothing ends: bowls are rubbed
up and fade, the drone's colour turns from the tritone to a fifth and back, a low bloom rises now and then.

The loop is exact: every frequency is a whole number of cycles over its length, the noise and the hall are
circular, and every swell wraps around, so any stretch of LENGTH seconds of the file loops without a seam (the
player loops a window that starts past the codec's padding). The file carries a couple of seconds more than one
loop so that window fits.

Writes app/static/sound/biblioteca.mp3. Run: python3 lab/sound/soundtrack.py [--length 210] [--wav]
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

ARGS = argparse.ArgumentParser()
ARGS.add_argument("--length", type=float, default=210.0, help="seconds in one loop")
ARGS.add_argument("--wav", action="store_true", help="also keep the WAV next to the mp3")
ARGS.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "app" / "static" / "sound")
OPTS = ARGS.parse_args()

SR = 48000
LENGTH = OPTS.length
N = int(SR * LENGTH)
t = np.arange(N) / SR
rng = np.random.default_rng(1941)


def q(f):
    """f, moved to the nearest whole number of cycles in the loop (a 210 s loop moves it by < 0.003 Hz)."""
    return round(f * LENGTH) / LENGTH


def tone(f, phase=0.0, vib=0.0, vib_hz=4.3):
    """A sine at f (quantised), with a vibrato of `vib` (a fraction of f) as a rubbing hand gives."""
    f, vh = q(f), q(vib_hz)
    pm = (vib * f / vh) * np.sin(2 * np.pi * vh * t) if vib else 0
    return np.sin(2 * np.pi * f * t + phase + pm)


def lfo(hz, phase=0.0):
    """A slow wave between 0 and 1, whole cycles in the loop."""
    return 0.5 + 0.5 * np.sin(2 * np.pi * q(hz) * t + phase)


def noise(lo, hi):
    """Band-limited noise between lo and hi Hz, periodic (shaped in the frequency domain)."""
    spec = np.fft.rfft(rng.standard_normal(N))
    fr = np.fft.rfftfreq(N, 1 / SR)
    spec *= 1 / np.sqrt(1 + (fr / hi) ** 4) * (1 if lo <= 0 else 1 / np.sqrt(1 + (lo / np.maximum(fr, 1e-3)) ** 4))
    y = np.fft.irfft(spec, N)
    return y / np.abs(y).max()


def swell(at, rise, fall):
    """An envelope that swells to 1 at `at` (seconds) and sinks again, wrapped around the loop."""
    d = (t - at + LENGTH / 2) % LENGTH - LENGTH / 2
    k = np.where(d < 0, d / rise, d / fall)
    return np.exp(-(k**2))


def hum(f0, beat=0.25, sub=0.35):
    """The drone: a few harmonics of f0, a twin a hair out of tune (a slow wobble), a felt sub-octave, warmed."""
    x = sum(a * tone(f0 * k, k) for k, a in [(1, 1.0), (2, 0.45), (3, 0.16), (5, 0.05)])
    x += 0.6 * tone(f0 + beat, 2.0) + sub * tone(f0 / 2)
    return np.tanh(0.8 * x) / 1.2


def bowl(f, shimmer=0.8, ratios=(1, 2.756, 5.404, 8.933), amps=(1, 0.5, 0.25, 0.12)):
    """A rubbed bowl: inharmonic partials, each with a twin slightly sharp so they beat and shimmer."""
    x = np.zeros(N)
    for i, (r, a) in enumerate(zip(ratios, amps)):
        x += a * (tone(f * r, i, vib=0.0015) + 0.7 * tone(f * r + shimmer * (1 + i * 0.3), i + 1, vib=0.0015))
    return x / sum(amps) / 1.7


def bloom(f, at):
    """A low swell that rises and falls around `at`: the drone's floor opening for a moment."""
    return tone(f) * swell(at, 4, 9)


def hall(x, seconds=5.0, tone_hz=3200, seed=0):
    """A long, dark hall, convolved circularly so its tail wraps into the loop's start."""
    r = np.random.default_rng(seed)
    n = int(SR * seconds)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 5))
    ir = signal.sosfilt(signal.butter(2, tone_hz / (SR / 2), output="sos"), ir)
    ir /= np.sqrt((ir**2).sum())
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, N), N)


# the drone: D1 always, its colour turning slowly between the tritone (G#1, Vértigo's) and the fifth (A1)
breathe = 1 + 0.16 * np.sin(2 * np.pi * q(0.13) * t)
colour = lfo(1 / LENGTH, -np.pi / 2)  # 0 at the start: the tritone; 1 halfway: the fifth
drone = (hum(36.71) + 0.4 * (1 - colour) * hum(51.91, beat=0.4, sub=0) + 0.4 * colour * hum(55.0, beat=0.3, sub=0))
drone *= breathe * (0.85 + 0.15 * lfo(2 / LENGTH))
rumble = noise(0, 90) * (0.7 + 0.3 * lfo(3 / LENGTH, 1.0))
air = noise(2500, 7000) * lfo(5 / LENGTH, 2.0) ** 3

# the bowls: (seconds, Hz, pan -1..1, rise, fall), spread so one is always fading as another comes up
BOWLS = [
    (8, 415.30, -0.4, 6, 14),  # G#4, Vértigo's ring
    (31, 293.66, 0.5, 8, 16),  # D4
    (52, 554.37, -0.6, 7, 12),  # C#5, the leading tone, high and thin
    (74, 207.65, 0.2, 9, 18),  # G#3
    (97, 440.00, 0.6, 7, 15),  # A4, as the drone turns to the fifth
    (118, 349.23, -0.3, 8, 14),  # F4
    (141, 622.25, 0.4, 6, 12),  # D#5, a half step above the octave: the wrong note
    (163, 293.66, -0.5, 9, 16),  # D4 again
    (186, 415.30, 0.3, 7, 15),  # G#4, back towards the start
]
L = np.zeros(N)
R = np.zeros(N)
for at, f, pan, rise, fall in BOWLS:
    env = swell(at, rise, fall) * (1 + 0.2 * np.sin(2 * np.pi * q(5.5) * t) * swell(at, rise, fall))
    left, right = bowl(f), bowl(f * 1.003, shimmer=1.1)
    gl, gr = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    L += 0.13 * env * left * gl * 1.4
    R += 0.13 * env * right * gr * 1.4

# blooms where the drone deepens, three in a loop
for at in (44, 112, 176):
    b = bloom(q(55.0) if at == 112 else q(51.91), at)
    L += 0.16 * b
    R += 0.16 * b

bed = 0.55 * drone + 0.2 * rumble + 0.02 * air
L += bed
R += bed

# master: the hall, and a quiet level for a background (rms around -24 dBFS, peaks well under 0)
wet = 0.45
L = (1 - wet) * L + wet * hall(L, seed=1)
R = (1 - wet) * R + wet * hall(R, seed=2)
st = np.stack([L, R], axis=1)
st *= 10 ** (-24 / 20) / np.sqrt((st**2).mean())
peak = np.abs(st).max()
if peak > 10 ** (-3 / 20):
    st *= 10 ** (-3 / 20) / peak
print(f"{LENGTH:.0f} s loop", "rms", f"{20 * np.log10(np.sqrt((st**2).mean())):.1f} dBFS",
      "peak", f"{20 * np.log10(np.abs(st).max()):.1f} dBFS")

# the file: one loop plus 3 s of its own start, so a loop-long window past the codec's padding fits
full = np.concatenate([st, st[: 3 * SR]])
OPTS.out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / "biblioteca.wav"
    wavfile.write(wav, SR, (full * (2**31 - 1)).astype(np.int32))
    mp3 = OPTS.out / "biblioteca.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "160k",
                    str(mp3)], check=True)
    if OPTS.wav:
        wav.replace(OPTS.out / "biblioteca.wav")
print("wrote", mp3, f"{mp3.stat().st_size / 1e6:.1f} MB")
