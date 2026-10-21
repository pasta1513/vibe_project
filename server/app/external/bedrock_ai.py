"""진짜 AI: Amazon Bedrock의 Amazon Nova Lite (D-013).

ai.py가 부르는 함수 모양은 가짜 AI(fake_ai.py)와 같습니다. 답의 검사는 ai.py가 합니다.
아직 Bedrock으로 옮기지 않은 일은 가짜 AI를 그대로 부릅니다. P-24 ~ P-27에서 하나씩 옮깁니다.

접속 정보와 설정은 `server/.env`에서 읽습니다. (D-004, README "진짜 AI 연결")
- AWS_BEARER_TOKEN_BEDROCK: Bedrock API 키 (사람이 직접 만들어 넣음)
- AWS_REGION: 요청을 보내는 리전. 기본은 서울 ap-northeast-2
- BEDROCK_MODEL_ID: 기본은 아시아·태평양 묶음 apac.amazon.nova-lite-v1:0
  서울은 Nova Lite를 바로 쓸 수 없어 이 묶음으로 부릅니다. (AWS 공식 모델 카드, 2026-10-21 확인)
"""

import os

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from . import ExternalError
from . import fake_ai

DEFAULT_REGION = "ap-northeast-2"
DEFAULT_MODEL_ID = "apac.amazon.nova-lite-v1:0"

_client = None


def _get_client():
    """Bedrock 런타임 클라이언트. 처음 부를 때 한 번 만듭니다."""
    global _client
    if _client is None:
        region = os.environ.get("AWS_REGION", DEFAULT_REGION)
        # 실패로 볼 때까지 기다리는 시간은 API-SPEC §2.3을 따르도록 일마다 정합니다. (P-28에서 다시 맞춤)
        config = Config(connect_timeout=5, read_timeout=60, retries={"max_attempts": 2})
        _client = boto3.client("bedrock-runtime", region_name=region, config=config)
    return _client


def model_id() -> str:
    return os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)


def converse_text(system: str, user_text: str, max_tokens: int = 512) -> str:
    """글 한 덩어리를 보내고 글 답을 받습니다. 실패하면 ExternalError("ai_failed")."""
    try:
        response = _get_client().converse(
            modelId=model_id(),
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user_text}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.2},
        )
    except (BotoCoreError, ClientError) as exc:
        raise ExternalError("ai_failed", str(exc)) from exc
    blocks = response.get("output", {}).get("message", {}).get("content", [])
    return "".join(block.get("text", "") for block in blocks).strip()


def ping() -> str:
    """연결 확인용 짧은 질문 하나. (P-23)"""
    return converse_text("짧게 답하세요.", "연결 확인입니다. '연결됨'이라고만 답하세요.", max_tokens=20)


def converse_tool(system: str, user_text, tool_name: str, description: str,
                  schema: dict, max_tokens: int = 300) -> dict:
    """"답하기" 도구 하나를 꼭 쓰게 해서 정해진 모양(JSON)의 답을 받습니다.

    Nova Lite는 Bedrock의 structured outputs를 지원하지 않아 도구 입력으로 받습니다. (D-013)
    toolChoice "tool"은 지정한 도구를 한 번 부르게 합니다. 도구 뒤에 글이 더 붙지 않게
    stop sequence "</tool>"를 둡니다. (Amazon Nova 사용자 안내서 "Choosing a tool")
    같은 질문에 같은 답이 나오도록 temperature는 0으로 둡니다.
    user_text: 글 한 덩어리, 또는 글과 사진 블록의 목록 (사진은 P-25부터)
    돌려주는 것: 도구 입력(dict). 실패하면 ExternalError. 값이 맞는지는 ai.py가 검사합니다.
    """
    content = [{"text": user_text}] if isinstance(user_text, str) else user_text
    try:
        response = _get_client().converse(
            modelId=model_id(),
            system=[{"text": system}],
            messages=[{"role": "user", "content": content}],
            toolConfig={
                "tools": [{"toolSpec": {"name": tool_name, "description": description,
                                        "inputSchema": {"json": schema}}}],
                "toolChoice": {"tool": {"name": tool_name}},
            },
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0,
                             "stopSequences": ["</tool>"]},
        )
    except (BotoCoreError, ClientError) as exc:
        raise ExternalError("ai_failed", str(exc)) from exc
    for block in response.get("output", {}).get("message", {}).get("content", []):
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == tool_name and isinstance(tool_use.get("input"), dict):
            return tool_use["input"]
    raise ExternalError("ai_invalid", "도구 답이 없습니다.")


CATEGORY_NAMES = {"top": "상의", "bottom": "하의", "shoes": "신발", "outer": "아우터",
                  "dress": "원피스"}

