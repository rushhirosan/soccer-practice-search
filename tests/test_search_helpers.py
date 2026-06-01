"""Search helper unit tests (keyword / duration filters)."""

from app import (
    ALLOWED_DURATION_MAX_MINUTES,
    duration_text_to_seconds,
    normalize_search_query,
    parse_duration_max_filter,
)


def test_normalize_search_query_nfkc():
    assert normalize_search_query("　パス　") == "パス"


def test_parse_duration_max_filter_whitelist():
    assert parse_duration_max_filter("10") == 10
    assert parse_duration_max_filter("60") == 60
    assert parse_duration_max_filter("99") is None
    assert parse_duration_max_filter("") is None
    assert parse_duration_max_filter("x") is None


def test_allowed_duration_values():
    assert ALLOWED_DURATION_MAX_MINUTES == (10, 15, 20, 30, 45, 60)


def test_duration_text_to_seconds():
    assert duration_text_to_seconds("0:05:30") == 330
    assert duration_text_to_seconds("1:23:45") == 5025
    assert duration_text_to_seconds("1 day, 0:00:00") is None
    assert duration_text_to_seconds("") is None
    assert duration_text_to_seconds("bad") is None
