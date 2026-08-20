import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const CACHE_DB = path.join(REPO_ROOT, "data", "cache.db");
export const JOBS_DB = path.join(REPO_ROOT, "data", "jobs.db");
export const OUT_DIR = path.join(REPO_ROOT, "out");
export const PYTHON = process.env.PYTHON ?? path.join(REPO_ROOT, ".venv", "bin", "python3");
export const INGEST = path.join(REPO_ROOT, "data", "collector", "ingest.py");
export const WEB_DIST = path.join(REPO_ROOT, "apps", "web", "dist");
export const BGM_DIR = path.join(REPO_ROOT, "assets", "bgm");
