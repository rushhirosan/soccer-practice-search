## todo

- [ ] 検証環境の確立、postgres
- [ ] チャンネルの整理



## 今後の本番データ更新方法

# 1. VMが停止している場合は起動
fly machine start 2874545a5d7348 -a soccer-practice-search

# 2. データ更新を実行
fly ssh console -a soccer-practice-search -C "python /app/main.py"