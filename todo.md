## ✅ 完了したタスク

- [x] 検証環境の確立、postgres
- [x] チャンネルの整理
- [x] 整理したチャンネルで再度データベースを構築する
- [x] プロジェクト構造の整理
- [x] データベース接続問題の修正

## 📋 各スクリプトの役割

### `main.py`
- **用途**: 完全なデータベース再構築
- **内容**: テーブル作成 + YouTube APIからデータ取得 + データ挿入
- **時間**: 長い（YouTube API制限のため）

### `scripts/init_local_db.py`
- **用途**: テーブル作成のみ
- **内容**: テーブル作成 + 既存データの確認
- **時間**: 短い

### `scripts/run_local.py`
- **用途**: アプリケーション起動
- **内容**: ローカル環境でのFlask起動
- **時間**: 即座

## 🚀 推奨フロー

### **通常の開発時**
```bash
python scripts/run_local.py
```

### **データベースを完全にリセットしたい時**
```bash
# 1. テーブル削除
psql soccer_practice_search_local -c "DROP TABLE IF EXISTS contents, category, cid, feedback CASCADE;"

# 2. 完全再構築
python main.py

# 3. アプリケーション起動
python scripts/run_local.py
```

### **テーブル構造だけ確認したい時**
```bash
python scripts/init_local_db.py
```

## 🌐 本番データ更新方法

```bash
# 1. VMが停止している場合は起動
fly machine start 2874545a5d7348 -a soccer-practice-search

# 2. データ更新を実行
fly ssh console -a soccer-practice-search -C "python /app/main.py"
```

## 📊 新しいチャンネル構成

1. 雑誌『サッカークリニック』, web版
2. COACH UNITED編集部
3. SOLUNA Ch.
4. サッカーのみちしるべ
5. REGATEドリブル塾
6. KSS SOCCER SCHOOL