import requests
import time
import isodate
import logging
from typing import Optional, List, Dict

# ロガーの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

MAX_PAGES = 10
MAX_VIDEOS = 500
PLAYLIST_PAGE_SIZE = 50
SEARCH_PAGE_SIZE = 100
DETAILS_BATCH_SIZE = 50


def convert_duration(duration: str) -> str:
    """ISO 8601形式の動画長さを人間が読める形式に変換"""
    try:
        duration_obj = isodate.parse_duration(duration)
        return str(duration_obj)
    except Exception as e:
        logger.error("Failed to parse duration: %s. Error: %s", duration, e)
        return "N/A"


def fetch_video_details(video_ids: List[str], api_key: str) -> List[Dict]:
    """動画IDリストから詳細情報を取得（50件ずつ）"""
    if not video_ids:
        return []

    all_items: List[Dict] = []
    for start in range(0, len(video_ids), DETAILS_BATCH_SIZE):
        batch = video_ids[start:start + DETAILS_BATCH_SIZE]
        video_details_url = (
            "https://www.googleapis.com/youtube/v3/videos"
            f"?key={api_key}&id={','.join(batch)}&part=statistics,contentDetails"
        )
        try:
            response = requests.get(video_details_url)
            response.raise_for_status()
            items = response.json().get('items', [])
            all_items.extend(items)
            logger.info("Fetched video details for %d videos", len(batch))
        except requests.exceptions.RequestException as e:
            logger.error("Failed to fetch video details: %s", e)

    return all_items


def fetch_channel_uploads_playlist_id(channel_id: str, api_key: str) -> Optional[str]:
    """チャンネルの uploads プレイリスト ID を取得"""
    url = (
        "https://www.googleapis.com/youtube/v3/channels"
        f"?part=contentDetails&id={channel_id}&key={api_key}"
    )
    try:
        response = requests.get(url)
        response.raise_for_status()
        items = response.json().get('items', [])
        if not items:
            logger.warning("Channel not found: %s", channel_id)
            return None
        playlist_id = items[0]['contentDetails']['relatedPlaylists']['uploads']
        logger.info("Uploads playlist for channel %s: %s", channel_id, playlist_id)
        return playlist_id
    except (requests.exceptions.RequestException, KeyError, IndexError) as e:
        logger.error("Failed to fetch uploads playlist for channel %s: %s", channel_id, e)
        return None


def fetch_playlist_items(
    playlist_id: str, api_key: str, next_page_token: Optional[str] = None
) -> Dict:
    """uploads プレイリストから動画一覧を取得（新しい順）"""
    url = (
        "https://www.googleapis.com/youtube/v3/playlistItems"
        f"?part=snippet&playlistId={playlist_id}&maxResults={PLAYLIST_PAGE_SIZE}&key={api_key}"
    )
    if next_page_token:
        url += f"&pageToken={next_page_token}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        logger.info("Fetched playlist items for playlist: %s", playlist_id)
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error("Failed to fetch playlist items: %s. Error: %s", playlist_id, e)
        return {}


def fetch_videos_from_channel(channel_id: str, api_key: str, next_page_token: Optional[str] = None) -> Dict:
    """チャンネルから動画一覧を取得（デバッグ用・search API フォールバック）"""
    base_url = (
        "https://www.googleapis.com/youtube/v3/search"
        f"?key={api_key}&channelId={channel_id}&part=snippet&type=video"
        f"&order=date&maxResults={SEARCH_PAGE_SIZE}"
    )
    url = f"{base_url}&pageToken={next_page_token}" if next_page_token else base_url
    try:
        response = requests.get(url)
        response.raise_for_status()
        logger.info("Fetched video list for channel: %s", channel_id)
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error("Failed to fetch videos from channel: %s. Error: %s", channel_id, e)
        return {}


def _build_video_record(video_id: str, title: str, upload_date: str, detail: Dict) -> Dict:
    view_count = detail.get('statistics', {}).get('viewCount', 'N/A')
    like_count = detail.get('statistics', {}).get('likeCount', 'N/A')
    duration = convert_duration(detail.get('contentDetails', {}).get('duration', ''))
    return {
        'id': video_id,
        'title': title,
        'upload_date': upload_date,
        'url': f"https://www.youtube.com/watch?v={video_id}",
        'view_count': view_count,
        'like_count': like_count,
        'duration': duration,
    }


