"""서버 패키지. 다른 코드보다 먼저 `server/.env`를 읽습니다. (D-004, P-23)

`.env`가 없으면 아무것도 하지 않습니다. 이미 있는 환경 변수는 덮어쓰지 않습니다.
"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
