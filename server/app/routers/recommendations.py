"""추천받기 (API-SPEC §5.2)."""

from datetime import date
from typing import Literal, Optional

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
    # 요청 글: 원하는 상황이나 분위기. 추천에만 쓰고 저장하지 않습니다. (P-38, 사람이 정함 2026-10-22)
    request: Optional[str] = Field(None, max_length=200)
    # 페르소나: 전문가, 친구, 내 스타일(즐겨찾기 기반). 없으면 전문가 (P-38, 사람이 정함 2026-10-22)
    persona: Literal["expert", "friend", "my_style"] = "expert"


# "내 스타일" 추천에 넘길 즐겨찾기 수. 글이 길어져 기다림과 비용이 커지는 것을 막습니다. (사람이 정함, 2026-10-22)
FAVORITES_FOR_AI = 20


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


def favorites_for_ai(session: Session) -> list[dict]:
    """"내 스타일" 추천에 넘길 즐겨찾기. 사용자가 정한 순서로 앞에서 FAVORITES_FOR_AI개.

    지운 옷도 키워드는 취향 정보로 씁니다. 추천에는 옷장에 있는 옷만 나옵니다 (ai.py 검사).
    돌려주는 것: [{"tag": 태그 이름 또는 None, "slots": {칸: 키워드}}, ...]
    """
    favorites = session.exec(
        select(Favorite).order_by(Favorite.position).limit(FAVORITES_FOR_AI)).all()
    keywords = _keywords_by_clothing(session)
    tags = {t.id: t.name for t in session.exec(select(StyleTag)).all()}
    result = []
    for fav in favorites:
        slots = {slot: keywords.get(getattr(fav, f"{slot}_id"), {}) for slot in SLOTS
                 if getattr(fav, f"{slot}_id") is not None}
        result.append({"tag": tags.get(fav.style_tag_id), "slots": slots})
    return result


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

    # "내 스타일"은 즐겨찾기가 있어야 합니다. 없으면 AI를 부르지 않습니다. (사람이 정함, 2026-10-22)
    favorites_info = None
    if body.persona == "my_style":
        favorites_info = favorites_for_ai(session)
        if not favorites_info:
            raise ApiError("no_favorites", "즐겨찾기에 코디를 먼저 넣어 주세요.")

    # ③ 날씨 ④ AI ⑤ 검사 (검사는 ai.recommend 안에서 합니다)
    weather = daily_weather(session, body.day, body.region)
    request_text = (body.request or "").strip() or None
    try:
        answer = ai.recommend(closet, weather, tag.name, request=request_text,
                              persona=body.persona, favorites=favorites_info)
    except ExternalError:
        raise ApiError("recommend_failed", "추천을 받지 못했어요.", 502)

    outfits = answer["outfits"]
    favorites = favorite_ids(session)
    for item in outfits:
        item["favorite_id"] = favorites.get(outfit_key(item["outfit"]))
    return ok({"insufficient": None, "weather": weather, "outfits": outfits,
               "fewer_than_three": len(outfits) < 3, "shopping": answer["shopping"]})
