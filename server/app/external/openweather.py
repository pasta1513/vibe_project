"""진짜 날씨: OpenWeatherMap의 무료 예보 (D-014 제안, P-29).

weather.py가 부르는 함수 모양은 가짜 날씨와 같습니다.
- 5 Day / 3 Hour Forecast: 지금부터 120시간을 3시간 간격으로 받습니다. 오늘 포함 5일이 들어옵니다.
- Current Weather: 오늘은 지난 시간이 예보에 없어서, 지금 날씨를 함께 넣어 계산합니다.
키는 `server/.env`의 OPENWEATHERMAP_API_KEY에서 읽습니다. (D-004) 키는 응답이나 기록에 넣지 않습니다.
"""

import json
import math
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

# 하루 상태는 활동 시간(06시~21시)에 걸친 칸만 보고 고릅니다. 칸이 시작하는 시각 06·09·12·15·18시입니다.
# 새벽에 잠깐 온 비로 하루가 "비"가 되지 않게 합니다. 기온은 하루 전체 칸으로 계산합니다. (사람이 정함, 2026-10-22)
ACTIVE_HOURS = range(6, 21)

_cache = {}  # 좌표 → (받은 시각, 예보, 지금 날씨)


def round_point(lat: float, lon: float) -> tuple[float, float]:
    """현재 위치 좌표를 소수 둘째 자리(약 1km)로 반올림합니다. 캐시도 이 좌표로 묶습니다. (D-022)"""
    return round(lat, 2), round(lon, 2)


def nearest_region(lat: float, lon: float) -> str:
    """좌표에서 가장 가까운 시·도 (17곳의 대표 좌표 기준, D-022)"""
    scale = math.cos(math.radians(lat))  # 경도 1도는 위도가 높을수록 짧습니다.
    return min(REGION_COORDS, key=lambda name: (REGION_COORDS[name][0] - lat) ** 2
               + ((REGION_COORDS[name][1] - lon) * scale) ** 2)


def _get(path: str, point: tuple[float, float]) -> dict:
    key = os.environ.get("OPENWEATHERMAP_API_KEY", "").strip()
    if not key:
        raise ExternalError("weather_failed", "OPENWEATHERMAP_API_KEY가 없습니다.")
    lat, lon = point
    query = urllib.parse.urlencode({"lat": lat, "lon": lon, "units": "metric", "appid": key})
    try:
        with urllib.request.urlopen(f"{BASE_URL}/{path}?{query}", timeout=REQUEST_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # 주소에 키가 들어 있으므로 상태 번호만 남깁니다.
        raise ExternalError("weather_failed", f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise ExternalError("weather_failed", type(exc).__name__) from None


def _fetch(point: tuple[float, float]) -> tuple[dict, dict]:
    cached = _cache.get(point)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1], cached[2]
    forecast = _get("forecast", point)
    current = _get("weather", point)
    _cache[point] = (time.monotonic(), forecast, current)
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
    """하루 상태 하나: 눈 칸이 있으면 눈 → 비 칸이 있으면 비 → 흐린 칸이 절반 이상이면 흐림 → 맑음. (D-014)"""
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
    상태는 활동 시간(ACTIVE_HOURS) 칸으로 고르고, 오늘 저녁처럼 그런 칸이 없으면 남은 칸 모두로 고릅니다.
    """
    offset = timedelta(seconds=forecast.get("city", {}).get("timezone", 0))
    temps, kinds, active_kinds = [], [], []
    for step in forecast.get("list", []):
        local = datetime.fromtimestamp(step["dt"], tz=timezone.utc) + offset
        if local.date() != day:
            continue
        temps += [step["main"]["temp_min"], step["main"]["temp_max"]]
        kind = _kind(step["weather"][0]["id"])
        kinds.append(kind)
        if local.hour in ACTIVE_HOURS:
            active_kinds.append(kind)
    if day == today and current.get("main"):
        temps.append(current["main"]["temp"])
        kind = _kind(current["weather"][0]["id"])
        kinds.append(kind)
        now = datetime.fromtimestamp(current["dt"], tz=timezone.utc) + offset if "dt" in current else None
        if now is not None and now.hour in ACTIVE_HOURS:
            active_kinds.append(kind)
    if not temps:
        raise ExternalError("weather_failed", "그날의 예보가 없습니다.")
    return {"min_temp": round(min(temps)), "max_temp": round(max(temps)),
            "condition": _condition(active_kinds or kinds)}


def get_daily_weather(day: date, region: str, point: tuple[float, float] | None = None) -> dict:
    """point: 현재 위치 좌표 (D-022). 없으면 region의 대표 좌표"""
    forecast, current = _fetch(round_point(*point) if point else REGION_COORDS[region])
    return {"region": region, **daily_from(forecast, current, day, date.today())}
