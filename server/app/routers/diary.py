"""코디 일기 (API-SPEC §5.3, §6): 확정하기, 목록, 입혀 보기, 지우기."""

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import Clothing, DiaryEntry, Settings, StyleTag
from ..responses import ApiError, confirm, ok
from ..rules import SLOTS, outfit_key
from .clothes import clothing_summary
from .recommendations import favorite_ids
from .scores import OutfitIn, check_outfit_or_fail
from .weather import LocationIn, daily_weather

router = APIRouter(prefix="/api/diary")

MIN_SCORE, MAX_SCORE = 0.1, 5.0


class WeatherIn(BaseModel):
    # 날씨 칸은 모두 있어야 합니다. 빠지면 입력 오류입니다. (D-006, TEST-PLAN T-70)
    region: str = Field(min_length=1)
    min_temp: float
    max_temp: float
    condition: Literal["clear", "cloudy", "rain", "snow"]


class NoteIn(BaseModel):
    score: float
    note_type: Literal["reason", "comment"]
    summary: str = Field(min_length=1)
    details: dict[str, str] = {}


class DiaryIn(BaseModel):
    outfit: OutfitIn
    day: date = Field(alias="date")
    weather: WeatherIn
    tag_id: Optional[int] = None
    result: NoteIn
    # 같은 날짜 확인 질문에서 [바꾸기]를 눌렀을 때 true로 다시 보냅니다.
    confirmed: bool = False


# 확정하기. 점수와 날씨는 화면이 보내고, 서버는 다시 검사합니다. (D-006)
# 날짜가 5일 안인지는 검사하지 않습니다. 자정을 넘겨 확정해도 받기 위해서입니다. (D-006, T-87)
@router.post("")
def confirm_outfit(body: DiaryIn, session: Session = Depends(get_session)):
    outfit = body.outfit.model_dump()
    check_outfit_or_fail(session, outfit)
    if not MIN_SCORE <= round(body.result.score, 1) <= MAX_SCORE:
        raise ApiError("score_out_of_range", "점수가 0.1~5.0 밖이에요.")
    if body.tag_id is not None and session.get(StyleTag, body.tag_id) is None:
        raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)
    settings = session.get(Settings, 1)
    if settings is None:
        raise ApiError("no_mannequin", "마네킹 모양을 먼저 골라 주세요.")

    existing = session.exec(select(DiaryEntry).where(DiaryEntry.date == body.day)).first()
    if existing is not None:
        if not body.confirmed:
            return confirm("same_date", date=body.day.isoformat())
        # 바꾸면 그 날짜의 코디는 하나만 남습니다. (PRD §7 확정하기)
        session.delete(existing)
        session.flush()

    entry = DiaryEntry(
        date=body.day,
        **{f"{slot}_id": outfit[slot] for slot in SLOTS},
        # 지금 설정의 마네킹 모양을 복사합니다. 카드 그림을 이 모양으로 그립니다. (DATA-MODEL §6)
        mannequin_gender=settings.mannequin_gender,
        mannequin_height=settings.mannequin_height,
        mannequin_body=settings.mannequin_body,
        weather_region=body.weather.region,
        weather_min_temp=body.weather.min_temp,
        weather_max_temp=body.weather.max_temp,
        weather_condition=body.weather.condition,
        style_tag_id=body.tag_id,
        score=round(body.result.score, 1),
        note_type=body.result.note_type,
        note_summary=body.result.summary,
        note_details={k: v for k, v in body.result.details.items() if k in SLOTS},
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return ok({"id": entry.id, "date": entry.date.isoformat(), "weather": body.weather.model_dump()})


class TryOnIn(BaseModel):
    day: date = Field(alias="date")
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 현재 위치 → 내 지역 → 서울
    location: Optional[LocationIn] = None  # 현재 위치 (D-022). 고른 지역이 없을 때만 씀


def _get_entry(session: Session, entry_id: int) -> DiaryEntry:
    entry = session.get(DiaryEntry, entry_id)
    if entry is None:
        raise ApiError("diary_not_found", "그 기록이 이미 없어요.", 404)
    return entry


def _slots(entry) -> dict:
    return {slot: getattr(entry, f"{slot}_id") for slot in SLOTS}


def deleted_slots(slots: dict, clothes: dict) -> list[str]:
    """코디 구성 중 지운 옷이 든 칸 (API-SPEC §2.4 지운 옷 칸)"""
    return [slot for slot in SLOTS if slots[slot] is not None and clothes[slots[slot]].is_deleted]


# 메뉴 "코디 일기": 날짜순으로 모읍니다. 아직 오지 않은 날이 맨 앞에 옵니다. (PRD §7)
# 지운 옷도 그림이 계속 보이도록 옷 정보를 함께 보냅니다. (ARCHITECTURE 흐름 7)
@router.get("")
def list_diary(session: Session = Depends(get_session)):
    entries = session.exec(select(DiaryEntry).order_by(DiaryEntry.date.desc())).all()
    clothes = {c.id: c for c in session.exec(select(Clothing)).all()}
    tags = {t.id: t.name for t in session.exec(select(StyleTag)).all()}
    favorites = favorite_ids(session)
    items = []
    for e in entries:
        slots = _slots(e)
        items.append({
            "id": e.id,
            "date": e.date.isoformat(),
            "outfit": {slot: clothing_summary(clothes[i]) if i is not None else None
                       for slot, i in slots.items()},
            "mannequin": {"gender": e.mannequin_gender, "height": e.mannequin_height,
                          "body": e.mannequin_body},
            "weather": {"region": e.weather_region, "min_temp": e.weather_min_temp,
                        "max_temp": e.weather_max_temp, "condition": e.weather_condition},
            "tag": {"id": e.style_tag_id, "name": tags[e.style_tag_id]} if e.style_tag_id else None,
            "result": {"score": e.score, "note_type": e.note_type, "summary": e.note_summary,
                       "details": e.note_details},
            "deleted_slots": deleted_slots(slots, clothes),
            "favorite_id": favorites.get(outfit_key(slots)),
        })
    return ok(items)


# 입혀 보기: 그 기록의 코디 구성과 태그, 지운 옷 칸, 고른 날짜의 날씨를 돌려줍니다.
# 지운 옷이 든 칸은 비워서 보냅니다. 날씨를 받지 못해도 옷 고르기는 열립니다. (API-SPEC §6, 제안)
@router.post("/{entry_id}/try-on")
def try_on(entry_id: int, body: TryOnIn, session: Session = Depends(get_session)):
    entry = _get_entry(session, entry_id)
    slots = _slots(entry)
    ids = [i for i in slots.values() if i is not None]
    clothes = {c.id: c for c in session.exec(select(Clothing).where(Clothing.id.in_(ids))).all()}
    gone = deleted_slots(slots, clothes)
    weather, weather_error = None, None
    try:
        weather = daily_weather(session, body.day, body.region, body.location)
    except ApiError as e:
        if e.kind != "weather_failed":
            raise
        weather_error = e.message
    return ok({
        "date": body.day.isoformat(),
        "outfit": {slot: (None if slot in gone else i) for slot, i in slots.items()},
        "tag_id": entry.style_tag_id,
        "deleted_slots": gone,
        "weather": weather,
        "weather_error": weather_error,
    })


# 지우기. 즐겨찾기는 따로 저장되어 있어 그대로 남습니다. (DATA-MODEL §1.2)
@router.delete("/{entry_id}")
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    session.delete(_get_entry(session, entry_id))
    session.commit()
    return ok(None)
