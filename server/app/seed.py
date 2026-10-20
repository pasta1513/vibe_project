"""앱 기본 단어 목록 (DATA-MODEL §9). DB 파일을 새로 만들 때 한 번만 넣습니다."""

from sqlmodel import Session

from .models import Keyword, StyleTag

# §9.1
COLORS = ["검정", "흰색", "회색", "네이비", "파랑", "하늘색", "빨강", "분홍", "주황", "노랑",
          "초록", "카키", "베이지", "갈색", "보라", "아이보리"]
MATERIALS = ["면", "린넨", "울", "캐시미어", "데님", "가죽", "폴리에스터", "실크", "플리스"]
SEASONS = ["봄·가을용", "여름용", "겨울용", "사계절용", "얇음", "보통", "두꺼움"]
PATTERNS = ["무지", "스트라이프", "체크", "도트", "꽃무늬", "그래픽·로고", "패턴 기타"]

# §9.2 (속한 구분, 단어, 맞는 성별). 목록 순서는 PRD 부록 순서.
TYPES = [
    ("top", "티셔츠", "both"), ("top", "셔츠", "both"), ("top", "블라우스", "female"),
    ("top", "니트", "both"), ("top", "맨투맨", "both"), ("top", "후드티", "both"),
    ("top", "조끼", "both"),
    ("bottom", "청바지", "both"), ("bottom", "슬랙스", "both"), ("bottom", "면바지", "both"),
    ("bottom", "반바지", "both"), ("bottom", "치마", "female"), ("bottom", "트레이닝 바지", "both"),
    ("outer", "코트", "both"), ("outer", "패딩", "both"), ("outer", "재킷", "both"),
    ("outer", "가디건", "both"), ("outer", "점퍼", "both"), ("outer", "트렌치코트", "both"),
    ("shoes", "운동화", "both"), ("shoes", "구두", "both"), ("shoes", "로퍼", "both"),
    ("shoes", "부츠", "both"), ("shoes", "샌들", "both"), ("shoes", "슬리퍼", "both"),
    ("dress", "원피스", "female"), ("dress", "점프수트", "both"),
]

# §9.3
STYLE_TAGS = ["캐주얼", "포멀", "비즈니스 캐주얼", "미니멀", "스트릿", "스포티", "빈티지", "러블리",
              "댄디", "아웃도어", "꾸안꾸(꾸민 듯 안 꾸민 듯)", "데이트", "하객룩"]


def seed_defaults(session: Session):
    for kind, names in (("color", COLORS), ("material", MATERIALS),
                        ("season", SEASONS), ("pattern", PATTERNS)):
        for order, name in enumerate(names):
            session.add(Keyword(kind=kind, name=name, sort_order=order))
    for order, (category, name, gender) in enumerate(TYPES):
        session.add(Keyword(kind="type", name=name, category=category, gender=gender,
                            sort_order=order))
    for order, name in enumerate(STYLE_TAGS):
        session.add(StyleTag(name=name, sort_order=order))
