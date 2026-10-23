"""옷장 (API-SPEC §4)."""

import json
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from .. import outfits, photos
from ..db import get_session
from ..external import imaging
from ..models import CATEGORIES, Clothing, ClothingKeyword, Keyword
from ..responses import ApiError, ok
from .keywords import keyword_data

router = APIRouter(prefix="/api/clothes")

OPTIONAL_KINDS = ("material", "season", "pattern")
KIND_NAMES = {"category": "구분", "color": "색", "type": "종류"}


class FitIn(BaseModel):
    """피팅값 (DATA-MODEL §3, P-33). 위치는 틀 상자 크기에 대한 비율, 기울기는 도. 범위 밖이면 입력 오류입니다."""
    model_config = ConfigDict(extra="forbid")

    x: float = Field(0, ge=-0.2, le=0.2)
    y: float = Field(0, ge=-0.2, le=0.2)
    sx: float = Field(1, ge=0.8, le=1.2)
    sy: float = Field(1, ge=0.8, le=1.2)
    rotate: float = Field(0, ge=-10, le=10)
    px: float = Field(0, ge=-0.5, le=0.5)
    py: float = Field(0, ge=-0.5, le=0.5)
    ps: float = Field(1, ge=0.5, le=2.0)


class ClothingIn(BaseModel):
    upload_id: str
    category: Literal["top", "bottom", "shoes", "outer", "dress"] | None = None
    keyword_ids: list[int] = []
    # 등록 창에서 모습을 조절했을 때만 보냅니다. 없으면 종류 단어로 틀을 고르고 피팅값은 기본값입니다. (P-33)
    outfit_template: str | None = None
    fit: FitIn | None = None
    # 무늬 표현과 벡터 색상 수 (P-39). 'solid'(대표 색상만)이면 무늬 파일을 쓰지 않습니다.
    pattern_mode: Literal["auto", "detail", "stripes", "solid"] | None = None
    pattern_colors: int | None = Field(None, ge=3, le=10)


class FitSaveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outfit_template: str
    fit: FitIn | None = None


class OptionalKeywordsIn(BaseModel):
    # 선택 키워드만 받습니다. 색 같은 다른 칸을 끼워 넣으면 입력 오류입니다. (TEST-PLAN T-76)
    model_config = ConfigDict(extra="forbid")

    material: list[int]
    season: list[int]
    pattern: list[int]


def clothing_summary(clothing: Clothing) -> dict:
    """옷 한 벌 정보 (API-SPEC §2.4)"""
    return {
        "id": clothing.id,
        "category": clothing.category,
        "image_url": photos.url_for(clothing.image_path),
        "is_deleted": clothing.is_deleted,
        # 마네킹에 입힐 캐릭터 의상 (D-016)
        "outfit_template": clothing.outfit_template,
        "main_color": clothing.main_color,
        "pattern_url": photos.url_for(clothing.pattern_path) if clothing.pattern_path else None,
        "fit": json.loads(clothing.fit) if clothing.fit else None,
    }


def _keywords_of(session: Session, clothing_id: int) -> list[Keyword]:
    return session.exec(
        select(Keyword)
        .join(ClothingKeyword, ClothingKeyword.keyword_id == Keyword.id)
        .where(ClothingKeyword.clothing_id == clothing_id)
        .order_by(Keyword.sort_order, Keyword.id)
    ).all()


def clothing_detail(session: Session, clothing: Clothing) -> dict:
    grouped = {kind: [] for kind in ("color", "type", *OPTIONAL_KINDS)}
    for keyword in _keywords_of(session, clothing.id):
        grouped[keyword.kind].append(keyword_data(keyword))
    return {
        **clothing_summary(clothing),
        "photo_url": photos.url_for(clothing.photo_path),
        "keywords": grouped,
        "pattern_mode": clothing.pattern_mode,
        "pattern_colors": clothing.pattern_colors,
    }


def _load_keywords(session: Session, ids: list[int]) -> list[Keyword]:
    unique = set(ids)
    keywords = session.exec(select(Keyword).where(Keyword.id.in_(unique))).all() if unique else []
    if len(keywords) != len(unique):
        raise ApiError("unknown_keyword", "목록에 없는 키워드가 있어요.")
    return keywords


def _get_clothing(session: Session, clothing_id: int) -> Clothing:
    clothing = session.get(Clothing, clothing_id)
    if clothing is None or clothing.is_deleted:
        raise ApiError("clothing_not_found", "그 옷을 찾지 못했어요.", 404)
    return clothing


