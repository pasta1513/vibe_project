"""Alembic 실행 설정 (D-017, P-35).

표 정의는 app/models.py(SQLModel), 저장 파일은 app/db.py의 engine을 그대로 씁니다.
SQLite는 칸을 바꾸는 명령이 적어서 표를 다시 만드는 방식(batch)을 씁니다.

- 서버를 켤 때 app/db.py가 자동으로 upgrade head를 부릅니다.
- 구조를 바꿀 때 (server/ 폴더에서, 확인용 DATA_DIR로):
    .venv\\Scripts\\alembic revision --autogenerate -m "무엇을 바꾸는지"
  만든 변경 파일(versions/)은 사람이 승인한 뒤에 씁니다.
- alembic.ini는 Windows 기본 인코딩으로 읽혀서 영문만 씁니다.
"""

from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

import app  # noqa: F401  server/.env를 먼저 읽습니다 (DATA_DIR).
from app import models  # noqa: F401  표 정의를 불러와야 SQLModel.metadata가 표를 압니다.
from app.db import engine

config = context.config
# 명령줄에서 부를 때만 기록 설정을 읽습니다. 서버 안에서는 uvicorn의 설정을 그대로 둡니다.
if config.config_file_name is not None and not config.attributes.get("from_app"):
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(url=str(engine.url), target_metadata=target_metadata,
                      literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=True, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
