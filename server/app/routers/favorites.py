"""즐겨찾기 (API-SPEC §5.4, §7): 넣기, 코디 일기에서 넣기, 빼기, 목록, 순서 바꾸기, 입혀 보기."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Clothing, DiaryEntry, Favorite, Settings, StyleTag
from ..responses import ApiError, ok
from ..rules import SLOTS, outfit_key
from .clothes import clothing_summary
from .diary import deleted_slots
from .scores import OutfitIn, check_outfit_or_fail
from .weather import LocationIn, daily_weather

router = APIRouter(prefix="/api/favorites")


class FavoriteIn(BaseModel):
    outfit: OutfitIn
    tag_id: Optional[int] = None


class OrderIn(BaseModel):
    ids: list[int]


class TryOnIn(BaseModel):
    day: date = Field(alias="date")
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 현재 위치 → 내 지역 → 서울
    location: Optional[LocationIn] = None  # 현재 위치 (D-016). 고른 지역이 없을 때만 씀


def _slots(fav) -> dict:
    return {slot: getattr(fav, f"{slot}_id") for slot in SLOTS}


def _get_favorite(session: Session, favorite_id: int) -> Favorite:
    fav = session.get(Favorite, favorite_id)
    if fav is None:
        raise ApiError("favorite_not_found", "그 즐겨찾기가 이미 없어요.", 404)
    return fav


def _duplicate(session: Session, slots: dict) -> Optional[JSONResponse]:
    """같은 코디 구성이 이미 있으면 "이미 있음"을 돌려줍니다. 태그나 마네킹 모양은 보지 않습니다. (DATA-MODEL §7)
    카드의 별이 ★로 바뀔 수 있도록 있는 즐겨찾기 번호를 함께 보냅니다."""
    key = outfit_key(slots)
    for fav in session.exec(select(Favorite)).all():
        if outfit_key(_slots(fav)) == key:
            return JSONResponse(status_code=400, content={
                "result": "error",
                "error": {"kind": "duplicate", "message": "이미 즐겨찾기에 등록된 코디입니다.",
                          "favorite_id": fav.id},
            })
    return None


def _save(session: Session, slots: dict, tag_id, shape: tuple) -> dict:
    # 새 즐겨찾기는 맨 뒤에 붙습니다. (PRD §7 즐겨찾기)
    last = session.exec(select(func.max(Favorite.position))).one()
    fav = Favorite(**{f"{slot}_id": slots[slot] for slot in SLOTS}, style_tag_id=tag_id,
                   mannequin_gender=shape[0], mannequin_height=shape[1], mannequin_body=shape[2],
                   position=(last if last is not None else -1) + 1)
    session.add(fav)
    session.commit()
    session.refresh(fav)
    return ok({"id": fav.id})


# 점수 확인 단계의 [즐겨찾기], 추천 카드의 ☆. 지금 설정의 마네킹 모양을 복사합니다.
@router.post("")
def add_favorite(body: FavoriteIn, session: Session = Depends(get_session)):
    slots = body.outfit.model_dump()
    check_outfit_or_fail(session, slots)
    if body.tag_id is not None and session.get(StyleTag, body.tag_id) is None:
        raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)
    settings = session.get(Settings, 1)
    if settings is None:
        raise ApiError("no_mannequin", "마네킹 모양을 먼저 골라 주세요.")
    duplicate = _duplicate(session, slots)
    if duplicate:
        return duplicate
    return _save(session, slots, body.tag_id,
                 (settings.mannequin_gender, settings.mannequin_height, settings.mannequin_body))


# 코디 일기 카드의 ☆. 그 기록의 코디 구성, 태그, 마네킹 모양을 복사합니다.
# 지운 옷이 들어 있어도 넣습니다. (사람이 정함, 2026-10-20)
@router.post("/from-diary/{entry_id}")
def add_from_diary(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(DiaryEntry, entry_id)
    if entry is None:
        raise ApiError("diary_not_found", "그 기록이 이미 없어요.", 404)
    slots = _slots(entry)
    duplicate = _duplicate(session, slots)
    if duplicate:
        return duplicate
    return _save(session, slots, entry.style_tag_id,
                 (entry.mannequin_gender, entry.mannequin_height, entry.mannequin_body))


# 메뉴 "즐겨찾기": 저장된 순서대로. 코디 모습과 지운 옷 표시만 보입니다. 태그는 입혀 볼 때만 보냅니다.
@router.get("")
def list_favorites(session: Session = Depends(get_session)):
    favorites = session.exec(select(Favorite).order_by(Favorite.position, Favorite.id)).all()
    clothes = {c.id: c for c in session.exec(select(Clothing)).all()}
    items = []
    for fav in favorites:
        slots = _slots(fav)
        items.append({
            "id": fav.id,
            "outfit": {slot: clothing_summary(clothes[i]) if i is not None else None
                       for slot, i in slots.items()},
            "mannequin": {"gender": fav.mannequin_gender, "height": fav.mannequin_height,
                          "body": fav.mannequin_body},
            "deleted_slots": deleted_slots(slots, clothes),
        })
    return ok(items)


# 끌어서 순서 바꾸기. 지금 있는 즐겨찾기 번호가 빠짐없이 한 번씩 들어 있어야 합니다.
@router.put("/order")
def reorder(body: OrderIn, session: Session = Depends(get_session)):
    favorites = {f.id: f for f in session.exec(select(Favorite)).all()}
    if sorted(body.ids) != sorted(favorites):
        raise ApiError("order_mismatch", "즐겨찾기 목록이 바뀌었어요. 목록을 새로 볼게요.")
    for position, fav_id in enumerate(body.ids):
        favorites[fav_id].position = position
        session.add(favorites[fav_id])
    session.commit()
    return ok(None)


# 입혀 보기: 코디 구성과 저장할 때의 태그, 지운 옷 칸, 고른 날짜의 날씨를 돌려줍니다. (코디 일기와 같음)
@router.post("/{favorite_id}/try-on")
def try_on(favorite_id: int, body: TryOnIn, session: Session = Depends(get_session)):
    fav = _get_favorite(session, favorite_id)
    slots = _slots(fav)
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
    tag_id = fav.style_tag_id if fav.style_tag_id and session.get(StyleTag, fav.style_tag_id) else None
    return ok({
        "date": body.day.isoformat(),
        "outfit": {slot: (None if slot in gone else i) for slot, i in slots.items()},
        "tag_id": tag_id,
        "deleted_slots": gone,
        "weather": weather,
        "weather_error": weather_error,
    })


# 빼기. 코디 일기는 그대로 남습니다. (PRD §7 즐겨찾기)
@router.delete("/{favorite_id}")
def remove_favorite(favorite_id: int, session: Session = Depends(get_session)):
    session.delete(_get_favorite(session, favorite_id))
    session.commit()
    return ok(None)
