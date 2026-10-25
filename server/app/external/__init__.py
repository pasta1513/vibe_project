"""외부 부품 (AI, 2D 이미지화, 날씨). 진짜를 정하기 전까지는 가짜입니다. (D-007)

나머지 서버 코드는 이 폴더의 ai, imaging, weather 모듈만 부릅니다.
진짜로 바꿀 때는 이 폴더 안만 고칩니다.
"""

import os


class ExternalError(Exception):
    """외부 부품이 일을 하지 못했을 때. kind는 실패 종류입니다."""

    def __init__(self, kind: str, message: str = ""):
        super().__init__(message or kind)
        self.kind = kind


def should_fake_fail(name: str) -> bool:
    """환경 변수 FAKE_FAIL에 적힌 부품은 일부러 실패합니다. (TEST-PLAN §13)

    예: FAKE_FAIL=weather,score
    쓸 수 있는 이름: weather, imaging (날씨, 2D 이미지화)
    AI 일: recommend(추천 AI), score(평가 AI, 점수 확인하기), recommend_score(추천 후보를 평가 AI가 채점하는 단계),
    keywords, gender, similar. AI 일은 ai.py가 검사하므로 가짜 AI와 Bedrock 모두에서 똑같이 실패합니다. (P-25a, U6)
    """
    names = os.environ.get("FAKE_FAIL", "")
    return name in {n.strip() for n in names.split(",") if n.strip()}
