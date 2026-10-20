"""저장할 정보 (DATA-MODEL §2~7). 칸 이름은 DATA-MODEL §12를 따릅니다."""

from datetime import date as Date, datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

# 정해진 값 (DATA-MODEL §12)
CATEGORIES = ("top", "bottom", "shoes", "outer", "dress")
KEYWORD_KINDS = ("color", "type", "material", "season", "pattern")
MANNEQUIN_GENDERS = ("female", "male")
TYPE_GENDERS = ("female", "male", "both")
HEIGHTS = ("short", "medium", "tall")
BODIES = ("slim", "medium", "chubby")
WEATHER_CONDITIONS = ("clear", "cloudy", "rain", "snow")
NOTE_TYPES = ("reason", "comment")


# §2 설정. 사용자가 한 명이라 한 줄뿐입니다. 첫 실행 전에는 줄이 없습니다.
class Settings(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    mannequin_gender: str
    mannequin_height: str
    mannequin_body: str
    home_region: Optional[str] = None


# §4 옷 키워드 단어. 구분은 고정값이라 이 표에 넣지 않고 옷의 category에 둡니다.
class Keyword(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = Field(index=True)
    name: str
    category: Optional[str] = None  # 종류 단어만
    gender: Optional[str] = None  # 종류 단어만
    sort_order: int


# §3 옷
class Clothing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category: str = Field(index=True)
    photo_path: str
    image_path: str
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.now)


# 옷과 키워드 단어 잇기
class ClothingKeyword(SQLModel, table=True):
    __tablename__ = "clothing_keyword"

    clothing_id: int = Field(foreign_key="clothing.id", primary_key=True)
    keyword_id: int = Field(foreign_key="keyword.id", primary_key=True)


# §5 스타일 태그
class StyleTag(SQLModel, table=True):
    __tablename__ = "style_tag"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    sort_order: int


# §1.3 코디 구성. outer_id가 비어 있으면 "입지 않음"입니다.
class OutfitSlots(SQLModel):
    top_id: Optional[int] = Field(default=None, foreign_key="clothing.id")
    bottom_id: Optional[int] = Field(default=None, foreign_key="clothing.id")
    dress_id: Optional[int] = Field(default=None, foreign_key="clothing.id")
    shoes_id: int = Field(foreign_key="clothing.id")
    outer_id: Optional[int] = Field(default=None, foreign_key="clothing.id")


class MannequinShape(SQLModel):
    mannequin_gender: str
    mannequin_height: str
    mannequin_body: str


# §6 코디 일기 기록. 날짜 하나에 기록 하나.
class DiaryEntry(OutfitSlots, MannequinShape, table=True):
    __tablename__ = "diary_entry"

    id: Optional[int] = Field(default=None, primary_key=True)
    date: Date = Field(unique=True)
    weather_region: str
    weather_min_temp: float
    weather_max_temp: float
    weather_condition: str
    style_tag_id: Optional[int] = Field(default=None, foreign_key="style_tag.id")
    score: float
    note_type: str
    note_summary: str
    note_details: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=datetime.now)


# §7 즐겨찾기. 같은 코디 구성은 서버 코드에서 막습니다. (SQLite는 빈 칸끼리 같다고 보지 않음)
class Favorite(OutfitSlots, MannequinShape, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    style_tag_id: Optional[int] = Field(default=None, foreign_key="style_tag.id")
    position: int
