# -*- coding: utf-8 -*-
"""일간 OHLCV·환율 증분 적재 CLI.

사용:
    .venv/bin/python3 data/collector/ingest.py 005930 NVDA SPY USD/KRW
    .venv/bin/python3 data/collector/ingest.py NVDA --start 2010-01-01
    .venv/bin/python3 data/collector/ingest.py 005930 --full   # 전체 재수집

증분 규칙: 기존 MAX(date) - 7일부터 다시 받아 겹침 upsert (직전 수정 반영).
액면분할·배당락은 과거 전체의 수정주가를 바꾸므로, 수상하면 --full로 재수집한다.
"""
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
from adapters import classify, fetch_fx, fetch_kr, fetch_us

DEFAULT_START = "2010-01-01"


def ingest_one(conn, symbol: str, start: str, full: bool) -> None:
    kind = classify(symbol)
    if not full:
        last = db.max_fx_date(conn, symbol) if kind == "fx" else db.max_price_date(conn, symbol)
        if last:
            overlap = (datetime.strptime(last, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
            start = max(start, overlap) if start > overlap else overlap

    if kind == "fx":
        df, source = fetch_fx(symbol, start, None)
        n = db.upsert_fx(conn, symbol, df, source)
    elif kind == "kr":
        df, source = fetch_kr(symbol, start, None)
        n = db.upsert_prices(conn, symbol, df, source)
    else:
        df, source = fetch_us(symbol, start, None)
        n = db.upsert_prices(conn, symbol, df, source)
    print(f"  {symbol} [{kind}] {source}: {n}행 upsert (start={start})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("symbols", nargs="+", help="티커/페어 목록 (005930, NVDA, USD/KRW)")
    ap.add_argument("--start", default=DEFAULT_START)
    ap.add_argument("--full", action="store_true", help="증분 무시하고 --start부터 전체 재수집")
    args = ap.parse_args()

    conn = db.connect()
    print(f"적재 시작 → {db.DB_PATH}")
    failed = []
    for sym in args.symbols:
        try:
            ingest_one(conn, sym, args.start, args.full)
        except Exception as e:
            print(f"  {sym}: 실패 — {e}")
            failed.append(sym)
    conn.close()
    if failed:
        print(f"실패: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
