# 코디 추천 웹앱

갖고 있는 옷을 등록하면 날씨와 스타일 태그에 맞춰 코디를 추천해 주고, 내가 직접 조합한 코디는 AI가 점수를 매겨 주는 웹앱입니다.

## 현재 상태

아직 만들기 전입니다. 지금은 README.md, AGENTS.md, DECISIONS.md, PLAN.md, PRD.md, ARCHITECTURE.md, SCREEN-SPEC.md, DATA-MODEL.md, API-SPEC.md, TEST-PLAN.md, DESIGN.md가 있습니다.

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
2. 필요한 것: Python 3.12, Node.js 22 (npm 포함). 아직 코드가 없으므로 그 밖에 설치할 것은 없습니다. (D-008)

## 실행 방법

개발 중에는 서버(`server/`, http://localhost:8000)와 화면(`web/`, http://localhost:5173)을 따로 켭니다. (D-008)
실제 명령은 코드를 만든 뒤 적습니다. AI, 2D 이미지화, 날씨는 진짜를 연결하기 전까지 가짜로 동작합니다. (D-007)

## 확인과 기록

- 기능을 하나 만들 때마다 직접 실행해서 제대로 되는지 확인합니다.
- 바뀐 내용은 이 README.md의 "현재 상태"와 "프로젝트 문서"에 바로 반영합니다.
- 새 문서를 만들면 "프로젝트 문서" 표에 한 줄씩 추가합니다.
