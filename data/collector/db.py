# -*- coding: utf-8 -*-
"""계약 ① — SQLite 스키마. Python(collector)은 쓰기만, TS는 읽기만.
스키마 마이그레이션은 이 모듈이 소유한다 (ADR-001)."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "cache.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS prices (
  ticker     TEXT NOT NULL,
  date       TEXT NOT NULL,             -- YYYY-MM-DD
  open       REAL,
  high       REAL,
  low        REAL,
  close      REAL,
  adj_close  REAL NOT NULL,             -- 수정주가. 렌더 경로는 이 컬럼만 읽는다
  volume     REAL,
  source     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ticker, date)
);
CREATE TABLE IF NOT EXISTS fx_rates (
  pair       TEXT NOT NULL,             -- 예: USD/KRW
  date       TEXT NOT NULL,
  rate       REAL NOT NULL,
  source     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pair, date)
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def max_price_date(conn: sqlite3.Connection, ticker: str) -> str | None:
    row = conn.execute("SELECT MAX(date) FROM prices WHERE ticker = ?", (ticker,)).fetchone()
    return row[0]


def max_fx_date(conn: sqlite3.Connection, pair: str) -> str | None:
    row = conn.execute("SELECT MAX(date) FROM fx_rates WHERE pair = ?", (pair,)).fetchone()
    return row[0]


def upsert_prices(conn: sqlite3.Connection, ticker: str, df, source: str) -> int:
    """df: index=DatetimeIndex, cols open/high/low/close/adj_close/volume"""
    now = _now()
    rows = [
        (
            ticker,
            d.strftime("%Y-%m-%d"),
            None if r.isna().get("open", True) else float(r["open"]),
            None if r.isna().get("high", True) else float(r["high"]),
            None if r.isna().get("low", True) else float(r["low"]),
            None if r.isna().get("close", True) else float(r["close"]),
            float(r["adj_close"]),
            None if r.isna().get("volume", True) else float(r["volume"]),
            source,
            now,
        )
        for d, r in df.iterrows()
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO prices VALUES (?,?,?,?,?,?,?,?,?,?)", rows
    )
    conn.commit()
    return len(rows)


def upsert_fx(conn: sqlite3.Connection, pair: str, df, source: str) -> int:
    """df: index=DatetimeIndex, col rate"""
    now = _now()
    rows = [
        (pair, d.strftime("%Y-%m-%d"), float(r["rate"]), source, now)
        for d, r in df.iterrows()
    ]
    conn.executemany("INSERT OR REPLACE INTO fx_rates VALUES (?,?,?,?,?)", rows)
    conn.commit()
    return len(rows)
