# -*- coding: utf-8 -*-
"""자리표시용 BGM 합성 — 파이프라인 검증용. 실제 발행에는 YouTube 오디오 보관함 트랙을 쓸 것.

앰비언트 패드(Am–F–C–G 루프) + 서브 베이스 + 소프트 아르페지오, 48초.
사용: .venv/bin/python3 scripts/make-placeholder-bgm.py
출력: assets/bgm/placeholder_ambient.m4a
"""
import subprocess
from pathlib import Path

import numpy as np

SR = 44100
BPM = 84
BEAT = 60 / BPM
BAR = BEAT * 4
CHORDS = [  # (루트Hz 기준 미디 노트) Am, F, C, G — 각 2마디
    [57, 60, 64],  # A3 C4 E4
    [53, 57, 60],  # F3 A3 C4
    [48, 52, 55, 60],  # C3 E3 G3 C4
    [55, 59, 62],  # G3 B3 D4
]
LOOPS = 3  # (4코드 × 2마디) × 3 = 24마디 ≈ 68초? → 2마디/코드 = 8마디/루프


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def adsr(n, a, d, s_level, r):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    return np.concatenate(
        [
            np.linspace(0, 1, a_n),
            np.linspace(1, s_level, d_n),
            np.full(s_n, s_level),
            np.linspace(s_level, 0, r_n),
        ]
    )[:n]


def pad_chord(notes, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = midi_hz(m)
        for mult, amp in [(1, 1.0), (2, 0.25), (0.5, 0.35)]:
            # 살짝 디튠한 두 오실레이터 — 패드 질감
            out += amp * np.sin(2 * np.pi * f * mult * 1.002 * t)
            out += amp * np.sin(2 * np.pi * f * mult * 0.998 * t)
    return out / len(notes) * adsr(n, 1.2, 0.5, 0.8, 1.5)


def bass(notes, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi_hz(min(notes) - 12)
    return np.sin(2 * np.pi * f * t) * adsr(n, 0.05, 0.3, 0.6, 0.8) * 0.9


def arp(notes, dur):
    out = np.zeros(int(dur * SR))
    step = BEAT / 2  # 8분음표
    seq = [notes[i % len(notes)] + 12 for i in range(int(dur / step))]
    for i, m in enumerate(seq):
        start = int(i * step * SR)
        n = int(step * SR * 0.9)
        if start + n > len(out):
            break
        t = np.arange(n) / SR
        tone = np.sin(2 * np.pi * midi_hz(m) * t) * adsr(n, 0.01, 0.1, 0.3, 0.15)
        out[start : start + n] += tone * 0.35
    return out


def lowpass(x, alpha=0.15):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # 단순 1차 IIR
        acc += alpha * (v - acc)
        y[i] = acc
    return y


segments = []
for _ in range(LOOPS):
    for chord in CHORDS:
        dur = BAR * 2
        seg = pad_chord(chord, dur) * 0.5 + bass(chord, dur) * 0.4 + arp(chord, dur)
        segments.append(seg)
mono = np.concatenate(segments)
mono = lowpass(mono, 0.25)
mono = mono / np.max(np.abs(mono)) * 0.5  # 헤드룸

# 좌우 살짝 다른 딜레이로 스테레오 폭
delay = int(0.013 * SR)
left = mono
right = np.concatenate([np.zeros(delay), mono[:-delay]])
stereo = np.stack([left, right], axis=1)

out_dir = Path(__file__).resolve().parent.parent / "assets" / "bgm"
out_dir.mkdir(parents=True, exist_ok=True)
wav = out_dir / "_tmp.wav"
m4a = out_dir / "placeholder_ambient.m4a"

pcm = (stereo * 32767).astype(np.int16)
import wave

with wave.open(str(wav), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", "-b:a", "160k", str(m4a)], check=True)
wav.unlink()
print(f"완료: {m4a} ({len(mono)/SR:.1f}초)")
