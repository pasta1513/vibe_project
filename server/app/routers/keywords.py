"""옷 키워드 단어 (API-SPEC §4, §8). 더하기, 이름 고치기, 성별 바꾸기, 지우기."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_
from sqlmodel import Session, select

from .. import photos
from ..db import get_session
from ..external import ai
from ..models import KEYWORD_KINDS, Clothing, ClothingKeyword, DiaryEntry, Favorite, Keyword
from ..responses import ApiError, confirm, ok
from ..rules import normalize_name, particle

router = APIRouter(prefix="/api/keywords")

CATEGORY_NAMES = {"top": "상의", "bottom": "하의", "shoes": "신발", "outer": "아우터",
                  "dress": "원피스"}


class KeywordIn(BaseModel):
    kind: str
    name: str
    category: Optional[Literal["top", "bottom", "shoes", "outer", "dress"]] = None
    # 비슷한 단어 질문에서 [더하기]를 눌렀을 때 true로 다시 보냅니다.
    confirmed: bool = False


class KeywordPatch(BaseModel):
    # 이름 고치기와 성별 바꾸기 중 하나만 보냅니다.
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    gender: Optional[Literal["female", "male", "both"]] = None


def keyword_data(keyword: Keyword) -> dict:
    data = {"id": keyword.id, "name": keyword.name}
    if keyword.kind == "type":
        data["category"] = keyword.category
        data["gender"] = keyword.gender
    return data


def clean_name(name: str) -> str:
    """띄어쓰기를 정리하고, 비었으면 막습니다. (API-SPEC §8 ⓪)"""
    cleaned = normalize_name(name)
    if not cleaned:
        raise ApiError("empty_name", "이름을 입력해 주세요.")
    return cleaned


def records_using(session: Session, clothing_ids: list[int] = (),
                  tag_id: Optional[int] = None) -> dict:
    """옷이나 태그를 쓰는 코디 일기 기록과 즐겨찾기를 모읍니다.

    지운 옷이라도 기록에 남아 있으면 쓰이는 것으로 봅니다. (PRD §4)
    """
    def condition(model):
        parts = []
        if clothing_ids:
            parts += [getattr(model, f"{slot}_id").in_(clothing_ids)
                      for slot in ("top", "bottom", "dress", "shoes", "outer")]
        if tag_id is not None:
            parts.append(model.style_tag_id == tag_id)
        return or_(*parts)

    if not clothing_ids and tag_id is None:
        return {"diary": [], "favorites": []}
    diary = session.exec(select(DiaryEntry).where(condition(DiaryEntry))
                         .order_by(DiaryEntry.date)).all()
    # 즐겨찾기는 목록에서 몇 번째인지로 알려 줍니다.
    favorites = session.exec(select(Favorite).order_by(Favorite.position, Favorite.id)).all()
    used = {f.id for f in session.exec(select(Favorite).where(condition(Favorite))).all()}
    return {
        "diary": [{"id": d.id, "date": d.date.isoformat()} for d in diary],
        "favorites": [{"id": f.id, "number": n} for n, f in enumerate(favorites, 1)
                      if f.id in used],
    }


def in_use_error(name: str, used_by: dict) -> JSONResponse:
    """지울 수 없음 안내. 어떤 옷이나 기록이 쓰는지 함께 보냅니다. (API-SPEC §8)"""
    message = f"'{name}'{particle(name, '은', '는')} 쓰이고 있어서 지울 수 없어요."
    return JSONResponse(status_code=400, content={
        "result": "error",
        "error": {"kind": "in_use", "message": message, "used_by": used_by},
    })


def _same_scope(kind: str, category: Optional[str]):
    """같은 이름을 막는 범위: 같은 키워드 종류 안. 종류 단어는 같은 구분 안. (DATA-MODEL §4)"""
    query = select(Keyword).where(Keyword.kind == kind)
    if kind == "type":
        query = query.where(Keyword.category == category)
    return query


def _same_name_message(name: str, kind: str, category: Optional[str]) -> str:
    if kind == "type":
        return f"{CATEGORY_NAMES[category]}에 '{name}'{particle(name, '이', '가')} 이미 있어요."
    return f"'{name}'{particle(name, '은', '는')} 이미 있어요."


def _get_keyword(session: Session, keyword_id: int) -> Keyword:
    keyword = session.get(Keyword, keyword_id)
    if keyword is None:
        raise ApiError("keyword_not_found", "그 키워드를 찾지 못했어요.", 404)
    return keyword


# 키워드 다섯 종류의 단어 목록. 구분은 고정값이라 목록에 없습니다. (DATA-MODEL §12.1)
@router.get("")
def list_keywords(session: Session = Depends(get_session)):
    keywords = session.exec(select(Keyword).order_by(Keyword.sort_order, Keyword.id)).all()
    grouped = {kind: [] for kind in KEYWORD_KINDS}
    for keyword in keywords:
        grouped[keyword.kind].append(keyword_data(keyword))
    return ok(grouped)


# 키워드 더하기 (설정, 등록 창 모두). 순서는 API-SPEC §8의 ⓪~⑤
@router.post("")
def add_keyword(body: KeywordIn, session: Session = Depends(get_session)):
    name = clean_name(body.name)
    if body.kind == "category":
        raise ApiError("category_fixed", "구분에는 단어를 더할 수 없어요.")
    if body.kind not in KEYWORD_KINDS:
        raise ApiError("invalid_input", "보낸 값이 올바르지 않아요.")
    category = body.category if body.kind == "type" else None
    if body.kind == "type" and category is None:
        raise ApiError("missing_category", "종류 단어는 속할 구분을 골라 주세요.")

    scope = session.exec(_same_scope(body.kind, category)).all()
    if any(k.name == name for k in scope):
        raise ApiError("same_name", _same_name_message(name, body.kind, category))
    if not body.confirmed:
        similar = ai.find_similar(name, [k.name for k in scope])
        if similar:
            return confirm("similar_name", existing=similar, name=name)

    gender, gender_failed = None, False
    if body.kind == "type":
        gender, decided = ai.decide_gender(name, category)
        gender_failed = not decided

    last = session.exec(select(func.max(Keyword.sort_order))
                        .where(Keyword.kind == body.kind)).one()
    keyword = Keyword(kind=body.kind, name=name, category=category, gender=gender,
                      sort_order=(last if last is not None else -1) + 1)
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return ok({"kind": keyword.kind, "keyword": keyword_data(keyword),
               "gender_failed": gender_failed})


# 키워드 이름 고치기, 종류 단어의 성별 바꾸기
@router.patch("/{keyword_id}")
def update_keyword(keyword_id: int, body: KeywordPatch, session: Session = Depends(get_session)):
    if (body.name is None) == (body.gender is None):
        raise ApiError("invalid_input", "보낸 값이 올바르지 않아요.")
    keyword = _get_keyword(session, keyword_id)

    if body.name is not None:
        name = clean_name(body.name)
        scope = session.exec(_same_scope(keyword.kind, keyword.category)
                             .where(Keyword.id != keyword.id)).all()
        if any(k.name == name for k in scope):
            raise ApiError("same_name", _same_name_message(name, keyword.kind, keyword.category))
        keyword.name = name
    else:
        if keyword.kind != "type":
            raise ApiError("not_type_word", "성별은 종류 단어에만 있어요.")
        keyword.gender = body.gender

    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return ok(keyword_data(keyword))


# 키워드 지우기. 쓰이고 있으면 막고, 어떤 옷이나 기록이 쓰는지 알려 줍니다.
@router.delete("/{keyword_id}")
def delete_keyword(keyword_id: int, session: Session = Depends(get_session)):
    keyword = _get_keyword(session, keyword_id)
    clothes = session.exec(
        select(Clothing)
        .join(ClothingKeyword, ClothingKeyword.clothing_id == Clothing.id)
        .where(ClothingKeyword.keyword_id == keyword.id)
        .order_by(Clothing.id)
    ).all()
    records = records_using(session, clothing_ids=[c.id for c in clothes])
    active = [c for c in clothes if not c.is_deleted]
    if active or records["diary"] or records["favorites"]:
        used_by = {
            "clothes": [{"id": c.id, "category": c.category,
                         "image_url": photos.url_for(c.image_path)} for c in active],
            **records,
        }
        return in_use_error(keyword.name, used_by)

    # 지운 옷에만 붙어 있던 잇기는 함께 지웁니다.
    for link in session.exec(select(ClothingKeyword)
                             .where(ClothingKeyword.keyword_id == keyword.id)).all():
        session.delete(link)
    session.delete(keyword)
    session.commit()
    return ok(None)
