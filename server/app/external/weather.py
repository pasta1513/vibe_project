"""날씨. `server/.env`의 WEATHER_PROVIDER가 openweathermap이면 진짜, 없거나 fake면 가짜입니다. (D-007, D-016)

진짜: OpenWeatherMap의 무료 "5일 / 3시간 예보"를 받아 한국 시간 하루로 합칩니다. (P-29)
키는 `server/.env`의 OPENWEATHERMAP_API_KEY에서 읽고, 응답이나 오류 글에 넣지 않습니다. (D-004)
"""

import json
import math
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

from . import ExternalError, should_fake_fail

# 날짜에 따라 돌아가며 주어 날씨 배경 4가지를 모두 볼 수 있게 합니다. (D-007, 기온은 사람이 승인함)
_FAKE_DAYS = [
    ("clear", 12, 22),
    ("cloudy", 10, 18),
    ("rain", 8, 14),
    ("snow", -5, 1),
]

# 시·도마다 날씨를 받을 대표 지점: 도청·시청 소재지 (사람이 정함, 2026-10-22, D-016). (위도, 경도)
REGION_POINTS = {
    "서울": (37.5663, 126.9779),  # 서울시청
    "부산": (35.1798, 129.0750),  # 부산시청
    "대구": (35.8714, 128.6014),  # 대구시청
    "인천": (37.4563, 126.7052),  # 인천시청
    "광주": (35.1601, 126.8514),  # 광주시청
    "대전": (36.3504, 127.3845),  # 대전시청
    "울산": (35.5384, 129.3114),  # 울산시청
    "세종": (36.4800, 127.2890),  # 세종시청
    "경기": (37.2890, 127.0533),  # 경기도청 (수원)
    "강원": (37.8854, 127.7298),  # 강원도청 (춘천)
    "충북": (36.6357, 127.4914),  # 충북도청 (청주)
    "충남": (36.6588, 126.6728),  # 충남도청 (홍성 내포)
    "전북": (35.8203, 127.1088),  # 전북도청 (전주)
    "전남": (34.8161, 126.4629),  # 전남도청 (무안 남악)
    "경북": (36.5760, 128.5056),  # 경북도청 (안동·예천)
    "경남": (35.2378, 128.6919),  # 경남도청 (창원)
    "제주": (33.4890, 126.4983),  # 제주도청
}

KST = timezone(timedelta(hours=9))
BASE_URL = "https://api.openweathermap.org/data/2.5"
TIMEOUT_SECONDS = 10  # API-SPEC §2.3
CACHE_SECONDS = 30 * 60  # 같은 지점의 5일 예보는 30분 동안 다시 받지 않습니다. (D-016)
DAYTIME_HOURS = range(6, 22)  # 낮 06~21시 예보로 상태를 정합니다. (D-016)
CLOUDY_PERCENT = 60
RAIN_MAINS = {"Rain", "Drizzle", "Thunderstorm"}

_cache: dict = {}
_cache_lock = threading.Lock()


def is_real() -> bool:
    return os.environ.get("WEATHER_PROVIDER", "fake").strip().lower() == "openweathermap"


def round_point(lat: float, lon: float) -> tuple[float, float]:
    """좌표를 소수 둘째 자리(약 1km)로 반올림합니다. 개인정보를 줄이고 같은 동네는 기억한 예보를 씁니다. (D-016)"""
    return round(lat, 2), round(lon, 2)


def nearest_region(lat: float, lon: float) -> str:
    """가장 가까운 시·도. 현재 위치의 이름("부산(현재 위치)")에만 씁니다. (D-016)"""
    def distance(point):
        p_lat, p_lon = point
        x = math.radians(lon - p_lon) * math.cos(math.radians((lat + p_lat) / 2))
        y = math.radians(lat - p_lat)
        return x * x + y * y
    return min(REGION_POINTS, key=lambda name: distance(REGION_POINTS[name]))


