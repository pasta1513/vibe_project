"""옷 키워드 단어 (API-SPEC §4, §8). 더하기, 고치기, 지우기는 P-16에서 만듭니다."""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import KEYWORD_KINDS, Keyword
from ..responses import ok

router = APIRouter(prefix="/api/keywords")


def keyword_data(keyword: Keyword) -> dict:
    data = {"id": keyword.id, "name": keyword.name}
    if keyword.kind == "type":
        data["category"] = keyword.category
        data["gender"] = keyword.gender
    return data


# 키워드 다섯 종류의 단어 목록. 구분은 고정값이라 목록에 없습니다. (DATA-MODEL §12.1)
@router.get("")
def list_keywords(session: Session = Depends(get_session)):
    keywords = session.exec(select(Keyword).order_by(Keyword.sort_order, Keyword.id)).all()
    grouped = {kind: [] for kind in KEYWORD_KINDS}
    for keyword in keywords:
        grouped[keyword.kind].append(keyword_data(keyword))
    return ok(grouped)