# 메뉴 "옷장": 지운 옷을 뺀 옷 목록을 구분별로 모음
@router.get("")
def list_clothes(session: Session = Depends(get_session)):
    clothes = session.exec(
        select(Clothing).where(Clothing.is_deleted == False).order_by(Clothing.id)  # noqa: E712
    ).all()
    grouped = {category: [] for category in CATEGORIES}
    for clothing in clothes:
        grouped[clothing.category].append(clothing_summary(clothing))
    return ok(grouped)


@router.get("/{clothing_id}")
def read_clothing(clothing_id: int, session: Session = Depends(get_session)):
    return ok(clothing_detail(session, _get_clothing(session, clothing_id)))


# 등록하기
@router.post("")
def register_clothing(body: ClothingIn, session: Session = Depends(get_session)):
    keywords = _load_keywords(session, body.keyword_ids)
    kinds = {k.kind for k in keywords}
    missing = [name for kind, name in KIND_NAMES.items()
               if (body.category is None if kind == "category" else kind not in kinds)]
    if missing:
        # 예: "색이 선택되지 않았어요.", "색, 종류가 선택되지 않았어요." (SCREEN-SPEC §2.6)
        particle = "가" if missing[-1] == "종류" else "이"
        raise ApiError("missing_required", f"{', '.join(missing)}{particle} 선택되지 않았어요.")
    if any(k.kind == "type" and k.category != body.category for k in keywords):
        raise ApiError("type_category_mismatch", "고른 구분에 맞지 않는 종류가 있어요.")

    if body.outfit_template is not None and not outfits.belongs(body.outfit_template, body.category):
        raise ApiError("wrong_template", "고른 구분에 맞지 않는 모양이에요.")

    files = photos.temp_files(body.upload_id)
    if not {"original", "image"} <= set(files):
        raise ApiError("upload_missing", "올린 사진이 없어졌어요. 사진을 다시 올려 주세요.")

    # 대표 색상만 쓰면 남아 있는 임시 무늬 파일은 버립니다. (P-39)
    if body.pattern_mode == "solid" and "pattern" in files:
        files.pop("pattern").unlink(missing_ok=True)

    type_names = [k.name for k in keywords if k.kind == "type"]
    clothing = Clothing(category=body.category, photo_path=files["original"].name,
                        image_path=files["image"].name,
                        outfit_template=body.outfit_template or outfits.pick_template(body.category, type_names),
                        fit=_fit_text(body.fit),
                        main_color=imaging.main_color(files["image"]),
                        pattern_path=files["pattern"].name if "pattern" in files else None,
                        pattern_mode=body.pattern_mode, pattern_colors=body.pattern_colors)
    session.add(clothing)
    session.flush()
    for keyword in keywords:
        session.add(ClothingKeyword(clothing_id=clothing.id, keyword_id=keyword.id))
    # 임시 파일을 정식으로 옮긴 뒤에 저장을 마칩니다.
    moved = []
    try:
        for path in files.values():
            target = photos.PHOTO_DIR / path.name
            path.replace(target)
            moved.append((target, path))
        session.commit()
    except Exception:
        session.rollback()
        for target, original in moved:
            target.replace(original)
        raise
    session.refresh(clothing)
    return ok(clothing_summary(clothing))


def _fit_text(fit: FitIn | None) -> str | None:
    """기본값과 같으면 저장하지 않습니다."""
    if fit is None or fit == FitIn():
        return None
    return json.dumps(fit.model_dump())


# 마네킹 모습 조절하고 저장 (옷 상세, P-33)
@router.put("/{clothing_id}/fit")
def save_fit(clothing_id: int, body: FitSaveIn, session: Session = Depends(get_session)):
    clothing = session.get(Clothing, clothing_id)
    if clothing is None:
        raise ApiError("clothing_not_found", "그 옷을 찾지 못했어요.", 404)
    if clothing.is_deleted:
        raise ApiError("already_deleted", "이미 지운 옷이에요.")
    if not outfits.belongs(body.outfit_template, clothing.category):
        raise ApiError("wrong_template", "이 옷의 구분에 맞지 않는 모양이에요.")
    clothing.outfit_template = body.outfit_template
    clothing.fit = _fit_text(body.fit)
    session.add(clothing)
    session.commit()
    session.refresh(clothing)
    return ok(clothing_summary(clothing))


