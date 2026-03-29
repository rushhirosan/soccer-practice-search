---
description: >-
  Run release checks (pytest, secret scan), optional git commit, push to origin main,
  and Fly.io deploy. Use when shipping, before deploy, or when the user says リリース /
  デプロイ / release / preflight / ship.
---

# Release / deploy (Soccer Practice Search)

プロジェクトルートでシェルを実行する。**プッシュ先は常に `origin main`（ローカルも `main` 必須）。** 本番アプリ名は `soccer-practice-search`（`fly.toml` と一致）。

## チェックのみ（コミット・プッシュ・デプロイしない）

```bash
./scripts/release.sh
```

1. `pytest tests/`（`.venv/bin/python` があれば自動で使用）
2. 追跡ファイルの簡易シークレット検出（GitHub PAT、秘密鍵、Google API キー風パターンなど）

## 一発リリース（おすすめ）：自動コミット文 + push main + Fly.io

変更内容から英語の1行メッセージを自動生成（例: `chore: update 3 file(s) (static, templates)`）。`tests/` のみなら `test:`、`.md` のみなら `docs:`。

```bash
./scripts/release.sh --ship
```

- チェックをすべて通した**あと** `git add -A` → コミット（変更がなければコミット省略）→ `git push origin main` → `fly deploy -a soccer-practice-search --ha=false`
- ローカルブランチが **`main` でないと push で失敗**する（意図的）

## 手動コミットメッセージ

```bash
./scripts/release.sh --commit "feat: your message in English" --push
./scripts/release.sh --commit "feat: your message" --push --deploy
```

## デプロイだけ（チェック通過後）

```bash
./scripts/release.sh --deploy
```

## 前提

- **Fly.io**: `fly` CLI が入り、`fly auth login` 済み。
- **push**: `origin` の **main** へ送る。別ブランチで作業している場合は `main` にマージしてから `--ship` する。

## 手動で pytest だけ叩く場合

```bash
.venv/bin/python -m pytest tests/ -q
```

## コミット前フック（推奨）

```bash
git config core.hooksPath scripts/git-hooks
```

## `scripts/deploy.sh` について（注意）

`scripts/deploy.sh` は **固定メッセージでのコミット・スケール・デプロイ・SSH 経由の DB 再構築・VM 停止** まで含む運用用スクリプトです。日常のコードリリースでは **`./scripts/release.sh`** または **`fly deploy`** で足りることが多く、DB 再構築が不要なら `deploy.sh` は使わないでください。

## エージェント向けメモ

- 「コミットしてプッシュしてデプロイ」→ `./scripts/release.sh --ship`（メッセージ自動）。
- `memo.txt` 等にトークンが残っているとシークレットチェックで失敗する。
