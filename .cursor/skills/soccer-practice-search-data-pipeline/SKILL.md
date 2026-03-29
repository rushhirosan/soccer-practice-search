---
name: soccer-practice-search-data-pipeline
description: Guides YouTube ingestion, PostgreSQL schema usage, main.py orchestration, and category update scripts for Soccer Practice Search. Use when changing get_videos, update_category_db, DB tables, API quotas, or running main.py / fetch routes.
---

# Soccer Practice Search — Data Pipeline

Video metadata is loaded via the **YouTube Data API** into **PostgreSQL**. Treat the API as **quota-limited** and **fallible**.

## Core modules

| Path | Role |
|------|------|
| `utilities/get_videos.py` | Fetch videos from channels, duration parsing (`convert_duration`), batch details |
| `utilities/get_channel_id.py` | Channel resolution / metadata helpers |
| `utilities/db_access.py` | Tables: contents, categories, channels, feedback, etc.; connection pool |
| `utilities/update_category_db.py` | Category tagging / updates after ingest |
| `utilities/create_indexes.py` | Index creation for performance |
| `main.py` | End-to-end: env load, DB setup, channel loop, `get_youtube_video_data` flow |

## Operational entry

- **Full rebuild / ingest**: `python main.py` (long-running; needs `API_KEY`, `DATABASE_URL`, etc.)
- **Production / Fly**: sometimes run via SSH or `scripts/deploy.sh` — see `scripts/deploy.sh` comments and `docs/LOCAL_DEVELOPMENT.md`

## App routes touching data (careful)

- `/fetch-youtube-data`, `/init-database`, `/update-channel-names`, etc. are powerful; ensure they match deployment security expectations.

## Checklist when changing ingestion

- [ ] Preserve **idempotent** or safe re-run behavior where the code already assumes it.
- [ ] Handle **missing fields** from YouTube (deleted videos, empty snippets).
- [ ] Respect **API key** loading from env only — never commit keys.
- [ ] Add or extend **tests** in `tests/` for pure functions (`convert_duration`, parsing).
- [ ] Large schema changes: coordinate with **indexes** (`utilities/create_indexes.py`) and any admin routes.

## Local vs production env

- `utilities/.env.local` takes precedence for local runs in `main.py` when the file exists.
- Fly secrets replace local files in production — do not rely on committed `.env`.
