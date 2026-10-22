from pathlib import Path

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

# 저장소 폴더: 프로젝트 맨 위의 data/ (ARCHITECTURE §2.5)
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
# 시험용 저장 파일. 진짜 AI를 연결하기 전에 승인을 받고 지웁니다. (D-007)
DB_PATH = DATA_DIR / "dev.db"

engine = create_engine(f"sqlite:///{DB_PATH}")


# SQLite는 연결마다 외래 키 검사를 켜 줘야 합니다.
@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def init_db():
    """표를 만들고, DB 파일을 새로 만들 때만 앱 기본 단어를 넣습니다."""
    from . import models  # noqa: F401  표 정의를 불러와야 create_all이 표를 압니다.
    from .seed import seed_defaults

    DATA_DIR.mkdir(exist_ok=True)
    is_new = not DB_PATH.exists()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    if is_new:
        with Session(engine) as session:
            seed_defaults(session)
            session.commit()
    _fill_outfits()


# 이미 있는 DB에 나중에 생긴 칸을 빈 값으로 더합니다. create_all은 있는 표에 칸을 더하지 않습니다.
# DB 구조를 바꾸는 도구(Alembic)는 매일 쓰기 시작할 때 정합니다. (D-009, 사람이 정함 2026-10-22 P-31)
_LATER_COLUMNS = {"clothing": {"outfit_template": "VARCHAR", "main_color": "VARCHAR",
                               "pattern_path": "VARCHAR"}}


def _add_missing_columns():
    with engine.begin() as conn:
        for table, columns in _LATER_COLUMNS.items():
            have = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, sql_type in columns.items():
                if name not in have:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")


def _fill_outfits():
    """의상 틀, 대표 색, 무늬 그림이 빈 옷(P-31, P-32 전에 등록한 옷)을 채웁니다. (D-016, TEST-PLAN T-96)

    무늬 그림을 만들지 못한 옷은 비워 두고, 서버를 켤 때마다 다시 해 봅니다.
    """
    from sqlmodel import select

    from . import outfits, photos
    from .external import imaging
    from .models import Clothing, ClothingKeyword, Keyword

    with Session(engine) as session:
        empty = session.exec(select(Clothing).where(
            (Clothing.outfit_template == None) | (Clothing.main_color == None)  # noqa: E711
            | (Clothing.pattern_path == None))).all()  # noqa: E711
        for clothing in empty:
            if clothing.outfit_template is None:
                names = session.exec(
                    select(Keyword.name)
                    .join(ClothingKeyword, ClothingKeyword.keyword_id == Keyword.id)
                    .where(ClothingKeyword.clothing_id == clothing.id, Keyword.kind == "type")
                ).all()
                clothing.outfit_template = outfits.pick_template(clothing.category, list(names))
            if clothing.main_color is None:
                clothing.main_color = imaging.main_color(photos.find_file(clothing.image_path))
            if clothing.pattern_path is None:
                name = clothing.image_path.split("-")[0] + "-pattern.svg"
                if imaging.make_pattern(photos.find_file(clothing.image_path), photos.PHOTO_DIR / name):
                    clothing.pattern_path = name
            session.add(clothing)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
