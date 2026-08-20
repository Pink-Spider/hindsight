# syntax=docker/dockerfile:1
# 멀티 스테이지 — compose가 target으로 server/worker를 골라 빌드한다.

FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# ── 서버: API + 웹 정적 서빙 + collector(Python) 호출 ──────────────────────
FROM base AS server
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /venv \
  && /venv/bin/pip install --no-cache-dir finance-datareader yfinance pandas
COPY data/collector ./data/collector
RUN pnpm --filter @hindsight/web build
ENV PYTHON=/venv/bin/python3
EXPOSE 4600
CMD ["pnpm", "--filter", "@hindsight/server", "start"]

# ── 워커: Remotion 렌더 (Chrome Headless Shell 런타임 의존성 + 한글 폰트) ──
FROM base AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 fonts-noto-cjk ffmpeg \
  && rm -rf /var/lib/apt/lists/*
CMD ["pnpm", "--filter", "@hindsight/worker", "queue"]