def get_daily_weather(day: date, region: str, point: tuple[float, float] | None = None) -> dict:
    """그날의 하루 날씨를 받습니다.

    region: 응답에 넣을 지역 이름 (예: "서울", "부산(현재 위치)")
    point: 날씨를 받을 좌표. 없으면 region의 대표 지점
    돌려주는 것: {"region", "min_temp", "max_temp", "condition"}
    지역을 정하는 순서(고른 지역 → 현재 위치 → 내 지역 → 서울)는 날씨 기능(routers/weather.py)에서 정합니다.
    """
    if should_fake_fail("weather"):
        raise ExternalError("weather_failed")
    if not is_real():
        condition, min_temp, max_temp = _FAKE_DAYS[day.toordinal() % len(_FAKE_DAYS)]
        return {"region": region, "min_temp": min_temp, "max_temp": max_temp, "condition": condition}
    if point is None:
        point = REGION_POINTS[region]
    slots = [s for s in _forecast(*round_point(*point)) if _kst(s["dt"]).date() == day]
    if not slots and day == datetime.now(KST).date():
        # 밤늦게는 오늘 남은 예보가 없어 "현재 날씨"로 대신합니다.
        slots = [_get("weather", *round_point(*point))]
    if not slots:
        raise ExternalError("weather_failed", "그 날짜의 예보가 없습니다.")
    return {"region": region, **summarize(slots)}


def summarize(slots: list[dict]) -> dict:
    """3시간 예보 여러 개를 하루 날씨 하나로 합칩니다. (사람이 정함, 2026-10-22, D-016)

    기온: 그날 예보의 가장 낮은 최저와 가장 높은 최고 (정수로 반올림)
    상태: 낮(06~21시) 예보만 보고, 눈이 한 번이라도 있으면 눈, 비(이슬비·뇌우 포함)가 있으면 비,
          구름 60% 이상인 예보가 절반 이상이면 흐림, 아니면 맑음. 낮 예보가 없으면 그날 예보를 모두 봄
    """
    min_temp = round(min(s["main"]["temp_min"] for s in slots))
    max_temp = round(max(s["main"]["temp_max"] for s in slots))
    daytime = [s for s in slots if _kst(s["dt"]).hour in DAYTIME_HOURS] or slots
    mains = {w["main"] for s in daytime for w in s.get("weather", [])}
    if "Snow" in mains:
        condition = "snow"
    elif mains & RAIN_MAINS:
        condition = "rain"
    elif sum(1 for s in daytime if s.get("clouds", {}).get("all", 0) >= CLOUDY_PERCENT) * 2 >= len(daytime):
        condition = "cloudy"
    else:
        condition = "clear"
    return {"min_temp": min_temp, "max_temp": max_temp, "condition": condition}


def _kst(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, KST)


def _forecast(lat: float, lon: float) -> list[dict]:
    """5일 / 3시간 예보 40개. 같은 좌표는 30분 동안 기억한 것을 씁니다."""
    key = (lat, lon)
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
            return hit[1]
    slots = _get("forecast", lat, lon)["list"]
    with _cache_lock:
        _cache[key] = (time.monotonic(), slots)
    return slots


def _get(path: str, lat: float, lon: float) -> dict:
    """OpenWeatherMap을 부릅니다. 실패하면 ExternalError("weather_failed"). 오류 글에 키나 주소를 넣지 않습니다."""
    api_key = os.environ.get("OPENWEATHERMAP_API_KEY", "").strip()
    if not api_key:
        raise ExternalError("weather_failed", "OpenWeatherMap 키가 없습니다.")
    query = urllib.parse.urlencode({"lat": lat, "lon": lon, "units": "metric", "appid": api_key})
    try:
        with urllib.request.urlopen(f"{BASE_URL}/{path}?{query}", timeout=TIMEOUT_SECONDS) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        raise ExternalError("weather_failed", f"OpenWeatherMap HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise ExternalError("weather_failed", f"OpenWeatherMap 연결 실패 ({type(exc).__name__})") from None
    if path == "forecast" and not isinstance(data.get("list"), list):
        raise ExternalError("weather_failed", "OpenWeatherMap 답의 모양이 다릅니다.")
    return data
