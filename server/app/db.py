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
    if is_new:
        with Session(engine) as session:
            seed_defaults(session)
            session.commit()


def get_session():
    with Session(engine) as session:
        yield session
