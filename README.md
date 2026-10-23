# moire

moire는 "My Outfit Identity Reflection Everyday"의 약자입니다. (D-019)

갖고 있는 옷을 등록하면 날씨와 스타일 태그에 맞춰 코디를 추천해 주고, 내가 직접 조합한 코디는 AI가 점수를 매겨 주는 웹앱입니다.

## 현재 상태

P-11 ~ P-22를 마쳐 앱 전체가 가짜 부품(AI, 2D 이미지화, 날씨)으로 동작하게 만든 뒤, AI와 날씨는 진짜로 연결했습니다 (P-23 ~ P-29). 2D 이미지화는 서버에서 사진의 배경을 지운 투명 PNG를 만듭니다 (D-015, P-30). 마네킹에는 옷 종류별 틀 9개에 옷의 대표 색을 칠한 캐릭터 의상이 입혀지고, 옷 등록 창에서 [마네킹에 입혀 보기]로 미리 볼 수 있습니다 (D-016, P-31). 옷의 무늬(줄무늬, 데님, 벨트 등)도 path로 바꿔 틀 안에만 보입니다 (P-32). 옷 등록 창의 [2D 이미지]에서 무늬 표현(자동 감지, 디테일 살리기, 줄무늬 정리), 벡터 색상 수(3~10), 대표 색상만을 골라 바로 미리 보고 옷과 함께 저장합니다. 등록한 옷도 옷 상세의 [무늬 바꾸기]로 같은 조절을 할 수 있습니다. 무늬는 화면에서 만들고 서버는 검사·저장만 합니다 (P-39, D-020 제안). 옷장의 옷 상세와 등록 창에서 [모습 조절]로 틀(같은 구분 안)과 옷의 위치·크기·기울기, 무늬의 위치·크기를 바꿀 수 있고, 마네킹이 나오는 모든 곳에 보입니다 (P-33). 등록 창의 [배경 고치기]로 배경색 고르기, 허용 오차, 지우기·복원 브러시, 실행 취소로 2D 이미지를 직접 고칠 수 있습니다 (P-34). 화면은 모두 시안(`style/html`과 사람이 준 그림)의 1536×1024 그림을 배경으로 깔고 창 크기에 맞춰 줄어듭니다 (P-38). 처음 열면 성별 → 키 → 체형 → 확인을 한 단계씩 골라 마네킹 모양을 정하고, 그 뒤에는 처음 화면(방 안에 잠옷 차림 마네킹, 말풍선, 오늘 날씨 카드)과 메뉴 다섯 개가 보입니다. 메뉴바 로고를 누르면 언제든 처음 화면으로 돌아옵니다. 메뉴 "옷장"에서 구분별 옷 목록을 보고, 옷을 등록하고(사진 올리기, 키워드 고르기, [+ 더하기]), 상세를 보고, 선택 키워드를 고치고, 지울 수 있습니다. 메뉴 "새 옷 입기"에서 날짜(오늘 포함 5일), 지역, 태그를 고르고, 옷을 마네킹에 입혀 점수를 보거나, AI의 추천을 최대 3벌 받아 [입혀 보기]로 고칠 수 있습니다. [확정하기]를 누르면 코디 일기에 저장되고 날씨 배경(맑음, 비, 눈)에 확정한 옷 차림과 날씨 카드, 오늘의 코디 아이템이 보입니다. 메뉴 "코디 일기"에서 3열 카드를 달별로 거르고 최신순·오래된순으로 보며, ⋯ 메뉴로 다시 입혀 보거나 지우고, ♡/♥로 즐겨찾기에 넣거나 뺄 수 있습니다. 추천 카드의 하트, 점수 확인 단계와 확정한 뒤 화면의 [즐겨찾기]로도 즐겨찾기에 넣을 수 있고, 메뉴 "즐겨찾기"의 옷걸이에서 카드를 끌어서 순서를 바꾸고, ♥로 바로 빼고, 카드를 눌러 다시 입혀 볼 수 있습니다. 메뉴 "설정"은 왼쪽 메뉴 네 개로 나뉘어, 마네킹 모양([설정 완료]로 저장), 내 지역(시·도 17곳), 옷 키워드와 종류 단어의 성별, 스타일 태그를 관리합니다. 비슷한 단어 확인은 AI가 합니다 (D-011). 가짜 AI(`AI_PROVIDER=fake`)일 때는 "블랙"을 더할 때만 질문이 나옵니다. 사진은 `data/photos/`에 저장됩니다. 서버를 켜면 `data/app.db`가 없을 때 새로 만들고 앱 기본 단어와 태그를 넣습니다 (D-017). AI, 2D 이미지화, 날씨는 `server/app/external/`에 있고, 진짜를 연결하는 일은 사람이 정한 뒤에 합니다. 진짜 AI는 Amazon Bedrock의 Nova Lite로 정했고(D-013), 연결 준비를 마쳤습니다 (P-23). 종류 단어의 성별, 비슷한 단어 판단, 코디 점수는 Nova Lite가 합니다 (P-24, P-25). 점수는 옷 키워드와 2D 이미지를 함께 보고 매깁니다. 코디 추천도 Nova Lite가 하며, 옷 사진 없이 구분과 키워드만 보고 고릅니다 (P-26). 옷을 등록할 때 사진을 보고 구분과 키워드를 미리 고르는 일도 Nova Lite가 합니다 (P-27). AI를 기다리는 시간은 일마다 잰 값으로 정했고(API-SPEC §2.3), 넘기면 실패로 보고 정해 둔 실패 흐름을 탑니다 (P-28). `server/.env`의 `AI_PROVIDER`가 `fake`면 모두 가짜 AI가 답합니다. 날씨는 OpenWeatherMap의 무료 5일 예보로 받습니다 (D-014, P-29). 하루 상태(맑음, 흐림, 비, 눈)는 활동 시간(06시~21시) 예보로 고르고, 오늘은 지금 이후 시간만 반영됩니다. `server/.env`의 `WEATHER_PROVIDER`가 없거나 `fake`면 가짜 날씨입니다.

