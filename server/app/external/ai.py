"""AI 연결부 (ARCHITECTURE §2.2). AI를 부르는 곳은 여기 한 군데입니다.

AI가 준 답은 여기서 검사한 뒤에 돌려줍니다. 가짜 AI의 답도 똑같이 검사합니다. (D-007)
"""

import os

from ..models import TYPE_GENDERS
from ..rules import check_outfit, outfit_key
from . import ExternalError, should_fake_fail
from . import fake_ai

# 지금 쓰는 AI. `server/.env`의 AI_PROVIDER로 고릅니다. (P-23)
# 기본은 가짜(fake)입니다. bedrock이면 Amazon Bedrock의 Nova Lite를 씁니다. (D-013)
if os.environ.get("AI_PROVIDER", "fake").strip().lower() == "bedrock":
    from . import bedrock_ai as provider
else:
    provider = fake_ai

MIN_SCORE, MAX_SCORE = 0.1, 5.0


def _fail_if_asked(name: str) -> None:
    """FAKE_FAIL에 적힌 일은 AI를 부르지 않고 실패합니다. 가짜와 Bedrock 모두 같습니다. (TEST-PLAN §13)"""
    if should_fake_fail(name):
        raise ExternalError("ai_failed")


def _valid_score(value) -> bool:
    return isinstance(value, (int, float)) and MIN_SCORE <= round(value, 1) <= MAX_SCORE


def pick_keywords(photo_path, candidates: list[dict]):
    """AI가 사진을 보고 구분과 키워드를 미리 고릅니다.

    candidates: 고를 수 있는 단어 목록 (id 포함).
    돌려주는 것: {"category": 구분 코드 또는 None, "keyword_ids": [...]}, 못 고르면 None.
    목록에 없는 단어는 뺍니다.
    """
    try:
        _fail_if_asked("keywords")
        answer = provider.pick_keywords(photo_path, candidates)
    except ExternalError:
        return None
    if not answer:
        return None
    allowed = {c["id"] for c in candidates}
    return {
        "category": answer.get("category"),
        "keyword_ids": [k for k in answer.get("keyword_ids", []) if k in allowed],
    }


def decide_gender(word: str, category: str) -> tuple[str, bool]:
    """종류 단어의 맞는 성별을 정합니다. (D-005)

    돌려주는 것: (성별 코드, 정했는지). 못 정하면 ("both", False).
    """
    try:
        _fail_if_asked("gender")
        answer = provider.decide_gender(word, category)
    except ExternalError:
        answer = None
    if answer in TYPE_GENDERS:
        return answer, True
    return "both", False


def find_similar(name: str, candidates: list[str]):
    """더하려는 이름과 뜻이 비슷한 단어를 candidates에서 찾습니다. (PRD §4, 사람이 정함 2026-10-21)

    돌려주는 것: 비슷한 단어 하나, 없으면 None.
    AI가 답하지 못하거나 목록에 없는 단어를 주면 비슷한 단어가 없는 것으로 봅니다. (제안)
    """
    try:
        _fail_if_asked("similar")
        answer = provider.find_similar(name, candidates)
    except ExternalError:
        return None
    return answer if answer in candidates and answer != name else None


def recommend(closet: list[dict], weather: dict, tag: str) -> list[dict]:
    """코디를 최대 3벌 추천받습니다.

    closet: 지운 옷을 뺀 옷 목록. 옷마다 {"id", "category", "keywords"}.
    돌려주는 것: [{"outfit", "score", "note_type": "reason", "summary", "details"}, ...]
    검사를 통과하지 못한 코디는 빼고, 하나도 남지 않으면 ExternalError("ai_invalid")를 냅니다.
    """
    _fail_if_asked("recommend")
    answers = provider.recommend(closet, weather, tag)
    categories = {item["id"]: item["category"] for item in closet}
    results, seen = [], set()
    for answer in answers or []:
        outfit = answer.get("outfit") or {}
        key = outfit_key(outfit)
        if check_outfit(outfit, categories) or key in seen:
            continue
        if not _valid_score(answer.get("score")) or not answer.get("summary"):
            continue
        seen.add(key)
        results.append({
            "outfit": outfit,
            "score": round(answer["score"], 1),
            "note_type": "reason",
            "summary": answer["summary"],
            "details": answer.get("details") or {},
        })
        if len(results) == 3:
            break
    if not results:
        raise ExternalError("ai_invalid")
    return results


def score(outfit: dict, weather: dict, tag, items: list[dict] | None = None) -> dict:
    """코디 한 벌의 점수와 코멘트를 받습니다. 태그가 없으면(None) 태그 기준은 빼고 묻습니다.

    items: 칸마다 옷 정보 {"slot", "category", "keywords", "image_path"} (P-25)
    돌려주는 것: {"score", "note_type": "comment", "summary", "details"}
    점수가 범위 밖이면 ExternalError("ai_invalid")를 냅니다.
    입지 않은 칸의 평가는 버립니다.
    """
    _fail_if_asked("score")
    answer = provider.score(outfit, weather, tag, items or [])
    if not answer or not _valid_score(answer.get("score")) or not answer.get("summary"):
        raise ExternalError("ai_invalid")
    worn = {slot for slot, clothing_id in outfit.items() if clothing_id is not None}
    details = answer.get("details") or {}
    return {
        "score": round(answer["score"], 1),
        "note_type": "comment",
        "summary": answer["summary"],
        "details": {slot: text for slot, text in details.items()
                    if slot in worn and isinstance(text, str) and text},
    }
