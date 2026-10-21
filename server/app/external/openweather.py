"""진짜 날씨: OpenWeatherMap의 무료 예보 (D-014 제안, P-29).

weather.py가 부르는 함수 모양은 가짜 날씨와 같습니다.
- 5 Day / 3 Hour Forecast: 지금부터 120시간을 3시간 간격으로 받습니다. 오늘 포함 5일이 들어옵니다.
- Current Weather: 오늘은 지난 시간이 예보에 없어서, 지금 날씨를 함께 넣어 계산합니다.
키는 `server/.env`의 OPENWEATHERMAP_API_KEY에서 읽습니다. (D-004) 키는 응답이나 기록에 넣지 않습니다.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

from . import ExternalError

BASE_URL = "https://api.openweathermap.org/data/2.5"
# 날씨 받기는 10초 안에 끝나야 합니다 (API-SPEC §2.3). 요청이 최대 두 번이라 하나에 5초씩입니다.
REQUEST_TIMEOUT = 5
# 같은 지역은 10분 동안 받은 예보를 다시 씁니다. (제안) 점수 확인과 확정 사이에 날씨가 바뀌지 않게 합니다.
CACHE_SECONDS = 600

# 시·도 17곳 (D-012)의 도청·시청 근처 좌표. 지오코딩 API를 부르지 않으려고 표로 둡니다. (제안)
REGION_COORDS = {
    "서울": (37.5665, 126.9780), "부산": (35.1796, 129.0756), "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052), "광주": (35.1595, 126.8526), "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114), "세종": (36.4800, 127.2890), "경기": (37.2752, 127.0095),
    "강원": (37.8853, 127.7298), "충북": (36.6357, 127.4917), "충남": (36.6588, 126.6728),
    "전북": (35.8203, 127.1088), "전남": (34.8161, 126.4629), "경북": (36.5760, 128.5056),
    "경남": (35.2383, 128.6924), "제주": (33.4890, 126.4983),
}

_cache = {}  # 지역 → (받은 시각, 예보, 지금 날씨)


def _get(path: str, region: str) -> dict:
    key = os.environ.get("OPENWEATHERMAP_API_KEY", "").strip()
    if not key:
        raise ExternalError("weather_failed", "OPENWEATHERMAP_API_KEY가 없습니다.")
    lat, lon = REGION_COORDS[region]
    query = urllib.parse.urlencode({"lat": lat, "lon": lon, "units": "metric", "appid": key})
    try:
        with urllib.request.urlopen(f"{BASE_URL}/{path}?{query}", timeout=REQUEST_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # 주소에 키가 들어 있으므로 상태 번호만 남깁니다.
        raise ExternalError("weather_failed", f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise ExternalError("weather_failed", type(exc).__name__) from None


def _fetch(region: str) -> tuple[dict, dict]:
    cached = _cache.get(region)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1], cached[2]
    forecast = _get("forecast", region)
    current = _get("weather", region)
    _cache[region] = (time.monotonic(), forecast, current)
    return forecast, current


def _kind(weather_id: int) -> str:
    """OpenWeatherMap 날씨 번호를 칸 하나의 종류로. (Weather condition codes)"""
    if 600 <= weather_id < 700:
        return "snow"
    if 200 <= weather_id < 600:  # 뇌우 2xx, 이슬비 3xx, 비 5xx
        return "rain"
    if weather_id in (803, 804) or 700 <= weather_id < 800:  # 구름 많음, 흐림, 안개 등
        return "cloudy"
    return "clear"  # 800 맑음, 801·802 구름 조금


def _condition(kinds: list[str]) -> str:
    """하루 상태 하나: 눈 칸이 있으면 눈 → 비 칸이 있으면 비 → 흐린 칸이 절반 이상이면 흐림 → 맑음. (제안)"""
    if "snow" in kinds:
        return "snow"
    if "rain" in kinds:
        return "rain"
    if kinds.count("cloudy") * 2 >= len(kinds):
        return "cloudy"
    return "clear"


def daily_from(forecast: dict, current: dict, day: date, today: date) -> dict:
    """예보와 지금 날씨에서 그날의 최저·최고 기온과 상태를 계산합니다.

    예보 시각은 UTC라서 응답의 시간대(city.timezone, 초)를 더해 그 지역 날짜로 묶습니다.
    오늘은 지금 날씨를 한 칸 더 넣습니다. 칸이 하나도 없으면 실패입니다.
    """
    offset = timedelta(seconds=forecast.get("city", {}).get("timezone", 0))
    temps, kinds = [], []
    for step in forecast.get("list", []):
        local = datetime.fromtimestamp(step["dt"], tz=timezone.utc) + offset
        if local.date() != day:
            continue
        temps += [step["main"]["temp_min"], step["main"]["temp_max"]]
        kinds.append(_kind(step["weather"][0]["id"]))
    if day == today and current.get("main"):
        temps.append(current["main"]["temp"])
        kinds.append(_kind(current["weather"][0]["id"]))
    if not temps:
        raise ExternalError("weather_failed", "그날의 예보가 없습니다.")
    return {"min_temp": round(min(temps)), "max_temp": round(max(temps)), "condition": _condition(kinds)}


def get_daily_weather(day: date, region: str) -> dict:
    forecast, current = _fetch(region)
    return {"region": region, **daily_from(forecast, current, day, date.today())}
