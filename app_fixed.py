from flask import Flask, render_template, request, jsonify, g
from datetime import datetime
# from utilities.db_access import get_db_connection, pool, get_channel_name_from_id
from contextlib import closing
import os
import sqlite3
import unicodedata
import logging
import psycopg2
from typing import Optional, Any

# ロガーの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
DATABASE = 'soccer_content.db'

# 一時的にデータベース接続を無効化
def get_db_connection():
    logger.warning("Database connection temporarily disabled")
    return None

def get_channel_name_from_id(id):
    return f"Channel {id}"

@app.route('/')
def index():
    logger.info("Starting Flask application")
    return render_template('home.html')

@app.route('/health')
def health_check():
    """ヘルスチェック用エンドポイント"""
    return jsonify({"status": "healthy", "message": "Service is running"}), 200

@app.route('/test')
def test():
    """テスト用エンドポイント"""
    return jsonify({"message": "Test endpoint working!"}), 200

@app.route('/db-stats')
def database_stats():
    """データベース統計を表示するエンドポイント"""
    try:
        # データベース接続を有効化して統計を取得
        from utilities.db_access import get_db_connection
        conn = get_db_connection()
        if conn is None:
            return jsonify({"error": "Database connection failed"}), 500

        with conn.cursor() as c:
            # 存在するテーブルを確認
            c.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [row[0] for row in c.fetchall()]
            
            stats = {"tables": tables, "counts": {}}
            
            # 各テーブルの件数を取得
            for table in tables:
                try:
                    c.execute(f"SELECT COUNT(*) FROM {table}")
                    count = c.fetchone()[0]
                    stats["counts"][table] = count
                except Exception as e:
                    stats["counts"][table] = f"Error: {str(e)}"
            
            # 総件数を計算
            total = sum([count for count in stats["counts"].values() if isinstance(count, int)])
            stats["total"] = total
            
            return jsonify(stats), 200
    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/search')
def search_activities():
    # 一時的にダミーデータを返す
    return jsonify({
        "activities": [],
        "total": 0,
        "current_display_count": 0
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True) 