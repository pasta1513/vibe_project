"""점수 확인하기 (API-SPEC §5.2)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .. import photos
from ..db import get_session
from ..external import ExternalError, ai
from ..models import Clothing, StyleTag
from ..responses import ApiError, ok
from ..rules import SLOTS, check_outfit, particle
from .recommendations import closet_for_ai
from .weather import LocationIn, daily_weather

router = APIRouter(prefix="/api/scores")

SLOT_NAMES = {"top": "상의", "bottom": "하의", "dress": "원피스", "shoes": "신발", "outer": "아우터"}
OUTFIT_ERRORS = {
    "empty_slot": "빈 칸이 있어요.",
    "dress_with_top_bottom": "원피스와 상의·하의를 함께 입을 수 없어요.",
    "unknown_clothing": "옷장에 없는 옷이 있어요.",
    "wrong_category": "칸에 맞지 않는 옷이 있어요.",
}


class OutfitIn(BaseModel):
    top: Optional[int] = None
    bottom: Optional[int] = None
    dress: Optional[int] = None
    shoes: Optional[int] = None
    outer: Optional[int] = None  # 비어 있으면 "입지 않음"


class ScoreIn(BaseModel):
    outfit: OutfitIn
    day: date = Field(alias="date")
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 현재 위치 → 내 지역 → 서울
    location: Optional[LocationIn] = None  # 현재 위치 (D-022). 고른 지역이 없을 때만 씀
    tag_id: Optional[int] = None  # 태그를 고르지 않았으면 없음


def check_outfit_or_fail(session: Session, outfit: dict) -> None:
    """빈 칸, 지운 옷, 칸과 구분이 맞는지 봅니다. (API-SPEC §5.2 ①, D-006)"""
    ids = [i for i in outfit.values() if i is not None]
    clothes = session.exec(select(Clothing).where(Clothing.id.in_(ids))).all() if ids else []
    deleted = {c.id for c in clothes if c.is_deleted}
    if deleted:
        slots = [SLOT_NAMES[s] for s in SLOTS if outfit.get(s) in deleted]
        names = ", ".join(slots)
        raise ApiError("deleted_clothing",
                       f"지운 옷이 있어요. {names}{particle(names, '을', '를')} 다시 골라 주세요.")
    problem = check_outfit(outfit, {c.id: c.category for c in clothes})
    if problem:
        raise ApiError(problem, OUTFIT_ERRORS[problem])


def outfit_items(session: Session, outfit: dict) -> list[dict]:
    """AI에 넘길 칸마다의 옷 정보: 칸, 구분, 키워드, 2D 이미지 파일 (P-25, 사람이 정함 2026-10-21)"""
    closet = {c["id"]: c for c in closet_for_ai(session)}
    clothes = {c.id: c for c in session.exec(
        select(Clothing).where(Clothing.id.in_([i for i in outfit.values() if i is not None]))).all()}
    items = []
    for slot in SLOTS:
        clothing_id = outfit.get(slot)
        if clothing_id is None:
            continue
        items.append({
            "slot": slot,
            "category": clothes[clothing_id].category,
            "keywords": closet.get(clothing_id, {}).get("keywords", {}),
            "image_path": photos.find_file(clothes[clothing_id].image_path),
        })
    return items


@router.post("")
def score_outfit(body: ScoreIn, session: Session = Depends(get_session)):
    outfit = body.outfit.model_dump()
    check_outfit_or_fail(session, outfit)
    tag = None
    if body.tag_id is not None:
        tag = session.get(StyleTag, body.tag_id)
        if tag is None:
            raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)

    weather = daily_weather(session, body.day, body.region, body.location)
    try:
        result = ai.score(outfit, weather, tag.name if tag else None, outfit_items(session, outfit))
    except ExternalError:
        raise ApiError("score_failed", "점수를 받지 못했어요.", 502)
    return ok({"weather": weather, "result": result})