def _collect_from_playlist_items(items: List[Dict], details: List[Dict], video_data: List[Dict], max_videos: int) -> None:
    details_by_id = {item['id']: item for item in details}
    for item in items:
        if len(video_data) >= max_videos:
            break
        snippet = item.get('snippet', {})
        resource_id = snippet.get('resourceId', {})
        if resource_id.get('kind') != 'youtube#video':
            continue
        video_id = resource_id.get('videoId')
        if not video_id:
            continue
        detail = details_by_id.get(video_id, {})
        video_data.append(_build_video_record(
            video_id,
            snippet.get('title', 'N/A'),
            snippet.get('publishedAt', 'N/A'),
            detail,
        ))


def _collect_from_search_items(items: List[Dict], details: List[Dict], video_data: List[Dict], max_videos: int) -> None:
    details_by_id = {item['id']: item for item in details}
    for item in items:
        if len(video_data) >= max_videos:
            break
        video_id = item['id']['videoId']
        snippet = item['snippet']
        detail = details_by_id.get(video_id, {})
        video_data.append(_build_video_record(
            video_id,
            snippet['title'],
            snippet['publishedAt'],
            detail,
        ))


def _get_youtube_video_data_via_search(channel_id: str, api_key: str) -> List[Dict]:
    """search API（order=date）で動画を取得（uploads プレイリスト取得失敗時のフォールバック）"""
    video_data: List[Dict] = []
    next_page_token = None
    page_count = 0

    while page_count < MAX_PAGES and len(video_data) < MAX_VIDEOS:
        channel_data = fetch_videos_from_channel(channel_id, api_key, next_page_token)
        if not channel_data:
            logger.warning("No data returned for channel ID: %s", channel_id)
            break

        items = channel_data.get('items', [])
        remaining_slots = MAX_VIDEOS - len(video_data)
        if len(items) > remaining_slots:
            items = items[:remaining_slots]

        video_ids = [item['id']['videoId'] for item in items]
        details = fetch_video_details(video_ids, api_key)
        _collect_from_search_items(items, details, video_data, MAX_VIDEOS)

        page_count += 1
        logger.info(
            "Processed search page %d for channel %s, total videos so far: %d",
            page_count, channel_id, len(video_data),
        )

        next_page_token = channel_data.get('nextPageToken')
        if not next_page_token or len(video_data) >= MAX_VIDEOS:
            break

        time.sleep(2)

    return video_data


def get_youtube_video_data(channel_id: str, api_key: str) -> List[Dict]:
    """指定したチャンネルIDから動画データを取得（uploads プレイリスト優先）"""
    playlist_id = fetch_channel_uploads_playlist_id(channel_id, api_key)
    if not playlist_id:
        logger.warning("Falling back to search API for channel %s", channel_id)
        video_data = _get_youtube_video_data_via_search(channel_id, api_key)
        logger.info("Video data collection completed for channel: %s (%d videos)", channel_id, len(video_data))
        return video_data

    video_data: List[Dict] = []
    next_page_token = None
    page_count = 0

    while page_count < MAX_PAGES and len(video_data) < MAX_VIDEOS:
        playlist_data = fetch_playlist_items(playlist_id, api_key, next_page_token)
        if not playlist_data:
            logger.warning("No playlist data returned for channel ID: %s", channel_id)
            break

        items = playlist_data.get('items', [])
        remaining_slots = MAX_VIDEOS - len(video_data)
        if len(items) > remaining_slots:
            items = items[:remaining_slots]

        video_ids = [
            item['snippet']['resourceId']['videoId']
            for item in items
            if item.get('snippet', {}).get('resourceId', {}).get('videoId')
        ]
        details = fetch_video_details(video_ids, api_key)
        _collect_from_playlist_items(items, details, video_data, MAX_VIDEOS)

        page_count += 1
        logger.info(
            "Processed playlist page %d for channel %s, total videos so far: %d",
            page_count, channel_id, len(video_data),
        )

        next_page_token = playlist_data.get('nextPageToken')
        if not next_page_token or len(video_data) >= MAX_VIDEOS:
            break

        time.sleep(2)

    logger.info("Video data collection completed for channel: %s (%d videos)", channel_id, len(video_data))
    return video_data
