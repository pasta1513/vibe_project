"""가짜 AI (D-007). 진짜 AI를 정하면 이 파일 대신 진짜를 ai.py에 끼웁니다.

추천과 점수는 그럴듯한 규칙으로 흉내 내지 않습니다. 진짜로 바꾸면 버릴 코드이기 때문입니다.
"""

import random

REASON_TEXT = "AI 연결 전 예시입니다."
COMMENT_TEXT = "AI 연결 전 예시 코멘트입니다."


def _random_score() -> float:
    return random.randint(1, 50) / 10


def _details(outfit: dict, text: str) -> dict:
    return {slot: text for slot, clothing_id in outfit.items() if clothing_id is not None}


def pick_keywords(photo_path, candidates):
    # 이미 정한 실패 흐름을 그대로 씁니다: "못 고름" (SCREEN-SPEC §2.7)
    return None


def decide_gender(word, category):
    # AI가 정하지 못한 것과 같이 "둘 다"로 둡니다. (D-005)
    return None


# 비슷한 단어 확인 질문을 화면에서 볼 수 있게, 정해 둔 예시 하나에만 "비슷함"을 줍니다.
# (TEST-PLAN T-21, 사람이 정함 2026-10-21) 나머지 이름은 언제나 "비슷한 단어 없음"입니다.
_FAKE_SIMILAR = {"블랙": "검정"}


def find_similar(name, candidates):
    match = _FAKE_SIMILAR.get(name)
    return match if match in candidates else None


# 일부러 실패하기(FAKE_FAIL)는 ai.py가 가짜와 Bedrock 모두에 똑같이 합니다.
# 추천 점수는 ai.py가 score로 따로 매깁니다. (P-26)
def recommend(closet, weather, tag):
    by_category = {}
    for item in closet:
        by_category.setdefault(item["category"], []).append(item["id"])

    choices = []
    if by_category.get("dress"):
        choices.append("dress")
    if by_category.get("top") and by_category.get("bottom"):
        choices.append("top_bottom")
    if not choices or not by_category.get("shoes"):
        return []

    outfits = []
    for _ in range(30):  # 서로 다른 코디를 고를 기회를 넉넉히 줍니다.
        if len(outfits) == 3:
            break
        outfit = {"top": None, "bottom": None, "dress": None,
                  "shoes": random.choice(by_category["shoes"]),
                  "outer": random.choice(by_category.get("outer", []) + [None])}
        if random.choice(choices) == "dress":
            outfit["dress"] = random.choice(by_category["dress"])
        else:
            outfit["top"] = random.choice(by_category["top"])
            outfit["bottom"] = random.choice(by_category["bottom"])
        if outfit in [o["outfit"] for o in outfits]:
            continue
        outfits.append({
            "outfit": outfit,
            "summary": REASON_TEXT,
            "details": _details(outfit, REASON_TEXT),
        })
    return outfits


def score(outfit, weather, tag, items=None, task="score"):
    return {
        "score": _random_score(),
        "summary": COMMENT_TEXT,
        "details": _details(outfit, COMMENT_TEXT),
    }