GENDER_SYSTEM = (
    "당신은 한국어 옷 이름을 분류합니다. 옷 종류 단어가 주로 어느 성별의 옷으로 쓰이는지 고릅니다. "
    "여성 옷이면 female, 남성 옷이면 male, 둘 다 흔히 입거나 애매하면 both를 고릅니다. "
    "확실하지 않으면 both를 고릅니다."
)


# 종류 단어의 성별 (D-005, P-24). 못 정하면 None → ai.py가 "둘 다"로 둡니다.
def decide_gender(word, category):
    answer = converse_tool(
        GENDER_SYSTEM,
        f"구분: {CATEGORY_NAMES.get(category, category)}\n종류 단어: {word}",
        "answer_gender",
        "종류 단어에 맞는 성별을 답합니다.",
        {"type": "object",
         "properties": {"gender": {"type": "string", "enum": ["female", "male", "both"]}},
         "required": ["gender"]},
        max_tokens=100,
    )
    return answer.get("gender")


SIMILAR_SYSTEM = (
    "당신은 옷 키워드와 스타일 태그 목록을 관리합니다. 새로 더하려는 이름과 같은 뜻으로 쓰이는 "
    "다른 이름이 목록에 이미 있는지 찾습니다.\n"
    "같은 뜻으로 보는 것: 외래어와 우리말(블랙과 검정), 표기만 다른 것(캐쥬얼과 캐주얼, 티샤쓰와 티셔츠), "
    "줄임말(진과 청바지).\n"
    "같은 뜻으로 보지 않는 것: 뜻이 가깝기만 한 것(연두와 초록), 진하기나 밝기를 덧붙인 것(진회색과 회색, "
    "연파랑과 파랑), 분위기가 비슷한 다른 스타일(오피스룩과 포멀, 데일리와 캐주얼), 더 좁거나 넓은 것.\n"
    "두 이름을 서로 바꿔 써도 뜻이 완전히 같을 때만 같은 뜻입니다. 조금이라도 의심되면 빈 문자열을 답합니다.\n"
    "있으면 목록에 적힌 그대로 하나를 답하고, 없으면 빈 문자열을 답합니다."
)


# 비슷한 단어 (D-011, P-24). 기준은 "같은 뜻으로 쓰이는 다른 이름만" (사람이 정함, 2026-10-21).
# 목록에 없는 답은 ai.py가 "없음"으로 처리합니다.
def find_similar(name, candidates):
    if not candidates:
        return None
    listed = "\n".join(f"- {c}" for c in candidates)
    answer = converse_tool(
        SIMILAR_SYSTEM,
        f"더하려는 이름: {name}\n이미 있는 목록:\n{listed}",
        "answer_similar",
        "같은 뜻으로 쓰이는 이미 있는 이름을 답합니다. 없으면 빈 문자열입니다.",
        {"type": "object",
         "properties": {"existing": {"type": "string",
                                     "description": "목록에 적힌 그대로의 이름, 없으면 빈 문자열"}},
         "required": ["existing"]},
        max_tokens=100,
    )
    return answer.get("existing") or None


# 아직 Bedrock으로 옮기지 않은 일: 가짜 AI를 그대로 씁니다.
def pick_keywords(photo_path, candidates):
    return fake_ai.pick_keywords(photo_path, candidates)


def recommend(closet, weather, tag):
    return fake_ai.recommend(closet, weather, tag)


SLOT_NAMES = {"top": "상의", "bottom": "하의", "dress": "원피스", "shoes": "신발", "outer": "아우터"}
KIND_NAMES = {"color": "색", "type": "종류", "material": "소재", "season": "계절·두께",
              "pattern": "무늬"}
CONDITION_NAMES = {"clear": "맑음", "cloudy": "흐림", "rain": "비", "snow": "눈"}

# 한 요청에 보낼 수 있는 크기는 25MB입니다 (Amazon Nova 사용자 안내서 "Image understanding").
# 여유를 두어 사진은 모두 합쳐 20MB까지만 보내고, 넘으면 그 옷은 키워드만 보냅니다.
MAX_IMAGE_BYTES = 20 * 1024 * 1024
IMAGE_FORMATS = {b"\xff\xd8\xff": "jpeg", b"\x89PNG": "png", b"RIFF": "webp"}


def _image_block(path, budget: list) -> dict | None:
    """2D 이미지 파일을 사진 블록으로. 파일이 없거나 크기 여유가 없으면 None."""
    if path is None:
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    fmt = next((f for head, f in IMAGE_FORMATS.items() if data.startswith(head)), None)
    if fmt is None or len(data) > budget[0]:
        return None
    budget[0] -= len(data)
    return {"image": {"format": fmt, "source": {"bytes": data}}}


