"""추천받기 (API-SPEC §5.2)."""

import logging
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
from .weather import LocationIn, daily_weather

router = APIRouter(prefix="/api/recommendations")
log = logging.getLogger("uvicorn.error")


class RecommendIn(BaseModel):
    day: date = Field(alias="date")
    region: Optional[str] = None  # 사용자가 바꾼 지역. 없으면 현재 위치 → 내 지역 → 서울
    location: Optional[LocationIn] = None  # 현재 위치 (D-022). 고른 지역이 없을 때만 씀
    tag_id: Optional[int] = None  # 추천을 받을 때는 태그가 꼭 있어야 합니다. (PRD §5)
    # 요청 글: 원하는 상황이나 분위기. 추천에만 쓰고 저장하지 않습니다. (P-39, 사람이 정함 2026-10-22)
    request: Optional[str] = Field(None, max_length=200)
    # (D-029) 예전 화면이 보내던 persona는 받아도 무시합니다. (pydantic이 모르는 칸은 버림)


def _keywords_by_clothing(session: Session) -> dict:
    """옷 번호 → {키워드 종류: [이름, ...]}. 지운 옷도 들어 있습니다."""
    links = session.exec(
        select(ClothingKeyword.clothing_id, Keyword.kind, Keyword.name)
        .join(Keyword, Keyword.id == ClothingKeyword.keyword_id)
    ).all()
    keywords = {}
    for clothing_id, kind, name in links:
        keywords.setdefault(clothing_id, {}).setdefault(kind, []).append(name)
    return keywords


def closet_for_ai(session: Session) -> list[dict]:
    """지운 옷을 뺀 옷장. 옷마다 구분과 키워드 이름을 붙입니다."""
    clothes = session.exec(
        select(Clothing).where(Clothing.is_deleted == False).order_by(Clothing.id)  # noqa: E712
    ).all()
    keywords = _keywords_by_clothing(session)
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
                   "fewer_than_three": False, "shopping": []})

    # ③ 날씨 ④ AI ⑤ 검사 (검사는 ai.recommend 안에서 합니다)
    # 추천 AI가 고른 코디는 평가 AI가 따로 점수를 매깁니다. (U6)
    from .scores import outfit_items  # scores.py가 이 파일을 불러오므로 여기서 불러옵니다.

    weather = daily_weather(session, body.day, body.region, body.location)
    try:
        answer = ai.recommend(closet, weather, tag.name, request=(body.request or "").strip() or None,
                              items_for=lambda outfit: outfit_items(session, outfit))
    except ExternalError as exc:
        # 왜 실패했는지 서버 터미널에 남깁니다. 오류 문장에는 키가 들어가지 않습니다. (P-41)
        log.warning("추천 실패: %s", exc.args)
        raise ApiError("recommend_failed", "추천을 받지 못했어요.", 502)

    outfits = answer["outfits"]
    favorites = favorite_ids(session)
    for item in outfits:
        item["favorite_id"] = favorites.get(outfit_key(item["outfit"]))
    return ok({"insufficient": None, "weather": weather, "outfits": outfits,
               "fewer_than_three": len(outfits) < 3, "shopping": answer["shopping"]})
