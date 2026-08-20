# -*- coding: utf-8 -*-
"""P1 임시 스크립트 — Scene Spec v1 JSON 생성 (NVDA vs SPY).

P0의 데이터 경로를 재사용한다. P2에서 packages/spec-builder(TS)가 생기면 삭제.
다운샘플링: ADR-002 결정 2 — 균등 스트라이드, 첫/끝 포함, 전 시리즈 공유 인덱스.
사용: .venv/bin/python3 scripts/make-sample-spec.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "p0"))

import numpy as np
import pandas as pd
from render import END, START, TICKERS, fetch_one  # p0/render.py 재사용

MAX_POINTS = 600

raw = {sp.ticker: fetch_one(sp.ticker) for sp in TICKERS}
df = pd.DataFrame(raw).sort_index().ffill().dropna()
df = df[df.index >= pd.Timestamp(START)]  # 소스가 시작일 이전 행을 끼워주는 경우 제거
rebased = df / df.iloc[0] * 100.0

n = len(rebased)
if n > MAX_POINTS:
    idx = np.unique(np.round(np.linspace(0, n - 1, MAX_POINTS)).astype(int))
    rebased = rebased.iloc[idx]
    print(f"다운샘플링: {n} → {len(rebased)}포인트 (균등 스트라이드)")

spec = {
    "specVersion": 1,
    "template": "line-race",
    "targetFps": 60,
    "maxPoints": MAX_POINTS,
    "timeline": {"hookSec": 1.5, "raceSec": 35.5, "endSec": 3.0, "warp": 0.6},
    "meta": {
        "title": "2020년, 1,000만원을 넣었다면?",
        "contextLine": "코로나 폭락에서 AI 랠리까지 — 같은 5년, 다른 결말",
        "returnType": "price",
        "seedKrw": 10_000_000,
        "dataSource": "FinanceDataReader",
    },
    "axis": {"time": [d.strftime("%Y-%m-%d") for d in rebased.index]},
    "series": [
        {
            "id": sp.ticker,
            "name": sp.name,
            "color": sp.color,
            "values": [round(float(v), 4) for v in rebased[sp.ticker]],
        }
        for sp in TICKERS
    ],
}

out = ROOT / "specs" / "nvda_spy.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
print(f"완료: {out} ({len(rebased)}포인트, 시리즈 {len(spec['series'])}개)")
