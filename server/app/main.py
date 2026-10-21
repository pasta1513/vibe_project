from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_db
from .photos import clear_temp
from .responses import install_error_handlers
from .routers import clothes, diary, keywords, photos, recommendations, scores, settings, tags, uploads, weather


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버를 켤 때 저장소를 준비합니다. (P-12)
    init_db()
    # 등록을 마치지 않고 남은 임시 사진을 버립니다. (DATA-MODEL §8)
    clear_temp()
    yield


app = FastAPI(title="코디 추천 웹앱", lifespan=lifespan)
install_error_handlers(app)
for module in (settings, keywords, tags, uploads, clothes, photos, weather, scores, recommendations, diary):
    app.include_router(module.router)


# 서버가 켜져 있는지 확인하는 주소 (P-11)
@app.get("/api/health")
def health():
    return {"status": "ok"}
