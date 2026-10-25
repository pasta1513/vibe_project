"""AI 연결부 (ARCHITECTURE §2.2). AI를 부르는 곳은 여기 한 군데입니다.

AI가 준 답은 여기서 검사한 뒤에 돌려줍니다. 가짜 AI의 답도 똑같이 검사합니다. (D-007)
"""

import logging
import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from ..models import CATEGORIES, TYPE_GENDERS
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
# 평가 AI의 답에 빠진 칸이 있을 때, 첫 답이 이 시간 안에 왔으면 한 번 더 묻습니다. (checkpoint 2026-10-22)
RETRY_WITHIN_SECONDS = 10

# 서버 터미널에 남는 기록. uvicorn이 이미 화면에 찍는 기록 이름을 빌려 씁니다.
log = logging.getLogger("uvicorn.error")


def _fail_if_asked(name: str) -> None:
    """FAKE_FAIL에 적힌 일은 AI를 부르지 않고 실패합니다. 가짜와 Bedrock 모두 같습니다. (TEST-PLAN §13)"""
    if should_fake_fail(name):
        raise ExternalError("ai_failed")


def pick_keywords(photo_path, candidates: list[dict]):
    """AI가 사진을 보고 구분과 키워드를 미리 고릅니다.

    candidates: 고를 수 있는 단어 목록 (id, kind 포함. 종류 단어는 category도).
    돌려주는 것: {"category": 구분 코드 또는 None, "keyword_ids": [...]}, 못 고르면 None.
    목록에 없는 단어와 다섯 구분이 아닌 구분은 뺍니다. 종류 단어는 고른 구분에 속한 것만 남깁니다. (P-27)
    """
    try:
        _fail_if_asked("keywords")
        answer = provider.pick_keywords(photo_path, candidates)
    except ExternalError:
        return None
    if not answer:
        return None
    category = answer.get("category")
    if category not in CATEGORIES:
        category = None
    by_id = {c["id"]: c for c in candidates}
    keyword_ids = []
    for k in answer.get("keyword_ids") or []:
        word = by_id.get(k)
        if word is None or k in keyword_ids:
            continue
        if word["kind"] == "type" and word.get("category") != category:
            continue
        keyword_ids.append(k)
    return {"category": category, "keyword_ids": keyword_ids}


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


MAX_SHOPPING = 2


def _owned(name: str, closet: list[dict]) -> bool:
    """제안한 옷 이름에 옷장 옷 하나의 색과 종류가 함께 들어 있으면 이미 가진 옷으로 봅니다. (P-40)
    예: 옷장에 네이비 코트가 있으면 "네이비 울 코트"는 뺍니다. "베이지 트렌치코트"는 남깁니다."""
    for item in closet:
        kw = item.get("keywords") or {}
        if (any(c in name for c in kw.get("color", []))
                and any(t in name for t in kw.get("type", []))):
            return True
    return False


def _clean_shopping(items, closet: list[dict] | None = None) -> list[dict]:
    """사면 좋을 옷: 이름과 이유가 모두 있는 것만 2개까지. 모양이 틀려도 추천 코디는 그대로 나갑니다. (P-39)
    옷장에 이미 있는 옷은 뺍니다. (P-40)"""
    cleaned = []
    for item in items if isinstance(items, list) else []:
        if len(cleaned) == MAX_SHOPPING:
            break
        if not isinstance(item, dict):
            continue
        name, reason = item.get("name"), item.get("reason")
        if (isinstance(name, str) and isinstance(reason, str) and name.strip() and reason.strip()
                and not _owned(name, closet or [])):
            cleaned.append({"name": name.strip(), "reason": reason.strip()})
    return cleaned


def recommend(closet: list[dict], weather: dict, tag: str, request: str | None = None,
              persona: str = "expert", favorites: list[dict] | None = None, items_for=None) -> dict:
    """코디를 최대 3벌 추천받습니다. 추천 AI가 코디와 이유를 고르고, 평가 AI가 점수를 따로 매깁니다. (U6, 사람이 정함)

    추천 AI는 점수를 만들지 않습니다. 점수는 사용자가 입힌 코디를 평가할 때와 같은 평가 AI(score)가
    고른 코디마다 따로 매깁니다. (checkpoint P-26, D-014)
    closet: 지운 옷을 뺀 옷 목록. 옷마다 {"id", "category", "keywords"}.
    request: 사용자가 쓴 요청 글 (없으면 None). persona: expert, friend, my_style.
    favorites: "내 스타일"일 때 취향으로 넘기는 즐겨찾기 (recommendations.favorites_for_ai). (P-39)
    items_for: 코디 구성 → 평가 AI에 넘길 칸마다 옷 정보 (score의 items). 없으면 키워드만.
    돌려주는 것: {"outfits": [{"outfit", "score", "note_type": "reason", "summary", "details"}, ...],
                 "shopping": [{"name", "reason"}, ...]}
    검사를 통과하지 못했거나 점수를 받지 못한 코디는 빼고, 하나도 남지 않으면 ExternalError("ai_invalid")를 냅니다.
    (점수 없이 보여 주면 응답과 화면의 점수 칸이 달라지므로, 점수를 받지 못한 코디는 뺍니다.)
    """
    _fail_if_asked("recommend")
    reply = provider.recommend(closet, weather, tag, request=request, persona=persona,
                               favorites=favorites)
    reply = reply if isinstance(reply, dict) else {}
    answers = reply.get("outfits") if isinstance(reply.get("outfits"), list) else []
    categories = {item["id"]: item["category"] for item in closet}
    picked, seen, dropped = [], set(), Counter()
    for answer in answers or []:
        outfit = answer.get("outfit") or {}
        key = outfit_key(outfit)
        problem = check_outfit(outfit, categories)
        if problem or key in seen:
            dropped[problem or "same_outfit"] += 1
            continue
        if not answer.get("summary"):
            dropped["no_summary"] += 1
            continue
        seen.add(key)
        picked.append({
            "outfit": outfit,
            "note_type": "reason",
            "summary": answer["summary"],
            "details": _worn_details(outfit, answer.get("details")),
        })
        if len(picked) == 3:
            break

    # 평가 AI가 고른 코디를 동시에 평가합니다. 옷 정보는 저장소를 읽으므로 먼저 모아 둡니다.
    items = [items_for(p["outfit"]) if items_for else [] for p in picked]
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(_score_or_none, p["outfit"], weather, tag, its)
                   for p, its in zip(picked, items)]
        scores = [f.result() for f in futures]
    results = [{**p, "score": sc} for p, sc in zip(picked, scores) if sc is not None]
    dropped["score_failed"] += len(picked) - len(results)
    # AI가 준 코디 수와 검사에서 뺀 이유. 추천이 3벌보다 적게 나올 때 원인을 보려고 남깁니다. (P-26)
    log.info("추천: AI 답 %d벌, 통과 %d벌, 뺀 이유 %s", len(answers or []), len(results), dict(dropped))
    if not results:
        raise ExternalError("ai_invalid")
    # 점수 순서와 관계없이 추천 AI가 고른 순서를 지킵니다.
    return {"outfits": results, "shopping": _clean_shopping(reply.get("shopping"), closet)}


