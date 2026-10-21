"""서버가 지키는 규칙 (ARCHITECTURE §4)."""

from typing import Mapping, Optional

# 코디 구성의 칸 (DATA-MODEL §1.3, §12)
SLOTS = ("top", "bottom", "dress", "shoes", "outer")


def check_outfit(slots: Mapping[str, Optional[int]],
                 categories: Mapping[int, str]) -> Optional[str]:
    """코디 구성이 규칙에 맞는지 봅니다. 맞으면 None, 아니면 실패 종류를 돌려줍니다.

    slots: 칸 이름 → 옷 번호. outer가 None이면 "입지 않음"입니다.
    categories: 옷장에 있는 옷 번호 → 구분. 지운 옷을 넣지 않으면 지운 옷도 걸러집니다.
    """
    top, bottom, dress = slots.get("top"), slots.get("bottom"), slots.get("dress")
    if slots.get("shoes") is None:
        return "empty_slot"
    if dress is not None:
        if top is not None or bottom is not None:
            return "dress_with_top_bottom"
    elif top is None or bottom is None:
        return "empty_slot"

    for slot in SLOTS:
        clothing_id = slots.get(slot)
        if clothing_id is None:
            continue
        if clothing_id not in categories:
            return "unknown_clothing"
        if categories[clothing_id] != slot:
            return "wrong_category"
    return None


def outfit_key(slots: Mapping[str, Optional[int]]) -> tuple:
    """같은 코디인지 비교할 때 쓰는 값. 한 칸이라도 다르면 다른 코디입니다. (PRD §5)"""
    return tuple(slots.get(slot) for slot in SLOTS)


def normalize_name(name: str) -> str:
    """키워드와 태그 이름의 띄어쓰기를 정리합니다. (DATA-MODEL §4, §5)

    앞뒤 띄어쓰기는 지우고, 가운데 여러 칸은 한 칸으로 바꿉니다. 같은 이름인지도 바꾼 이름으로 봅니다.
    예: " 봄   소풍 " → "봄 소풍"
    """
    return " ".join(name.split())


def particle(word: str, after_consonant: str, after_vowel: str) -> str:
    """받침이 있으면 after_consonant, 없으면 after_vowel. 예: particle("검정", "은", "는") → "은"

    한글이 아닌 글자로 끝나면 after_vowel을 씁니다. (화면의 labels.js subjectParticle과 같음)
    """
    last = ord(word[-1]) if word else 0
    if not 0xAC00 <= last <= 0xD7A3:
        return after_vowel
    return after_consonant if (last - 0xAC00) % 28 else after_vowel
