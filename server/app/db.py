import os
from pathlib import Path

from sqlalchemy import event
from sqlmodel import Session, create_engine

PROJECT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = PROJECT_DIR / "server"

# 저장 폴더: 저장 파일과 사진 폴더가 들어 있습니다. 기본은 프로젝트 맨 위의 data/ (ARCHITECTURE §2.3)
# `server/.env`의 DATA_DIR로 바꿀 수 있습니다. 확인 작업은 다른 폴더를 써서 진짜 데이터를 건드리지 않습니다. (D-017)
# 상대 경로는 프로젝트 맨 위를 기준으로 봅니다.
DATA_DIR = PROJECT_DIR / os.environ.get("DATA_DIR", "data")
DB_PATH = DATA_DIR / "app.db"

engine = create_engine(f"sqlite:///{DB_PATH}")


# SQLite는 연결마다 외래 키 검사를 켜 줘야 합니다.
@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def upgrade_schema():
    """DB 구조를 최신으로 바꿉니다 (Alembic upgrade head, D-017). 구조가 이미 최신이면 아무것도 하지 않습니다."""
    from alembic import command
    from alembic.config import Config

    config = Config(str(SERVER_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    # 서버 안에서 부를 때는 uvicorn의 기록 설정을 Alembic이 바꾸지 않게 합니다 (migrations/env.py).
    config.attributes["from_app"] = True
    command.upgrade(config, "head")


def init_db():
    """구조를 최신으로 바꾸고, 저장 파일을 새로 만들 때만 앱 기본 단어를 넣습니다."""
    from .seed import seed_defaults

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    is_new = not DB_PATH.exists()
    upgrade_schema()
    if is_new:
        with Session(engine) as session:
            seed_defaults(session)
            session.commit()


def get_session():
    with Session(engine) as session:
        yield session
