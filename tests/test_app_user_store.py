import pytest
from utilities import app_user_store


def test_validate_nickname_ok():
    assert app_user_store.validate_nickname("coach01") == "coach01"
    assert app_user_store.validate_nickname(" たろう ") == "たろう"


def test_validate_nickname_rejects():
    with pytest.raises(ValueError):
        app_user_store.validate_nickname("a")
    with pytest.raises(ValueError):
        app_user_store.validate_nickname("")


def test_validate_password():
    app_user_store.validate_password("12345678")
    with pytest.raises(ValueError):
        app_user_store.validate_password("short")


def test_rate_limit_allow():
    app_user_store._rate_buckets.clear()
    key = "test:ip"
    assert app_user_store.rate_limit_allow(key, max_events=3, window_sec=60) is True
    assert app_user_store.rate_limit_allow(key, max_events=3, window_sec=60) is True
    assert app_user_store.rate_limit_allow(key, max_events=3, window_sec=60) is True
    assert app_user_store.rate_limit_allow(key, max_events=3, window_sec=60) is False
