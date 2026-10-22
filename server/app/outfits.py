"""캐릭터 의상 틀 (D-016, DESIGN §5.5).

마네킹에 입힐 때 쓰는 틀 9개와, 구분과 종류 단어로 틀을 고르는 규칙입니다.
틀 그림은 화면(Mannequin.jsx)이 그리고, 서버는 어떤 틀인지만 정해 옷과 함께 저장합니다.
화면도 등록 창 미리보기에서 같은 표를 씁니다 (설정 응답의 outfit_templates).
"""

# 표의 순서가 고르는 순서입니다. 종류 단어를 여러 개 골랐으면 위에 있는 틀을 씁니다.
# 종류 단어는 이름으로 맞춥니다. 이름을 바꾼 단어나 사용자가 더한 단어는 그 구분의 기본 틀을 씁니다. (사람이 정함, 2026-10-22)
TEMPLATES = [
    {"code": "top_short", "name": "반팔 상의", "category": "top", "types": ["티셔츠", "조끼"]},
    {"code": "top_long", "name": "긴팔 상의", "category": "top",
     "types": ["셔츠", "니트", "맨투맨", "후드티", "블라우스"]},
    {"code": "bottom_pants", "name": "긴바지", "category": "bottom",
     "types": ["청바지", "슬랙스", "면바지", "트레이닝 바지"]},
    {"code": "bottom_shorts", "name": "반바지", "category": "bottom", "types": ["반바지"]},
    {"code": "bottom_skirt", "name": "치마", "category": "bottom", "types": ["치마"]},
    {"code": "dress", "name": "원피스", "category": "dress", "types": ["원피스", "점프수트"]},
    {"code": "outer_short", "name": "짧은 아우터", "category": "outer",
     "types": ["재킷", "가디건", "점퍼", "패딩"]},
    {"code": "outer_long", "name": "긴 아우터", "category": "outer", "types": ["코트", "트렌치코트"]},
    {"code": "shoes", "name": "신발", "category": "shoes",
     "types": ["운동화", "구두", "로퍼", "부츠", "샌들", "슬리퍼"]},
]

# 구분마다 기본 틀
DEFAULTS = {"top": "top_long", "bottom": "bottom_pants", "dress": "dress",
            "outer": "outer_short", "shoes": "shoes"}


def belongs(code: str, category: str) -> bool:
    """그 구분의 틀인지. 피팅에서 틀은 같은 구분 안에서만 바꿀 수 있습니다. (P-33)"""
    return any(t["code"] == code and t["category"] == category for t in TEMPLATES)


def pick_template(category: str, type_names: list[str]) -> str:
    """구분과 고른 종류 단어 이름들로 틀 코드를 고릅니다."""
    names = set(type_names)
    for template in TEMPLATES:
        if template["category"] == category and names & set(template["types"]):
            return template["code"]
    return DEFAULTS[category]
