from utilities.get_videos import get_youtube_video_data
from utilities.get_channel_id import get_channel_id, get_channel_details
from utilities.db_access import create_cid_table, get_db_connection, insert_cid_data, create_contents_table, insert_contents_data, create_category_table, search_content_table, insert_category_data, create_feedback_table, delete_table
from utilities.update_category_db import update_category
from flask import Flask
import os
import sys
from dotenv import load_dotenv
import logging

app = Flask(__name__)

# ロガーの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

if __name__ == '__main__':
    with app.app_context():
        try:
            #########################################################
            ## データベース初期化
            #########################################################
            # 環境自動判別システム
            # 本番環境では環境変数が既に設定されているので、.envファイルの読み込みを優先
            if os.getenv('FLY_APP_NAME') or os.getenv('DATABASE_URL', '').startswith('postgresql://soccer_user'):
                # 本番環境
                load_dotenv("./utilities/.env", override=True)
                logger.info("本番環境の設定を読み込みました")
            elif os.path.exists("./utilities/.env.local"):
                # ローカル開発環境
                load_dotenv("./utilities/.env.local", override=True)
                logger.info("ローカル開発環境の設定を読み込みました")
            else:
                # フォールバック
                load_dotenv("./utilities/.env", override=True)
                logger.info("デフォルト環境の設定を読み込みました")
            
            logger.info(f"DATABASE_URL: {os.getenv('DATABASE_URL')}")
            
            api_key = os.getenv('API_KEY')
            
            # データベース接続は環境変数読み込み後に実行
            get_db_connection()
            
            if not api_key:
                logger.error("API key is missing. Please set it in the .env file.")
                sys.exit(1)
            
            channel_id = os.getenv('CHANNEL_ID')
            channel_link = os.getenv('CHANNEL_LINK')
            channels = channel_id.split(",")
            channel_links = channel_link.split(",")
            
            # 既存のテーブルを削除してクリーンな状態から開始
            logger.info("Cleaning existing tables...")
            delete_table('feedback')
            delete_table('category')
            delete_table('contents')
            delete_table('cid')
            
            # テーブルを一度だけ作成
            logger.info("Creating tables...")
            create_cid_table()
            create_contents_table()
            create_category_table()
            create_feedback_table()
            
            #########################################################
            ## チャンネルデータ処理
            #########################################################
            for c_num, cid in enumerate(channels, start=1):
                try:
                    logger.info(f"Processing channel {c_num}/{len(channels)}: {cid}")
                    
                    channel_name = get_channel_details(cid)
                    if channel_name == "N/A":
                        logger.error(f"Failed to retrieve channel name for {cid}")
                        continue  # エラーが発生しても次のチャンネルを処理
                    
                    # チャンネル情報を挿入
                    insert_cid_data(cid, channel_name, channel_links[c_num-1])
                    
                    # 動画データを取得
                    video_data = get_youtube_video_data(cid, api_key)
                    if video_data:
                        insert_contents_data(video_data, c_num)
                        logger.info(f"Inserted {len(video_data)} videos for channel {c_num}")
                        

                    else:
                        logger.warning(f"No video data found for channel {c_num}")
                        
                except Exception as e:
                    logger.error(f"Error processing channel {c_num} ({cid}): {e}")
                    continue  # エラーが発生しても次のチャンネルを処理
            
            #########################################################
            ## カテゴリ分類処理
            #########################################################
            logger.info("Starting category classification...")
            try:
                contents = search_content_table()
                if contents:
                    contents_data = update_category(contents)
                    
                    # 各動画に正しいチャンネルIDを割り当て
                    for content in contents_data:
                        if content.get("channel_id"):
                            # 個別にカテゴリデータを挿入
                            insert_category_data([content], content["channel_id"])
                        else:
                            logger.warning(f"No channel_id found for content {content['id']}")
                    
                    logger.info("Category classification completed successfully")
                else:
                    logger.warning("No contents found for category classification")
            except Exception as e:
                logger.error(f"Error during category classification: {e}")
            
            logger.info("All processes finished successfully")
            
        except Exception as e:
            logger.error(f"Critical error in main process: {e}")
            sys.exit(1)

