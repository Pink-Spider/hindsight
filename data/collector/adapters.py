# -*- coding: utf-8 -*-
"""시장 어댑터 — 데이터 소스는 반드시 이 인터페이스 뒤에 숨긴다 (유료 소스 전환 대비).

fetch_*(symbol, start, end) → (DataFrame, source_str)
  가격: index=DatetimeIndex, cols open/high/low/close/adj_close/volume
  환율: index=DatetimeIndex, cols rate
"""
import re

import pandas as pd


def classify(symbol: str) -> str:
    """'USD/KRW' → fx, '005930' → kr, 'NVDA' → us"""
    if "/" in symbol:
        return "fx"
    if re.fullmatch(r"\d{6}", symbol):
        return "kr"
    return "us"


def fetch_kr(symbol: str, start: str, end: str | None):
    """FDR(네이버 소스) — KR은 Close가 이미 수정주가다."""
    import FinanceDataReader as fdr

    df = fdr.DataReader(symbol, start, end)
    out = pd.DataFrame(
        {
            "open": df.get("Open"),
            "high": df.get("High"),
            "low": df.get("Low"),
            "close": df["Close"],
            "adj_close": df["Close"],
            "volume": df.get("Volume"),
        }
    ).dropna(subset=["adj_close"])
    return out, "FDR/NAVER"


def fetch_us(symbol: str, start: str, end: str | None):
    """FDR 1차 (Adj Close), yfinance 2차 폴백 (auto_adjust)."""
    try:
        import FinanceDataReader as fdr

        df = fdr.DataReader(symbol, start, end)
        if "Adj Close" not in df.columns or len(df) < 2:
            raise ValueError("Adj Close 없음 또는 데이터 부족")
        out = pd.DataFrame(
            {
                "open": df.get("Open"),
                "high": df.get("High"),
                "low": df.get("Low"),
                "close": df["Close"],
                "adj_close": df["Adj Close"],
                "volume": df.get("Volume"),
            }
        ).dropna(subset=["adj_close"])
        return out, "FDR/YAHOO"
    except Exception as e:
        print(f"  {symbol}: FDR 실패 ({e}) → yfinance 폴백")
        import yfinance as yf

        h = yf.Ticker(symbol).history(start=start, end=end, auto_adjust=True)
        h.index = pd.DatetimeIndex(h.index).tz_localize(None)
        out = pd.DataFrame(
            {
                "open": h.get("Open"),
                "high": h.get("High"),
                "low": h.get("Low"),
                "close": h["Close"],
                "adj_close": h["Close"],  # auto_adjust=True → Close가 수정주가
                "volume": h.get("Volume"),
            }
        ).dropna(subset=["adj_close"])
        return out, "YFINANCE"


def fetch_fx(pair: str, start: str, end: str | None):
    import FinanceDataReader as fdr

    df = fdr.DataReader(pair, start, end)
    out = pd.DataFrame({"rate": df["Close"]}).dropna()
    return out, "FDR"
