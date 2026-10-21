"""점수 확인하기 (API-SPEC §5.2)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..external import ExternalError, ai
from ..models import Clothing, StyleTag
from ..responses import ApiError, ok
from ..rules import SLOTS, check_outfit, particle
from .weather import daily_weather

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
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 내 지역 → 서울
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


@router.post("")
def score_outfit(body: ScoreIn, session: Session = Depends(get_session)):
    outfit = body.outfit.model_dump()
    check_outfit_or_fail(session, outfit)
    tag = None
    if body.tag_id is not None:
        tag = session.get(StyleTag, body.tag_id)
        if tag is None:
            raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)

    weather = daily_weather(session, body.day, body.region)
    try:
        result = ai.score(outfit, weather, tag.name if tag else None)
    except ExternalError:
        raise ApiError("score_failed", "점수를 받지 못했어요.", 502)
    return ok({"weather": weather, "result": result})
