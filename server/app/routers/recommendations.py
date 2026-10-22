"""추천받기 (API-SPEC §5.2)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..external import ExternalError, ai
from ..models import Clothing, ClothingKeyword, Favorite, Keyword, StyleTag
from ..responses import ApiError, ok
from ..rules import SLOTS, missing_for_outfit, outfit_key
from .weather import daily_weather

router = APIRouter(prefix="/api/recommendations")


class RecommendIn(BaseModel):
    day: date = Field(alias="date")
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 내 지역 → 서울
    tag_id: Optional[int] = None  # 추천을 받을 때는 태그가 꼭 있어야 합니다. (PRD §5)


def closet_for_ai(session: Session) -> list[dict]:
    """지운 옷을 뺀 옷장. 옷마다 구분과 키워드 이름을 붙입니다."""
    clothes = session.exec(
        select(Clothing).where(Clothing.is_deleted == False).order_by(Clothing.id)  # noqa: E712
    ).all()
    links = session.exec(
        select(ClothingKeyword.clothing_id, Keyword.kind, Keyword.name)
        .join(Keyword, Keyword.id == ClothingKeyword.keyword_id)
    ).all()
    keywords = {}
    for clothing_id, kind, name in links:
        keywords.setdefault(clothing_id, {}).setdefault(kind, []).append(name)
    return [{"id": c.id, "category": c.category, "keywords": keywords.get(c.id, {})}
            for c in clothes]


def favorite_ids(session: Session) -> dict:
    """코디 구성 → 즐겨찾기 번호. 카드의 별(☆/★)에 씁니다. (API-SPEC §2.4 즐겨찾기 표시)"""
    found = {}
    for fav in session.exec(select(Favorite)).all():
        slots = {slot: getattr(fav, f"{slot}_id") for slot in SLOTS}
        found[outfit_key(slots)] = fav.id
    return found


@router.post("")
def recommend(body: RecommendIn, session: Session = Depends(get_session)):
    # ① 태그가 있는지
    if body.tag_id is None:
        raise ApiError("tag_required", "스타일 태그를 먼저 골라 주세요.")
    tag = session.get(StyleTag, body.tag_id)
    if tag is None:
        raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)

    # ② 옷이 부족한지. 부족하면 실패가 아니라 먼저 등록할 구분을 알려 줍니다.
    closet = closet_for_ai(session)
    missing = missing_for_outfit({c["category"] for c in closet})
    if missing:
        return ok({"insufficient": missing, "weather": None, "outfits": [],
                   "fewer_than_three": False})

    # ③ 날씨 ④ AI ⑤ 검사 (검사는 ai.recommend 안에서 합니다)
    # 추천 AI가 고른 코디는 평가 AI가 2D 이미지와 키워드로 점수를 매깁니다. (P-26)
    from .scores import outfit_items  # scores.py가 이 파일을 불러오므로 여기서 불러옵니다.

    weather = daily_weather(session, body.day, body.region)
    try:
        outfits = ai.recommend(closet, weather, tag.name,
                               items_for=lambda outfit: outfit_items(session, outfit))
    except ExternalError:
        raise ApiError("recommend_failed", "추천을 받지 못했어요.", 502)

    favorites = favorite_ids(session)
    for item in outfits:
        item["favorite_id"] = favorites.get(outfit_key(item["outfit"]))
    return ok({"insufficient": None, "weather": weather, "outfits": outfits,
               "fewer_than_three": len(outfits) < 3})
