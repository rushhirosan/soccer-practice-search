import pytest

from utilities.update_category_db import assign_number, is_meaningful_players_label


@pytest.mark.parametrize(
    "value,expected",
    [
        ("8人", True),
        ("11対11", True),
        ("人数指定なし", True),
        ("000人", False),
        ("0人", False),
        ("0対0", False),
        ("0対11", False),
    ],
)
def test_is_meaningful_players_label(value, expected):
    assert is_meaningful_players_label(value) is expected


def test_assign_number_rejects_zero_counts():
    assert assign_number("練習 000人 ドリブル") == "人数指定なし"
    assert assign_number("8人サイドゲーム") == "8人"
    assert assign_number("0対0マッチ") == "人数指定なし"
