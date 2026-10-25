from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .db import PROJECT_DIR, init_db
from .external import imaging
from .photos import clear_temp
from .responses import install_error_handlers
from .routers import (clothes, diary, favorites, keywords, photos, recommendations, scores, settings,
                      tags, uploads, weather)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버를 켤 때 저장소를 준비합니다. (P-12)
    init_db()
    # 등록을 마치지 않고 남은 임시 사진을 버립니다. (DATA-MODEL §8)
    clear_temp()
    # rembg 모델을 따로 미리 올립니다. 켜는 일을 기다리게 하지 않습니다. (U4)
    imaging.warm_up_in_background()
    yield


app = FastAPI(title="moire", lifespan=lifespan)
install_error_handlers(app)
for module in (settings, keywords, tags, uploads, clothes, photos, weather, scores, recommendations,
               diary, favorites):
    app.include_router(module.router)


# 서버가 켜져 있는지 확인하는 주소 (P-11)
@app.get("/api/health")
def health():
    return {"status": "ok"}


# 매일 쓸 때: 빌드한 화면(web/dist)을 같은 서버가 내보냅니다 (D-018). /api 주소들보다 뒤에 둬야 합니다.
# 빌드 결과가 없으면(개발할 때) 화면은 Vite(5173)가 내보내고, 이 서버는 /api만 맡습니다. (D-008)
WEB_DIST = PROJECT_DIR / "web" / "dist"
if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
