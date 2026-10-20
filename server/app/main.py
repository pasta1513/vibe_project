from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_db
from .responses import install_error_handlers
from .routers import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버를 켤 때 저장소를 준비합니다. (P-12)
    init_db()
    yield


app = FastAPI(title="코디 추천 웹앱", lifespan=lifespan)
install_error_handlers(app)
app.include_router(settings.router)


# 서버가 켜져 있는지 확인하는 주소 (P-11)
@app.get("/api/health")
def health():
    return {"status": "ok"}
