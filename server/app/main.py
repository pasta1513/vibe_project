from fastapi import FastAPI

app = FastAPI(title="코디 추천 웹앱")


# 서버가 켜져 있는지 확인하는 주소 (P-11)
@app.get("/api/health")
def health():
    return {"status": "ok"}
