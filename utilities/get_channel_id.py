import requests
import os
from dotenv import load_dotenv

load_dotenv()

def get_channel_id(channel_link):
    """YouTubeチャンネルリンクからチャンネルIDを取得"""
    try:
        response = requests.get(channel_link)
        response.raise_for_status()
        
        # HTMLからチャンネルIDを抽出
        content = response.text
        if 'channel_id=' in content:
            start = content.find('channel_id=') + 12
            end = content.find('&', start)
            if end == -1:
                end = content.find('"', start)
            if end == -1:
                end = content.find("'", start)
            if end == -1:
                end = len(content)
            return content[start:end]
        return None
    except Exception as e:
        print(f"Error getting channel ID: {e}")
        return None

def get_channel_details(channel_id):
    """チャンネルIDからチャンネルの詳細情報を取得"""
    api_key = os.getenv('API_KEY')
    if not api_key:
        return 'N/A'
    
    url = f"https://www.googleapis.com/youtube/v3/channels?part=snippet&id={channel_id}&key={api_key}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        if data['items']:
            return data['items'][0]['snippet']['title']
        return 'N/A'
    except Exception as e:
        print(f"Error getting channel details: {e}")
        return 'N/A'
