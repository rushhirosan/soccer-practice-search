---
name: soccer-practice-search-repo
description: Maps the Soccer Practice Search repo layout, Flask entry in app.py, env files, PostgreSQL access, Fly.io, and main data job entry. Use when navigating the codebase, adding routes, debugging deploy, or when the user mentions app.py, main.py, utilities/.env, or Fly.
---

# Soccer Practice Search — Repository Map

Product principles and conventions: `.cursor/rules/soccer-practice-search.mdc`. This skill is **where things live** and **how the app boots**.

## Entry points

| Path | Role |
|------|------|
| `app.py` | Flask app: routes, CSRF (`Flask-WTF`), search APIs, feedback, admin/debug DB routes, `render_template` for pages |
| `main.py` | Batch-style entry: loads env (`utilities/.env.local` or `utilities/.env`), DB init, YouTube ingestion orchestration (run on server or locally for full rebuild) |

## HTTP surface (representative)

| Area | Notes |
|------|--------|
| `/` | Home / search UI |
| `/search` | JSON search API (used by `static/scripts.js`) |
| `/get_unique_values/<column>`, `/get_levels`, `/get_channels` | Filter dropdown data |
| `/get-csrf-token`, `/submit-feedback` | CSRF-protected feedback |
| `/health` | Fly.io health check |
| `/practice-notes`, `/favorites`, `/board`, `/about`, `/privacy` | Feature pages (see templates) |

Many `/debug/*`, `/init-database`, `/fetch-youtube-data` style routes exist for operations — treat as privileged; do not expose without auth in production review.

## Configuration and env

| Path | Role |
|------|------|
| `utilities/.env.local` | Local overrides (not committed); preferred when present for `main.py` |
| `utilities/.env` | Production / fallback secrets on Fly or local |
| `fly.toml` | Fly app `soccer-practice-search`, region `nrt`, HTTP service on 8080 |

## Shared infrastructure

| Path | Role |
|------|------|
| `utilities/db_access.py` | Connection pool, `get_db_connection`, channel ID → name, table helpers |
| `utilities/get_videos.py` | YouTube API: channel fetch, duration conversion, etc. |

## Tests

| Path | Role |
|------|------|
| `tests/` | Pytest; e.g. `test_get_videos.py` with mocks |

## Deployment

| Path | Role |
|------|------|
| `fly.toml` | Production app config |
| `scripts/release.sh` | Preflight: pytest + secret scan; optional `--ship` (auto commit → `git push origin main` → `fly deploy --ha=false`) |
| `scripts/deploy.sh` | Full ops pipeline (commit, deploy, optional DB rebuild via SSH) — not always appropriate for small releases |
| `scripts/fix-fly-recovery.sh` | Recovery helper |

## When adding a feature

1. Prefer new **routes** in `app.py` unless the file is split by an explicit refactor.
2. Keep **SQL** and pooling in `utilities/db_access.py` or next to existing query patterns.
3. **JSON APIs** consumed by `static/scripts.js` must stay compatible or update JS in the same change.
4. **CSRF**: endpoints that mutate state from the browser should follow existing token patterns.