class PatternSaveIn(BaseModel):
    """옷 상세의 무늬 바꾸기 (P-39). 대표 색상만('solid')이면 svg는 보내지 않습니다."""
    model_config = ConfigDict(extra="forbid")

    svg: str | None = Field(None, max_length=imaging.MAX_PATTERN_BYTES)
    pattern_mode: Literal["auto", "detail", "stripes", "solid"]
    pattern_colors: int = Field(ge=3, le=10)


# 무늬 바꾸고 저장 (옷 상세, P-39, D-020 제안): 화면이 만든 무늬 그림을 새 파일로 저장하고 이전 무늬 파일은 지웁니다.
# 같은 이름으로 덮으면 브라우저가 이전 무늬를 다시 쓰므로 늘 새 이름을 씁니다.
@router.put("/{clothing_id}/pattern")
def save_pattern(clothing_id: int, body: PatternSaveIn, session: Session = Depends(get_session)):
    clothing = session.get(Clothing, clothing_id)
    if clothing is None:
        raise ApiError("clothing_not_found", "그 옷을 찾지 못했어요.", 404)
    if clothing.is_deleted:
        raise ApiError("already_deleted", "이미 지운 옷이에요.")
    solid = body.pattern_mode == "solid"
    if not solid and (body.svg is None or not imaging.valid_pattern(body.svg)):
        raise ApiError("bad_pattern", "무늬가 너무 복잡해서 저장하지 못했어요. 색 수를 줄이거나 다른 무늬 표현을 골라 주세요.")

    old = clothing.pattern_path
    new_path = None
    if not solid:
        photos.ensure_dirs()
        new_path = photos.PHOTO_DIR / f"{photos.new_upload_id()}-pattern.svg"
        new_path.write_text(body.svg, encoding="utf-8")
    clothing.pattern_path = new_path.name if new_path else None
    clothing.pattern_mode = body.pattern_mode
    clothing.pattern_colors = body.pattern_colors
    session.add(clothing)
    try:
        session.commit()
    except Exception:
        session.rollback()
        if new_path:
            new_path.unlink(missing_ok=True)
        raise
    # 저장을 마친 뒤에 이전 무늬 파일을 지웁니다. 지우지 못해도 옷 정보는 이미 새 무늬를 가리킵니다.
    if old:
        (photos.PHOTO_DIR / old).unlink(missing_ok=True)
    session.refresh(clothing)
    return ok({**clothing_summary(clothing), "pattern_mode": clothing.pattern_mode,
               "pattern_colors": clothing.pattern_colors})


# 선택 키워드 고치고 저장
@router.patch("/{clothing_id}/keywords")
def save_optional_keywords(clothing_id: int, body: OptionalKeywordsIn,
                           session: Session = Depends(get_session)):
    clothing = session.get(Clothing, clothing_id)
    if clothing is None:
        raise ApiError("clothing_not_found", "그 옷을 찾지 못했어요.", 404)
    if clothing.is_deleted:
        raise ApiError("already_deleted", "이미 지운 옷이에요.")

    wanted = {kind: getattr(body, kind) for kind in OPTIONAL_KINDS}
    keywords = _load_keywords(session, [i for ids in wanted.values() for i in ids])
    by_id = {k.id: k for k in keywords}
    for kind, ids in wanted.items():
        if any(by_id[i].kind != kind for i in ids):
            raise ApiError("wrong_keyword_kind", "선택 키워드만 고칠 수 있어요.")

    for keyword in _keywords_of(session, clothing.id):
        if keyword.kind in OPTIONAL_KINDS:
            link = session.get(ClothingKeyword, (clothing.id, keyword.id))
            session.delete(link)
    session.flush()
    for keyword in keywords:
        session.add(ClothingKeyword(clothing_id=clothing.id, keyword_id=keyword.id))
    session.commit()
    return ok(clothing_detail(session, clothing)["keywords"])


# 옷 지우기: 지운 옷 표시만 붙입니다. 사진, 2D 이미지, 키워드는 그대로 둡니다.
@router.delete("/{clothing_id}")
def delete_clothing(clothing_id: int, session: Session = Depends(get_session)):
    clothing = session.get(Clothing, clothing_id)
    if clothing is None:
        raise ApiError("clothing_not_found", "그 옷을 찾지 못했어요.", 404)
    if clothing.is_deleted:
        raise ApiError("already_deleted", "이미 지운 옷이에요.")
    clothing.is_deleted = True
    session.add(clothing)
    session.commit()
    return ok(None)
