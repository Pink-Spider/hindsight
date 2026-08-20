# -*- coding: utf-8 -*-
"""P0 — 연출 감각 확보용 PoC. 버릴 코드다. 아키텍처 없음.

NVDA vs SPY (2020~2024) 라인 레이스 → 1080×1920 세로 mp4.

사용법:
    python p0/render.py --check    # 데이터만 받아서 요약 출력 (렌더 없음)
    python p0/render.py --preview  # 540×960 / 30fps 빠른 프리뷰
    python p0/render.py            # 1080×1920 / 60fps 풀 렌더
"""

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.animation import FFMpegWriter
from matplotlib.ticker import FuncFormatter

# ──────────────────────────── 하드코딩 설정 ────────────────────────────

@dataclass
class Series:
    ticker: str
    name: str
    color: str

TICKERS = [
    Series("NVDA", "엔비디아", "#76B900"),
    Series("SPY", "S&P 500", "#5B8DEF"),
]
START, END = "2020-01-01", "2024-12-31"
SEED_KRW = 10_000_000  # 훅: "1,000만원을 넣었다면?"

HOOK_SEC, RACE_SEC, END_SEC = 1.5, 35.5, 3.0

BG = "#0B0F1A"
FG = "#E8ECF4"
MUTED = "#8A93A6"

# y축 easing 튜닝 노브 — "아마추어/프로를 가르는 지점"
YLIM_TAU_SEC = 0.6   # EMA 시정수(초). 작을수록 축이 민첩하게, 클수록 묵직하게 따라감
YLIM_PAD = 0.07      # 상하단 여백 (현재 가시 범위 대비 비율)


def time_warp(p: float) -> float:
    """레이스 진행 곡선. 입력 p(영상 진행 0~1) → 출력(데이터 진행 0~1).

    확정(2026-08-20): 완급 — 초반 빠르게, 후반 천천히.
    선형 + ease-out 블렌드. WARP를 키우면 완급이 세진다 (0 = 등속).
    초반 배속 = 1 + WARP, 종반 배속 = 1 - WARP. 0에 닿지 않아 레이스가 멈추진 않는다.
    """
    WARP = 0.6
    ease_out = 1.0 - (1.0 - p) ** 2
    return (1.0 - WARP) * p + WARP * ease_out


# ──────────────────────────── 데이터 ────────────────────────────

def fetch_one(ticker: str) -> pd.Series:
    """수정주가 종가 시계열. FDR 1차, yfinance 폴백."""
    try:
        import FinanceDataReader as fdr
        df = fdr.DataReader(ticker, START, END)
        col = "Adj Close" if "Adj Close" in df.columns else "Close"
        s = df[col].dropna()
        if len(s) < 100:
            raise ValueError(f"데이터가 너무 적음: {len(s)}행")
        print(f"  {ticker}: FDR {col} {len(s)}행")
        return s
    except Exception as e:
        print(f"  {ticker}: FDR 실패 ({e}) → yfinance 폴백")
        import yfinance as yf
        s = yf.Ticker(ticker).history(start=START, end=END, auto_adjust=True)["Close"].dropna()
        s.index = pd.DatetimeIndex(s.index).tz_localize(None)
        print(f"  {ticker}: yfinance {len(s)}행")
        return s


def load_data() -> pd.DataFrame:
    """union 거래일 축 + forward-fill + 리베이스 100."""
    print("데이터 수집:")
    raw = {sp.ticker: fetch_one(sp.ticker) for sp in TICKERS}
    df = pd.DataFrame(raw).sort_index().ffill().dropna()
    rebased = df / df.iloc[0] * 100.0
    return rebased


def fmt_krw(v: float) -> str:
    """10_000_000 → '1,000만원', 227_000_000 → '2억 2,700만원'"""
    v = round(v)
    eok, rest = divmod(v, 100_000_000)
    man = round(rest / 10_000)
    if eok > 0:
        return f"{eok:,.0f}억 {man:,.0f}만원" if man > 0 else f"{eok:,.0f}억원"
    return f"{man:,.0f}만원"


# ──────────────────────────── 렌더 ────────────────────────────

