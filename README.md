# 코디 추천 웹앱

갖고 있는 옷을 등록하면 날씨와 스타일 태그에 맞춰 코디를 추천해 주고, 내가 직접 조합한 코디는 AI가 점수를 매겨 주는 웹앱입니다.

## 현재 상태

코드 뼈대, 저장소, 가짜 부품, 화면 공통 틀이 있습니다 (P-11 ~ P-14). 처음 열면 마네킹 모양을 고르고, 그 뒤에는 방 안에 잠옷 차림 마네킹과 메뉴 다섯 개가 보입니다. 메뉴 "옷장"에서 옷을 등록하고(사진 올리기, 키워드 고르기), 상세를 보고, 선택 키워드를 고치고, 지울 수 있습니다 (P-15). 메뉴 "설정"에서 마네킹 모양과 내 지역(시·도 17곳)을 바꾸고, 옷 키워드와 스타일 태그를 더하고, 이름을 고치고, 지우고, 종류 단어의 성별을 바꿀 수 있습니다. 옷 등록 창에서도 [+ 더하기]로 키워드를 더할 수 있습니다 (P-16). 비슷한 단어 확인은 AI가 하는데, 지금은 가짜라 "블랙"을 더할 때만 질문이 나옵니다 (D-011). 다른 메뉴는 아직 "준비 중인 화면이에요."만 보입니다. 사진은 `data/photos/`에 저장됩니다. 서버를 켜면 `data/dev.db`가 만들어지고 앱 기본 단어와 태그가 들어갑니다. AI, 2D 이미지화, 날씨는 `server/app/external/`에 가짜로 만들어 두었습니다. 사용자가 쓸 수 있는 기능은 아직 없습니다.

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

개발 중에는 서버(`server/`, http://localhost:8000)와 화면(`web/`, http://localhost:5173)을 따로 켭니다. (D-008)
터미널 두 개에서 하나씩 켭니다.

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
- SQLite 파일과 사진은 `data/` 폴더에 저장됩니다. git에 올리지 않습니다.
- AI, 2D 이미지화, 날씨는 진짜를 연결하기 전까지 가짜로 동작합니다. (D-007)
- 실패 화면을 확인하려면 서버를 켜기 전에 환경 변수 `FAKE_FAIL`에 실패시킬 부품을 적습니다. 쓸 수 있는 이름은 `weather`, `recommend`, `score`, `imaging`입니다. (예: PowerShell에서 `$env:FAKE_FAIL="weather,score"`) 바꾼 뒤에는 서버를 다시 켭니다.

## 확인과 기록

- 기능을 하나 만들 때마다 직접 실행해서 제대로 되는지 확인합니다.
- 바뀐 내용은 이 README.md의 "현재 상태"와 "프로젝트 문서"에 바로 반영합니다.
- 새 문서를 만들면 "프로젝트 문서" 표에 한 줄씩 추가합니다.
