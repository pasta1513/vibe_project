"""날씨. 진짜(OpenWeatherMap, 사용 예정)를 연결하기 전까지는 가짜입니다. (D-007)"""

from datetime import date

from . import ExternalError, should_fake_fail

# 날짜에 따라 돌아가며 주어 날씨 배경 4가지를 모두 볼 수 있게 합니다. (D-007, 기온은 사람이 승인함)
_FAKE_DAYS = [
    ("clear", 12, 22),
    ("cloudy", 10, 18),
    ("rain", 8, 14),
    ("snow", -5, 1),
]


def get_daily_weather(day: date, region: str) -> dict:
    """그날의 하루 날씨를 받습니다.

    돌려주는 것: {"region", "min_temp", "max_temp", "condition"}
    지역을 정하는 순서(현재 위치 → 내 지역 → 서울)는 날씨 기능에서 정한 뒤 region으로 넘깁니다.
    """
    if should_fake_fail("weather"):
        raise ExternalError("weather_failed")
    condition, min_temp, max_temp = _FAKE_DAYS[day.toordinal() % len(_FAKE_DAYS)]
    return {"region": region, "min_temp": min_temp, "max_temp": max_temp, "condition": condition}