def render(rebased: pd.DataFrame, preview: bool) -> Path:
    fps = 30 if preview else 60
    dpi = 50 if preview else 100  # figsize 10.8×19.2in → 540×960 / 1080×1920
    n_hook = int(HOOK_SEC * fps)
    n_race = int(RACE_SEC * fps)
    n_end = int(END_SEC * fps)
    total = n_hook + n_race + n_end

    dates = rebased.index
    vals = rebased.to_numpy().T          # (종목수, 거래일수)
    S, N = vals.shape
    idx = np.arange(N)
    runmax = np.maximum.accumulate(vals.max(axis=0))
    runmin = np.minimum.accumulate(vals.min(axis=0))

    # 한글 폰트 (macOS)
    for f in ("Apple SD Gothic Neo", "AppleGothic"):
        try:
            matplotlib.font_manager.findfont(f, fallback_to_default=False)
            plt.rcParams["font.family"] = f
            break
        except Exception:
            continue
    plt.rcParams["axes.unicode_minus"] = False

    fig = plt.figure(figsize=(10.8, 19.2), dpi=dpi, facecolor=BG)
    ax = fig.add_axes([0.10, 0.42, 0.85, 0.36], facecolor=BG)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color("#2A3346")
    ax.tick_params(colors=MUTED, labelsize=13, length=0)
    ax.grid(axis="y", color="#2A3346", alpha=0.5, linewidth=0.8)
    ax.set_xlim(0, N * 1.14)  # 오른쪽 여백 = 라인 헤드 배지 자리
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v - 100:+,.0f}%"))

    # x축: 연도 눈금
    year_ticks = [i for i in range(1, N) if dates[i].year != dates[i - 1].year]
    ax.set_xticks(year_ticks)
    ax.set_xticklabels([str(dates[i].year) for i in year_ticks])

    # 정적 텍스트
    title = fig.text(0.5, 0.925, f"2020년, {fmt_krw(SEED_KRW)}을 넣었다면?",
                     ha="center", color=FG, fontsize=34, fontweight="bold")
    subtitle = fig.text(0.5, 0.897, " vs ".join(sp.name for sp in TICKERS) + " · 2020–2024",
                        ha="center", color=MUTED, fontsize=16)
    date_txt = fig.text(0.5, 0.858, "", ha="center", color=MUTED, fontsize=22)
    fig.text(0.5, 0.035, "수정주가 · 가격수익률 기준(배당 재투자 미반영) · 데이터: FinanceDataReader",
             ha="center", color=MUTED, fontsize=10.5, alpha=0.8)

    # 종목별 라인 + 헤드 + 배지 + 카운터
    lines, dots, badges, name_txts, amount_txts, pct_txts = [], [], [], [], [], []
    col_x = np.linspace(0.28, 0.72, S)
    badge_dy = [14, -22]  # 배지 상하 오프셋(pt) — 초반 겹침 방지
    for si, sp in enumerate(TICKERS):
        (ln,) = ax.plot([], [], color=sp.color, linewidth=3.2, solid_capstyle="round")
        dot = ax.scatter([], [], s=90, color=sp.color, zorder=5)
        bd = ax.annotate("", (0, 0), xytext=(12, badge_dy[si % len(badge_dy)]),
                         textcoords="offset points", fontsize=13, fontweight="bold",
                         color=BG, zorder=6,
                         bbox=dict(boxstyle="round,pad=0.35", facecolor=sp.color, edgecolor="none"))
        nm = fig.text(col_x[si], 0.335, sp.name, ha="center", color=sp.color,
                      fontsize=17, fontweight="bold")
        amt = fig.text(col_x[si], 0.292, "", ha="center", color=FG,
                       fontsize=27, fontweight="bold")
        pct = fig.text(col_x[si], 0.262, "", ha="center", color=sp.color, fontsize=18)
        lines.append(ln); dots.append(dot); badges.append(bd)
        name_txts.append(nm); amount_txts.append(amt); pct_txts.append(pct)

    gap_txt = fig.text(0.5, 0.196, "", ha="center", color=FG, fontsize=21)

    # 훅 / 엔딩 오버레이
    hook_big = fig.text(0.5, 0.56, f"2020년,\n{fmt_krw(SEED_KRW)}을\n넣었다면?", ha="center",
                        va="center", color=FG, fontsize=58, fontweight="bold", linespacing=1.6)
    hook_sub = fig.text(0.5, 0.40, " vs ".join(f"{sp.name}" for sp in TICKERS),
                        ha="center", color=MUTED, fontsize=26)
    ending = fig.text(0.5, 0.575, "", ha="center", va="center", color=FG,
                      fontsize=25, linespacing=2.0, fontweight="bold", zorder=10,
                      bbox=dict(boxstyle="round,pad=0.9", facecolor="#141B2E",
                                edgecolor="#2A3346", alpha=0.95))

    chart_artists = (lines + dots + badges + name_txts + amount_txts + pct_txts
                     + [gap_txt, title, subtitle, date_txt])

    alpha_ylim = 1.0 - float(np.exp(-1.0 / (fps * YLIM_TAU_SEC)))
    ylim_state = {}

    def set_frame(f: int):
        in_hook = f < n_hook
        ax.set_visible(not in_hook)  # 훅 동안 축·눈금·그리드까지 전부 숨김
        for a in chart_artists:
            a.set_alpha(0.0 if in_hook else 1.0)
        hook_big.set_alpha(1.0 if in_hook else 0.0)
        hook_sub.set_alpha(1.0 if in_hook else 0.0)
        if in_hook:
            ending.set_alpha(0.0)
            return

        rf = min(f - n_hook, n_race - 1)
        p = time_warp(rf / (n_race - 1))
        x = p * (N - 1)
        k = int(np.floor(x))

        cur = np.array([np.interp(x, idx, vals[s]) for s in range(S)])
        for s in range(S):
            xs = np.append(idx[: k + 1], x)
            ys = np.append(vals[s][: k + 1], cur[s])
            lines[s].set_data(xs, ys)
            dots[s].set_offsets([[x, cur[s]]])
            badges[s].xy = (x, cur[s])
            badges[s].set_text(f"{TICKERS[s].ticker} {cur[s] - 100:+,.0f}%")
            amount_txts[s].set_text(fmt_krw(SEED_KRW * cur[s] / 100))
            pct_txts[s].set_text(f"{cur[s] - 100:+,.1f}%")
        gap_txt.set_text(f"격차  {abs(cur[0] - cur[1]):,.0f}%p")
        date_txt.set_text(f"{dates[min(k, N - 1)].year}년 {dates[min(k, N - 1)].month}월")

        # y축 부드러운 확장: 목표 ylim에 EMA + 현재값 클램프(라인이 잘리지 않게)
        tmax = float(np.interp(x, idx, runmax))
        tmin = float(np.interp(x, idx, runmin))
        rng = (tmax - tmin) + 1e-9
        # 비대칭 패딩: 위는 여유(배지 자리), 아래는 타이트하게 — 범위가 커져도 바닥이 안 뜬다
        t_top, t_bot = tmax + rng * YLIM_PAD, tmin - rng * 0.02
        if not ylim_state:
            ylim_state["top"], ylim_state["bot"] = t_top, t_bot
        ylim_state["top"] += alpha_ylim * (t_top - ylim_state["top"])
        ylim_state["bot"] += alpha_ylim * (t_bot - ylim_state["bot"])
        ylim_state["top"] = max(ylim_state["top"], cur.max() + rng * 0.02)
        ylim_state["bot"] = min(ylim_state["bot"], cur.min() - rng * 0.01)
        ax.set_ylim(ylim_state["bot"], ylim_state["top"])

        # 엔딩: 정지 프레임 + 결과 요약
        if f >= n_hook + n_race:
            fin = vals[:, -1]
            summary = ["최종 결과 (5년)", ""]
            for s, sp in enumerate(TICKERS):
                summary.append(f"{sp.name}  {fin[s] - 100:+,.0f}%  ·  {fmt_krw(SEED_KRW * fin[s] / 100)}")
            summary.append("")
            summary.append(f"격차 {abs(fin[0] - fin[1]):,.0f}%p")
            ending.set_text("\n".join(summary))
            ending.set_alpha(1.0)
        else:
            ending.set_alpha(0.0)

    out_dir = Path(__file__).resolve().parent.parent / "out"
    out_dir.mkdir(exist_ok=True)
    tag = "preview" if preview else "full"
    out = out_dir / f"p0_{'_'.join(sp.ticker.lower() for sp in TICKERS)}_{tag}.mp4"

    writer = FFMpegWriter(fps=fps, codec="libx264",
                          extra_args=["-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium"])
    print(f"렌더 시작: {total}프레임 @ {fps}fps → {out.name}")
    with writer.saving(fig, str(out), dpi=dpi):
        for f in range(total):
            set_frame(f)
            writer.grab_frame()
            if f % (fps * 5) == 0:
                print(f"  {f}/{total} ({f / total:.0%})")
    plt.close(fig)
    print(f"완료: {out}")
    return out


# ──────────────────────────── 진입점 ────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="데이터 요약만 출력")
    ap.add_argument("--preview", action="store_true", help="540×960 / 30fps 프리뷰")
    args = ap.parse_args()

    rebased = load_data()
    fin = rebased.iloc[-1]
    print(f"\n공통 거래일 {len(rebased)}일 ({rebased.index[0].date()} ~ {rebased.index[-1].date()})")
    for sp in TICKERS:
        print(f"  {sp.ticker}: 최종 {fin[sp.ticker] - 100:+,.1f}%  "
              f"({fmt_krw(SEED_KRW)} → {fmt_krw(SEED_KRW * fin[sp.ticker] / 100)})")
    if args.check:
        return
    render(rebased, preview=args.preview)


if __name__ == "__main__":
    sys.exit(main())
