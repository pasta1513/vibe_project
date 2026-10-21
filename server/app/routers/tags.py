"""스타일 태그 (API-SPEC §5.1, §8). 규칙은 옷 키워드와 같습니다. 종류와 구분은 없습니다."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..external import ai
from ..models import StyleTag
from ..responses import ApiError, confirm, ok
from ..rules import particle
from .keywords import clean_name, in_use_error, records_using

router = APIRouter(prefix="/api/tags")


class TagIn(BaseModel):
    name: str
    # 비슷한 단어 질문에서 [더하기]를 눌렀을 때 true로 다시 보냅니다.
    confirmed: bool = False


class TagPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str


def tag_data(tag: StyleTag) -> dict:
    return {"id": tag.id, "name": tag.name}


def _same_name_message(name: str) -> str:
    return f"'{name}'{particle(name, '은', '는')} 이미 있어요."


def _get_tag(session: Session, tag_id: int) -> StyleTag:
    tag = session.get(StyleTag, tag_id)
    if tag is None:
        raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)
    return tag


@router.get("")
def list_tags(session: Session = Depends(get_session)):
    tags = session.exec(select(StyleTag).order_by(StyleTag.sort_order, StyleTag.id)).all()
    return ok([tag_data(t) for t in tags])


# 태그 더하기. 키워드 더하기와 같은 순서이고, 성별 정하기는 없습니다.
@router.post("")
def add_tag(body: TagIn, session: Session = Depends(get_session)):
    name = clean_name(body.name)
    tags = session.exec(select(StyleTag)).all()
    if any(t.name == name for t in tags):
        raise ApiError("same_name", _same_name_message(name))
    if not body.confirmed:
        similar = ai.find_similar(name, [t.name for t in tags])
        if similar:
            return confirm("similar_name", existing=similar, name=name)

    last = session.exec(select(func.max(StyleTag.sort_order))).one()
    tag = StyleTag(name=name, sort_order=(last if last is not None else -1) + 1)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return ok(tag_data(tag))


@router.patch("/{tag_id}")
def rename_tag(tag_id: int, body: TagPatch, session: Session = Depends(get_session)):
    tag = _get_tag(session, tag_id)
    name = clean_name(body.name)
    others = session.exec(select(StyleTag).where(StyleTag.id != tag.id)).all()
    if any(t.name == name for t in others):
        raise ApiError("same_name", _same_name_message(name))
    tag.name = name
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return ok(tag_data(tag))


# 태그 지우기. "쓰이고 있다"는 코디 일기나 즐겨찾기가 쓰고 있다는 뜻입니다.
@router.delete("/{tag_id}")
def delete_tag(tag_id: int, session: Session = Depends(get_session)):
    tag = _get_tag(session, tag_id)
    records = records_using(session, tag_id=tag.id)
    if records["diary"] or records["favorites"]:
        return in_use_error(tag.name, {"clothes": [], **records})
    session.delete(tag)
    session.commit()
    return ok(None)