def _score_or_none(outfit, weather, tag, items):
    """추천 코디의 점수만 받습니다. 평가 AI가 실패하면 None (그 코디는 뺌)."""
    try:
        return score(outfit, weather, tag, items, task="recommend_score")["score"]
    except ExternalError as exc:
        log.warning("추천 코디 점수 실패: %s", exc.args)
        return None


def _worn_details(outfit: dict, details) -> dict:
    """입은 칸의 글만 남깁니다."""
    worn = {slot for slot, clothing_id in outfit.items() if clothing_id is not None}
    return {slot: text for slot, text in (details or {}).items()
            if slot in worn and isinstance(text, str) and text}


def score(outfit: dict, weather: dict, tag, items: list[dict] | None = None, task: str = "score") -> dict:
    """코디 한 벌의 점수와 코멘트를 받습니다. 태그가 없으면(None) 태그 기준은 빼고 묻습니다.

    평가 AI입니다. 사용자가 입힌 코디(점수 확인하기)와 추천 코디의 점수(task="recommend_score") 모두 이 함수입니다.
    items: 칸마다 옷 정보 {"slot", "category", "keywords", "image_path"} (P-25). 사진은 넘기지 않습니다 (D-015)
    AI는 기준마다 점수(criteria)를 주고, 전체 점수는 여기서 합칩니다 (combine_score, D-014).
    돌려주는 것: {"score", "note_type": "comment", "summary", "details"}
    기준 점수나 코멘트가 빠진 답이면 한 번만 다시 묻습니다 (_complete_total).
    그래도 없거나 범위 밖이면 ExternalError("ai_invalid")를 냅니다. 입지 않은 칸의 평가는 버립니다.
    """
    _fail_if_asked(task)  # "score" 또는 "recommend_score"
    started = time.monotonic()
    answer = provider.score(outfit, weather, tag, items or [], task=task)
    total = _complete_total(answer, tag)
    # Nova가 꼭 채울 칸을 가끔 빼먹습니다. 첫 답이 빨리 왔을 때만 짧은 시간으로 한 번 더 묻습니다.
    # 접속 실패나 시간 초과(ExternalError)는 다시 묻지 않습니다 (P-25a).
    if total is None and time.monotonic() - started <= RETRY_WITHIN_SECONDS:
        answer = provider.score(outfit, weather, tag, items or [], task="score_retry")
        total = _complete_total(answer, tag)
    if total is None:
        raise ExternalError("ai_invalid")
    return {
        "score": total,
        "note_type": "comment",
        "summary": answer["summary"],
        "details": _worn_details(outfit, answer.get("details")),
    }


def _complete_total(answer, tag):
    """코멘트와 기준 점수가 모두 있으면 합친 점수, 아니면 None."""
    if not answer or not answer.get("summary"):
        return None
    return combine_score(answer.get("criteria") or {}, has_tag=bool(tag))


def combine_score(criteria: dict, has_tag: bool):
    """기준 점수(날씨, 태그, 어울림, 각 1.0~5.0)를 전체 점수 하나로 합칩니다. (사람이 정함, 2026-10-22, D-014)

    전체 = min(평균, 가장 낮은 기준 + 1.0). 크게 어긋난 기준 하나가 평균에 묻히지 않게 합니다.
    태그가 없으면 날씨와 어울림 둘만 씁니다 (PRD §6).
    예: 날씨 1.0, 태그 5.0, 어울림 5.0 → 평균 3.7, 상한 2.0 → 2.0
    돌려주는 것: 1.0~5.0, 소수점 한 자리. 기준 점수가 없거나 범위 밖(0점 포함)이면 None → 점수를 받지 못함.
    """
    names = ("weather", "tag", "harmony") if has_tag else ("weather", "harmony")
    values = [criteria.get(name) for name in names]
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and 1.0 <= v <= 5.0 for v in values):
        return None
    total = min(sum(values) / len(values), min(values) + 1.0)
    return min(MAX_SCORE, max(MIN_SCORE, round(total, 1)))
