from flask import Flask, render_template, request, jsonify
import logging
import os

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

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True) 