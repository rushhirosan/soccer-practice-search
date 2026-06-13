import pytest
from utilities.get_videos import (
    convert_duration,
    fetch_channel_uploads_playlist_id,
    fetch_playlist_items,
    fetch_video_details,
    fetch_videos_from_channel,
    get_youtube_video_data,
)


def test_convert_duration():
    assert convert_duration('PT1H2M3S') == '1:02:03'
    assert convert_duration('PT15M') == '0:15:00'
    assert convert_duration('PT0S') == '0:00:00'
    assert convert_duration('InvalidDuration') == 'N/A'


def test_fetch_video_details(mocker):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {
        'items': [{
            'id': 'video1',
            'statistics': {'viewCount': '1000'},
            'contentDetails': {'duration': 'PT10M'},
        }],
    }
    mocker.patch('requests.get', return_value=mock_response)
    details = fetch_video_details(['video1'], 'test_api_key')
    assert len(details) == 1
    assert details[0]['id'] == 'video1'
    assert details[0]['statistics']['viewCount'] == '1000'


def test_fetch_videos_from_channel_uses_order_date(mocker):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {
        'items': [{
            'id': {'videoId': 'video1'},
            'snippet': {'title': 'Test Video', 'publishedAt': '2025-03-01T00:00:00Z'},
        }],
    }
    mock_get = mocker.patch('requests.get', return_value=mock_response)
    data = fetch_videos_from_channel('test_channel_id', 'test_api_key')
    assert 'items' in data
    assert len(data['items']) == 1
    assert data['items'][0]['id']['videoId'] == 'video1'
    called_url = mock_get.call_args[0][0]
    assert 'order=date' in called_url


def test_fetch_channel_uploads_playlist_id(mocker):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {
        'items': [{
            'contentDetails': {
                'relatedPlaylists': {'uploads': 'UUuploads123'},
            },
        }],
    }
    mocker.patch('requests.get', return_value=mock_response)
    playlist_id = fetch_channel_uploads_playlist_id('UCtest', 'test_api_key')
    assert playlist_id == 'UUuploads123'


def test_get_youtube_video_data_uses_uploads_playlist(mocker):
    channel_response = mocker.Mock()
    channel_response.json.return_value = {
        'items': [{
            'contentDetails': {
                'relatedPlaylists': {'uploads': 'UUuploads123'},
            },
        }],
    }

    playlist_response = mocker.Mock()
    playlist_response.json.return_value = {
        'items': [{
            'snippet': {
                'title': 'Playlist Video',
                'publishedAt': '2025-05-14T00:00:00Z',
                'resourceId': {'kind': 'youtube#video', 'videoId': 'video1'},
            },
        }],
    }

    details_response = mocker.Mock()
    details_response.json.return_value = {
        'items': [{
            'id': 'video1',
            'statistics': {'viewCount': '20000', 'likeCount': '157'},
            'contentDetails': {'duration': 'PT9M6S'},
        }],
    }

    mocker.patch(
        'requests.get',
        side_effect=[channel_response, playlist_response, details_response],
    )

    videos = get_youtube_video_data('UCtest', 'test_api_key')
    assert len(videos) == 1
    assert videos[0]['id'] == 'video1'
    assert videos[0]['title'] == 'Playlist Video'
    assert videos[0]['view_count'] == '20000'
