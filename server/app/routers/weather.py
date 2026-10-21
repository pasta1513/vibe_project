"""날씨 받기 (API-SPEC §5.1). 날짜를 바꾸거나 지역을 바꿀 때 부릅니다."""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..db import get_session
from ..external import ExternalError, weather
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


def resolve_region(session: Session, chosen: Optional[str]) -> tuple[str, bool]:
    """날씨를 볼 지역을 정합니다: 사용자가 바꾼 지역 → 내 지역 → 서울. (API-SPEC §5.1)

    현재 위치는 진짜 날씨 서비스를 연결할 때 붙입니다. (사람이 정함, 2026-10-21)
    돌려주는 것: (지역, 서울로 정해졌는지)
    """
    if chosen is not None:
        if chosen not in REGIONS:
            raise ApiError("unknown_region", "그 지역은 찾지 못했어요. 목록에서 골라 주세요.")
        return chosen, False
    settings = session.get(Settings, 1)
    if settings is not None and settings.home_region:
        return settings.home_region, False
    return DEFAULT_REGION, True


def daily_weather(session: Session, day: date, chosen: Optional[str]) -> dict:
    """날씨 묶음 (API-SPEC §2.4): 지역, 최저·최고 기온, 상태, 서울로 정해졌는지"""
    check_day(day)
    region, is_default = resolve_region(session, chosen)
    try:
        data = weather.get_daily_weather(day, region)
    except ExternalError:
        raise ApiError("weather_failed", "날씨를 받지 못했어요.", 502)
    return {**data, "date": day.isoformat(), "is_default_region": is_default}


@router.get("")
def get_weather(day: Optional[date] = Query(None, alias="date"), region: Optional[str] = None,
                session: Session = Depends(get_session)):
    return ok(daily_weather(session, day or date.today(), region))
