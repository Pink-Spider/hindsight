# -*- coding: utf-8 -*-
"""합성 골든 픽스처 생성 — 실제 시세를 저장소에 커밋하지 않기 위한 테스트용 Spec.

시드 고정 기하 랜덤워크 2종목, 2020~2024 영업일 → 600포인트 균등 다운샘플.
사용: .venv/bin/python3 scripts/make-synthetic-fixture.py
출력: specs/golden_synthetic.json (결정적 — 항상 같은 내용)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MAX_POINTS = 600

rng = np.random.default_rng(42)
dates = pd.bdate_range("2020-01-02", "2024-12-30")
n = len(dates)

def walk(drift: float, vol: float, crash_at: float, crash_size: float) -> np.ndarray:
    """일간 기하 랜덤워크 + 초반 급락 이벤트 (코로나풍 드라마 재현)"""
    r = rng.normal(drift, vol, n)
    crash_idx = int(n * crash_at)
    r[crash_idx : crash_idx + 20] -= crash_size / 20
    v = 100 * np.exp(np.cumsum(r))
    return v * (100 / v[0])

alpha = walk(drift=0.0016, vol=0.030, crash_at=0.03, crash_size=0.45)  # 고변동 성장주풍
beta = walk(drift=0.0005, vol=0.011, crash_at=0.03, crash_size=0.35)   # 시장지수풍

keep = np.unique(np.round(np.linspace(0, n - 1, MAX_POINTS)).astype(int))
spec = {
    "specVersion": 1,
    "template": "line-race",
    "targetFps": 60,
    "maxPoints": MAX_POINTS,
    "timeline": {"hookSec": 1.5, "raceSec": 35.5, "endSec": 3.0, "warp": 0.6},
    "meta": {
        "title": "합성 데이터 픽스처",
        "contextLine": "테스트용 합성 랜덤워크 — 실제 시세 아님",
        "returnType": "price",
        "seedKrw": 10_000_000,
        "dataSource": "synthetic(seed=42)",
    },
    "axis": {"time": [d.strftime("%Y-%m-%d") for d in dates[keep]]},
    "series": [
        {"id": "ALPHA", "name": "알파", "color": "#76B900",
         "values": [round(float(v), 4) for v in alpha[keep]]},
        {"id": "BETA", "name": "베타", "color": "#5B8DEF",
         "values": [round(float(v), 4) for v in beta[keep]]},
    ],
}

out = ROOT / "specs" / "golden_synthetic.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
print(f"완료: {out} — ALPHA 최종 {alpha[-1]-100:+.1f}%, BETA 최종 {beta[-1]-100:+.1f}%")