문서는 README.md, AGENTS.md, DECISIONS.md, PLAN.md, PRD.md, ARCHITECTURE.md, SCREEN-SPEC.md, DATA-MODEL.md, API-SPEC.md, TEST-PLAN.md, DESIGN.md가 있습니다.

만들 기능:
- 갖고 있는 옷 등록
- 날씨와 스타일 태그에 맞춘 코디 추천
- 내가 조합한 코디를 AI가 점수 매기기

## 프로젝트 문서

| 문서 | 내용 |
| --- | --- |
| [README.md](README.md) | 프로젝트 소개와 현재 상태, 시작 방법 (지금 보고 있는 문서) |
| [AGENTS.md](AGENTS.md) | AI가 작업하기 전에 읽는 작업 규칙 |
| [DECISIONS.md](DECISIONS.md) | 사람이 확정한 결정 기록 |
| [PLAN.md](PLAN.md) | 작업 목록, 상태, 완료 조건, 검증 결과, 다음 행동 |
| [PRD.md](PRD.md) | 사용자가 보거나 겪는 일 (무엇을 만들지) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 부품과 각 부품의 책임 (어떤 구조로) |
| [SCREEN-SPEC.md](SCREEN-SPEC.md) | 화면에서 보이는 것과 할 수 있는 행동 |
| [DATA-MODEL.md](DATA-MODEL.md) | 저장할 정보의 이름과 뜻, 앱 기본 단어 목록 |
| [API-SPEC.md](API-SPEC.md) | 화면과 서버가 주고받는 약속 |
| [TEST-PLAN.md](TEST-PLAN.md) | 무엇을 보면 통과인지 (검사 시나리오와 기대 결과) |
| [DESIGN.md](DESIGN.md) | 화면이 어떻게 보이는지 (색, 글자, 여백, 모양 규칙과 그림 목록) |

## 시작 방법

1. README.md와 AGENTS.md부터 읽고 앱이 무엇을 하는지, 지금 어디까지 됐는지, 어떤 규칙으로 작업하는지 확인합니다.
2. 필요한 것: Python 3.12, Node.js 22 (npm 포함). (D-008)
3. 처음 한 번 패키지를 설치합니다. 버전은 `server/requirements.txt`와 `web/package-lock.json`에 고정되어 있습니다.

```bash
cd server
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

```bash
cd web
npm install
```

## 실행 방법

### 매일 쓸 때 (D-018)

프로젝트 맨 위의 `start.bat`을 더블클릭합니다. 화면을 빌드하고 서버를 켠 뒤 브라우저에서 http://localhost:8080 을 엽니다.
끌 때는 열린 창(검은 창)을 닫습니다. 데이터는 `data/`에 저장됩니다.

- 빌드나 서버가 실패하면 창이 닫히지 않고 오류가 보입니다. 처음 한 번 "시작 방법"의 패키지 설치를 했는지 확인합니다.
- 바탕화면 바로가기: `start.bat`을 마우스 오른쪽 버튼으로 눌러 "바로 가기 만들기"를 고른 뒤, 만들어진 바로가기를 바탕화면으로 옮깁니다.
- 이 PC에서만 열립니다. (D-002)
- 확인 작업에서는 환경 변수 `START_NO_BROWSER=1`로 브라우저를 열지 않고, `DATA_DIR`로 다른 저장 폴더를 씁니다.

### 개발할 때 (D-008)

서버(`server/`, http://localhost:8000)와 화면(`web/`, http://localhost:5173)을 따로 켭니다. 매일 쓰는 앱(8080)과 함께 켜 둘 수 있습니다.
터미널 두 개에서 하나씩 켭니다. 진짜 데이터를 건드리지 않으려면 서버를 켜기 전에 `DATA_DIR`을 다른 폴더로 둡니다 (예: PowerShell에서 `$env:DATA_DIR="data-dev"`).

```bash
cd server
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

