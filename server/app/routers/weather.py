"""날씨 받기 (API-SPEC §5.1). 날짜를 바꾸거나 지역을 바꿀 때 부릅니다."""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..db import get_session
from ..external import ExternalError, openweather, weather
from ..models import Settings
from ..responses import ApiError, ok
from .settings import REGIONS

router = APIRouter(prefix="/api/weather")

# 오늘 포함 5일 (PRD §5)
DAYS_AHEAD = 4
DEFAULT_REGION = "서울"


def check_day(day: date) -> None:
    today = date.today()
    if not today <= day <= today + timedelta(days=DAYS_AHEAD):
        raise ApiError("date_out_of_range", "오늘부터 5일 안의 날짜만 고를 수 있어요.")


class LocationIn(BaseModel):
    """브라우저가 알려 준 현재 위치. 저장하지 않고 날씨를 받을 때만 씁니다. (D-022)"""
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


def resolve_region(session: Session, chosen: Optional[str], location: Optional[LocationIn] = None) -> dict:
    """날씨를 볼 지역을 정합니다: 사용자가 바꾼 지역 → 현재 위치 → 내 지역 → 서울. (API-SPEC §5.1, D-022)

    현재 위치는 그 좌표의 날씨를 받고, 이름은 가장 가까운 시·도에 "(현재 위치)"를 붙입니다.
    돌려주는 것: {"region": 이름, "area": 시·도, "point": 좌표 또는 None, "is_default_region", "is_current_location"}
    """
    if chosen is not None:
        if chosen not in REGIONS:
            raise ApiError("unknown_region", "그 지역은 찾지 못했어요. 목록에서 골라 주세요.")
        return _place(chosen)
    if location is not None:
        area = openweather.nearest_region(location.lat, location.lon)
        return {**_place(area), "region": f"{area}(현재 위치)",
                "point": openweather.round_point(location.lat, location.lon), "is_current_location": True}
    settings = session.get(Settings, 1)
    if settings is not None and settings.home_region:
        return _place(settings.home_region)
    return {**_place(DEFAULT_REGION), "is_default_region": True}


def _place(area: str) -> dict:
    return {"region": area, "area": area, "point": None,
            "is_default_region": False, "is_current_location": False}


def daily_weather(session: Session, day: date, chosen: Optional[str],
                  location: Optional[LocationIn] = None) -> dict:
    """날씨 묶음 (API-SPEC §2.4): 지역, 시·도, 최저·최고 기온, 상태, 서울로 정해졌는지, 현재 위치인지"""
    check_day(day)
    place = resolve_region(session, chosen, location)
    try:
        data = weather.get_daily_weather(day, place["area"], place["point"])
    except ExternalError:
        raise ApiError("weather_failed", "날씨를 받지 못했어요.", 502)
    return {**data, "region": place["region"], "area": place["area"], "date": day.isoformat(),
            "is_default_region": place["is_default_region"],
            "is_current_location": place["is_current_location"]}


@router.get("")
def get_weather(day: Optional[date] = Query(None, alias="date"), region: Optional[str] = None,
                lat: Optional[float] = None, lon: Optional[float] = None,
                session: Session = Depends(get_session)):
    location = None
    if lat is not None or lon is not None:
        try:
            location = LocationIn(lat=lat, lon=lon)
        except ValueError:
            raise ApiError("invalid_input", "보낸 값이 올바르지 않아요.")
    return ok(daily_weather(session, day or date.today(), region, location))