def _keyword_text(keywords: dict) -> str:
    parts = [f"{KIND_NAMES[k]}: {', '.join(v)}" for k, v in keywords.items() if v and k in KIND_NAMES]
    return " / ".join(parts) if parts else "키워드 없음"


def _weather_text(weather: dict) -> str:
    return (f"{weather['region']}, 최저 {weather['min_temp']}°, 최고 {weather['max_temp']}°, "
            f"{CONDITION_NAMES.get(weather['condition'], weather['condition'])}")


SCORE_SYSTEM = (
    "당신은 코디를 평가합니다. 사용자가 고른 코디 한 벌에 0.1점부터 5.0점까지 소수점 한 자리로 점수를 매깁니다.\n"
    "기준은 세 가지이고, 비중은 상황에 맞게 판단합니다.\n"
    "1. 그날 날씨(기온, 비나 눈)에 맞는지\n"
    "2. 고른 스타일 태그에 맞는지. 태그가 없으면 이 기준은 보지 않습니다.\n"
    "3. 옷끼리 색, 무늬, 분위기가 어울리는지\n"
    "옷마다 사진과 사용자가 붙인 키워드가 함께 주어집니다. 사진은 옷만 찍은 것입니다.\n"
    "점수를 정하기 전에 weather_fit, tag_fit, harmony에 기준마다 짧게 판단을 적습니다.\n"
    "점수는 5.0에서 시작해 맞지 않는 만큼 깎습니다. 기준 하나가 크게 어긋나면 크게 깎습니다. 예:\n"
    "- 최저 기온이 5° 아래인데 아우터를 입지 않았으면 크게 깎습니다. 같은 날 아우터를 입었으면 깎지 않거나 조금만 깎습니다.\n"
    "- 청바지와 운동화처럼 편한 옷에 '포멀' 태그면 태그 기준에서 크게 깎습니다.\n"
    "- 0.5 단위로만 매기지 말고 4.3, 2.7처럼 판단에 맞게 소수점 한 자리를 씁니다.\n"
    "- 태그가 없으면 태그 기준으로는 깎지도 더하지도 않고, 날씨와 어울림만으로 점수를 정합니다.\n"
    "summary는 한 줄(40자 안팎)의 문법에 맞는 완전한 문장입니다. 위의 판단과 점수에 맞게 씁니다. "
    "점수가 높으면 좋은 점을, 낮으면 무엇 때문에 낮은지 씁니다. 판단과 반대되는 말을 쓰지 않습니다.\n"
    "details에는 입은 칸마다 그 옷에 대한 평가를 한 문장씩 적습니다.\n"
    "모든 글은 자연스러운 한국어 존댓말로 씁니다."
)


# 코디 점수 (PRD §6 점수, P-25). 옷 키워드와 2D 이미지를 함께 보냅니다 (사람이 정함, 2026-10-21).
def score(outfit, weather, tag, items=None):
    items = items or []
    budget = [MAX_IMAGE_BYTES]
    content = [{"text": (
        f"날씨: {_weather_text(weather)}\n"
        f"스타일 태그: {tag if tag else '없음 (태그 기준은 보지 않음)'}\n"
        f"아우터: {'입음' if outfit.get('outer') else '입지 않음'}\n"
        "아래는 입은 옷입니다."
    )}]
    for item in items:
        content.append({"text": f"[{SLOT_NAMES[item['slot']]}] {_keyword_text(item['keywords'])}"})
        block = _image_block(item.get("image_path"), budget)
        if block:
            content.append(block)
    worn = [item["slot"] for item in items]
    answer = converse_tool(
        SCORE_SYSTEM,
        content,
        "answer_score",
        "코디 한 벌의 점수, 한 줄 코멘트, 옷마다 평가를 답합니다.",
        {"type": "object",
         "properties": {
             # 판단을 먼저 적게 해서 점수가 판단을 따르게 합니다. 이 세 칸은 저장하지 않습니다.
             "weather_fit": {"type": "string", "description": "날씨에 맞는지 짧은 판단"},
             "tag_fit": {"type": "string", "description": "태그에 맞는지 짧은 판단, 태그가 없으면 '없음'"},
             "harmony": {"type": "string", "description": "옷끼리 어울리는지 짧은 판단"},
             "score": {"type": "number", "description": "0.1~5.0, 소수점 한 자리"},
             "summary": {"type": "string", "description": "한 줄 코멘트"},
             "details": {"type": "object",
                         "properties": {s: {"type": "string"} for s in worn},
                         "required": worn},
         },
         "required": ["weather_fit", "tag_fit", "harmony", "score", "summary", "details"]},
        max_tokens=600,
    )
    return answer