```bash
cd web
npm run dev
```

- 브라우저에서 http://localhost:5173 을 열면 화면이 보입니다. 화면의 `/api` 요청은 Vite 중계로 서버에 넘어갑니다.
- 서버의 요청을 직접 보내 확인할 때는 http://localhost:8000/docs 를 엽니다. (D-010)
- SQLite 파일(`data/app.db`)과 사진(`data/photos/`)은 `data/` 폴더에 저장됩니다. git에 올리지 않습니다. 저장 폴더는 `server/.env`의 `DATA_DIR`로 바꿀 수 있습니다 (D-017).
- DB 구조는 서버를 켤 때 자동으로 최신이 됩니다 (Alembic, `server/migrations/`). 따로 명령을 치지 않습니다.
- 개발할 때와 확인 작업에는 `data-dev/`를 씁니다 (git에 올리지 않음). 확인에 쓰는 상품 사진 2장은 `data-dev/fixtures/`에 있습니다.
- AI와 날씨는 `server/.env`의 `AI_PROVIDER`, `WEATHER_PROVIDER`로 가짜와 진짜를 고릅니다. 2D 이미지화는 서버 안에서 배경을 지우며 고를 것이 없습니다 (D-015). `FAKE_FAIL=imaging`이면 일부러 실패합니다.
- 실패 화면을 확인하려면 서버를 켜기 전에 환경 변수 `FAKE_FAIL`에 실패시킬 부품을 적습니다. 쓸 수 있는 이름은 `weather`, `recommend`, `score`, `imaging`입니다. (예: PowerShell에서 `$env:FAKE_FAIL="weather,score"`) 바꾼 뒤에는 서버를 다시 켭니다. `FAKE_FAIL`은 가짜 부품에만 듣습니다. 진짜 날씨·AI로 실패를 보려면 서버를 켤 때 환경 변수로 틀린 `OPENWEATHERMAP_API_KEY`나 `BEDROCK_MODEL_ID`를 줍니다 (TEST-PLAN §13).

## 진짜 AI 연결 (Amazon Bedrock, D-013)

진짜 AI는 Amazon Bedrock의 Amazon Nova Lite입니다. 설정하지 않으면 지금처럼 가짜 AI로 동작합니다.

1. AWS 콘솔에서 직접 합니다. (AI는 계정 작업과 키 입력을 하지 않습니다.)
   - Amazon Bedrock 콘솔에서 Nova Lite를 쓸 수 있는지 확인합니다.
   - Bedrock API 키를 만듭니다.
2. `server/.env` 파일을 만들고 아래 값을 적습니다. 이 파일은 git에 올라가지 않습니다. (D-004)

```
AI_PROVIDER=bedrock
AWS_BEARER_TOKEN_BEDROCK=<Bedrock API 키>
AWS_REGION=ap-northeast-2
BEDROCK_MODEL_ID=apac.amazon.nova-lite-v1:0
OPENWEATHERMAP_API_KEY=<OpenWeatherMap API 키>
```

- `OPENWEATHERMAP_API_KEY`: 날씨에 쓸 키입니다. `WEATHER_PROVIDER=openweathermap`일 때만 씁니다.
- `WEATHER_PROVIDER`: `openweathermap`이면 진짜 날씨(무료 5 Day / 3 Hour Forecast, D-014), 없거나 `fake`면 가짜 날씨. 적지 않으면 가짜입니다.

- `AI_PROVIDER`: `bedrock`이면 진짜 AI, 없거나 `fake`면 가짜 AI
- `AWS_REGION`, `BEDROCK_MODEL_ID`: 적지 않으면 위의 값을 씁니다. 서울은 Nova Lite를 바로 쓸 수 없어 아시아·태평양 묶음(`apac.`)으로 부르며, 요청은 도쿄, 서울, 오사카, 뭄바이, 싱가포르, 시드니 중 한 곳에서 처리될 수 있습니다.
- 값을 바꾼 뒤에는 서버를 다시 켭니다.
- AI가 하는 일(키워드 미리 고르기, 종류 단어의 성별, 비슷한 단어 판단, 코디 점수, 코디 추천)은 모두 Bedrock으로 옮겼습니다 (P-24 ~ P-27).

## 확인과 기록

- 기능을 하나 만들 때마다 직접 실행해서 제대로 되는지 확인합니다.
- 바뀐 내용은 이 README.md의 "현재 상태"와 "프로젝트 문서"에 바로 반영합니다.
- 새 문서를 만들면 "프로젝트 문서" 표에 한 줄씩 추가합니다.
