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

# 실패로 볼 때까지 기다리는 시간(초). API-SPEC §2.3의 AI 시간과 같습니다. (P-25a, P-28에서 실제로 재서 다시 맞춤)
# 서버가 화면보다 먼저 포기해야, 화면이 실패를 보인 뒤에 서버가 몰래 저장하는 일이 없습니다.
TIMEOUTS = {
    "similar": 5,
    "gender": 15,
    "keywords": 30,
    "score": 30,
    # 추천받기의 AI 45초 = 추천 AI 25초 + 평가 AI 20초 (3벌을 동시에 평가). (P-26)
    "recommend": 25,
    "recommend_score": 20,
    "ping": 15,
}
CONNECT_TIMEOUT = 3

_clients = {}


def _get_client(task: str):
    """일마다 기다리는 시간이 다른 Bedrock 런타임 클라이언트. 처음 부를 때 한 번 만듭니다.

    재시도는 하지 않습니다. 재시도하면 기다리는 시간이 화면의 시간을 넘습니다.
    """
    if task not in _clients:
        region = os.environ.get("AWS_REGION", DEFAULT_REGION)
        config = Config(connect_timeout=CONNECT_TIMEOUT, read_timeout=TIMEOUTS[task],
                        retries={"total_max_attempts": 1, "mode": "standard"})
        _clients[task] = boto3.client("bedrock-runtime", region_name=region, config=config)
    return _clients[task]


def model_id() -> str:
    return os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)


def converse_text(task: str, system: str, user_text: str, max_tokens: int = 512) -> str:
    """글 한 덩어리를 보내고 글 답을 받습니다. 실패하면 ExternalError("ai_failed")."""
    try:
        response = _get_client(task).converse(
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
    return converse_text("ping", "짧게 답하세요.", "연결 확인입니다. '연결됨'이라고만 답하세요.", max_tokens=20)


def converse_tool(task: str, system: str, user_text, tool_name: str, description: str,
                  schema: dict, max_tokens: int = 300, temperature: float = 0) -> dict:
    """"답하기" 도구 하나를 꼭 쓰게 해서 정해진 모양(JSON)의 답을 받습니다.

    Nova Lite는 Bedrock의 structured outputs를 지원하지 않아 도구 입력으로 받습니다. (D-013)
    toolChoice "tool"은 지정한 도구를 한 번 부르게 합니다. 도구 뒤에 글이 더 붙지 않게
    stop sequence "</tool>"를 둡니다. (Amazon Nova 사용자 안내서 "Choosing a tool")
    같은 질문에 같은 답이 나오도록 temperature는 기본 0입니다. 추천만 다양하게 0.7을 씁니다. (P-26)
    task: 기다리는 시간을 고르는 일 이름 (TIMEOUTS)
    user_text: 글 한 덩어리, 또는 글과 사진 블록의 목록 (사진은 P-25부터)
    돌려주는 것: 도구 입력(dict). 실패하면 ExternalError. 값이 맞는지는 ai.py가 검사합니다.
    """
    content = [{"text": user_text}] if isinstance(user_text, str) else user_text
    try:
        response = _get_client(task).converse(
            modelId=model_id(),
            system=[{"text": system}],
            messages=[{"role": "user", "content": content}],
            toolConfig={
                "tools": [{"toolSpec": {"name": tool_name, "description": description,
                                        "inputSchema": {"json": schema}}}],
                "toolChoice": {"tool": {"name": tool_name}},
            },
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature,
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
        "gender",
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
        "similar",
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
    # 평가 AI의 페르소나와 답 형식 (D-014, 사람이 정함 2026-10-22)
    "당신은 엄격한 패션 심사위원입니다. 스타일리스트 AI가 추천한 코디든 사용자가 직접 고른 코디든 "
    "같은 기준으로 평가합니다. 고른 코디 한 벌에 0.1점부터 5.0점까지 소수점 한 자리로 점수를 매깁니다.\n"
    "기준은 세 가지이고, 비중은 상황에 맞게 판단합니다.\n"
    "1. 그날 날씨(기온, 비나 눈)에 맞는지\n"
    "2. 고른 스타일 태그에 맞는지. 태그가 없으면 이 기준은 보지 않습니다.\n"
    "3. 옷끼리 색, 무늬, 분위기가 어울리는지\n"
    "옷마다 사진과 사용자가 붙인 키워드가 함께 주어집니다. 사진은 옷만 찍은 것입니다.\n"
    "점수를 정하기 전에 weather_fit, tag_fit, harmony에 기준마다 짧게 판단을 적습니다.\n"
    "엄격하게 매깁니다. 평균은 3.0 근처이고, 4.5 이상은 드뭅니다. 아래 기준표를 따릅니다.\n"
    "- 4.5~5.0: 날씨, 태그, 어울림이 모두 뛰어날 때만\n"
    "- 3.5~4.4: 셋 다 맞고 흠이 작을 때\n"
    "- 2.5~3.4: 무난하지만 하나가 아쉬울 때\n"
    "- 1.0~2.4: 기준 하나가 크게 어긋날 때. 예: 최저 기온이 5° 아래인데 아우터를 입지 않음, "
    "'포멀' 태그에 청바지와 운동화처럼 편한 옷\n"
    "- 0.1~0.9: 둘 이상 크게 어긋날 때\n"
    "- 0.5 단위로만 매기지 말고 4.3, 2.7처럼 판단에 맞게 소수점 한 자리를 씁니다.\n"
    "- 태그가 없으면 태그 기준으로는 깎지도 더하지도 않고, 날씨와 어울림만으로 점수를 정합니다.\n"
    "summary는 점수를 가장 크게 정한 까닭과 고칠 점을 해요체 40~50자로 씁니다. "
    "예: \"영하인데 아우터가 없어 추워요. 코트를 더해 보세요.\" "
    "점수가 높아 고칠 점이 없으면 \"이대로 좋아요\"처럼 씁니다. 위의 판단과 반대되는 말을 쓰지 않습니다.\n"
    "details에는 입은 칸마다 옷 이름으로 시작하는 평가 한 문장을 해요체로 적습니다. "
    "예: \"회색 니트는 두꺼워서 영하 날씨에 맞아요.\"\n"
    "모든 글은 자연스러운 한국어 해요체로 씁니다."
)


# 코디 점수 (PRD §6 점수, P-25). 옷 키워드와 2D 이미지를 함께 보냅니다 (사람이 정함, 2026-10-21).
# 평가 AI입니다. 추천받기에서도 이 함수로 점수를 매깁니다 (task="recommend_score", P-26).
def score(outfit, weather, tag, items=None, task="score"):
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
        task,
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


RECOMMEND_SYSTEM = (
    # 추천 AI의 페르소나와 답 형식 (D-014, 사람이 정함 2026-10-22). 역할은 화면에 보이지 않습니다.
    "당신은 사용자의 옷장만으로 코디를 짜는 스타일리스트입니다. 그날 날씨와 고른 스타일 태그를 보고 "
    "서로 다른 코디를 3벌 짭니다. 점수는 매기지 않습니다. 점수는 따로 있는 심사위원이 매깁니다.\n"
    "코디마다 맡은 역할이 다릅니다. 이 순서대로 답합니다.\n"
    "1번 무난: 날씨에 가장 안전하고 누구나 어울리는 기본 조합\n"
    "2번 태그 충실: 고른 스타일 태그의 분위기를 가장 잘 살리는 조합\n"
    "3번 과감: 색이나 조합을 한 걸음 더 시도하는 조합. 날씨 규칙은 지킵니다.\n"
    "옷이 모자라면 1번부터 만들 수 있는 만큼만 답합니다.\n"
    "지킬 규칙:\n"
    "- 옷은 목록에 있는 번호로만 고릅니다. 없는 번호를 지어내지 않습니다.\n"
    "- 한 벌은 (상의 + 하의) 또는 원피스 하나, 그리고 신발 하나입니다. 원피스를 입으면 상의와 하의는 0입니다.\n"
    "- 아우터는 하나 고르거나, 입지 않으면 0입니다. 최저 기온이 낮거나 비나 눈이 오면 아우터를 먼저 생각합니다.\n"
    "- 옷은 구분이 맞는 칸에만 넣습니다. 예: [상의] 옷은 top_id에만 넣습니다.\n"
    "- 3벌은 서로 한 칸 이상 달라야 합니다. 옷이 모자라 3벌을 다르게 만들 수 없으면 만들 수 있는 만큼만 답합니다.\n"
    "- 색, 무늬, 분위기가 어울리게 고릅니다.\n"
    "먼저 plan에 날씨와 태그를 보고 어떤 옷이 필요한지 짧게 적은 뒤 코디를 고릅니다.\n"
    "summary는 그 코디를 고른 가장 큰 까닭 하나를 해요체 30자 안팎의 한 문장으로 씁니다. "
    "그 코디에 실제로 고른 옷만 말합니다. 예: \"영하라 니트와 코트로 따뜻하게 입었어요.\"\n"
    "details에는 입은 칸마다 옷 이름으로 시작해 그 옷을 고른 까닭을 해요체 한 문장으로 적습니다. "
    "예: \"회색 니트는 두꺼워서 영하 날씨에 맞아요.\" 입지 않은 칸은 빈 문자열입니다.\n"
    "모든 글은 자연스러운 한국어 해요체로 씁니다."
)
RECOMMEND_SLOTS = ("top", "bottom", "dress", "shoes", "outer")


def _closet_text(closet: list[dict]) -> str:
    lines = [f"#{c['id']} [{CATEGORY_NAMES.get(c['category'], c['category'])}] {_keyword_text(c['keywords'])}"
             for c in closet]
    return "\n".join(lines)


# 코디 추천 (PRD §5 추천 결과, P-26). 추천 AI입니다. 옷 키워드만 보내고 (사람이 정함, 2026-10-22),
# 같은 조건에서도 조금씩 다른 코디가 나오도록 temperature 0.7을 씁니다 (사람이 정함, 2026-10-22).
# 돌려주는 것: [{"outfit", "summary", "details"}]. 검사와 점수는 ai.py가 합니다.
def recommend(closet, weather, tag):
    answer = converse_tool(
        "recommend",
        RECOMMEND_SYSTEM,
        (f"날씨: {_weather_text(weather)}\n"
         f"스타일 태그: {tag}\n"
         f"옷장 (번호 [구분] 키워드):\n{_closet_text(closet)}"),
        "answer_outfits",
        "1번 무난, 2번 태그 충실, 3번 과감 순서로 서로 다른 코디를 최대 3벌 답합니다. 입지 않은 칸의 번호는 0입니다.",
        {"type": "object",
         "properties": {
             # 판단을 먼저 적게 해서 코디가 판단을 따르게 합니다. 저장하지 않습니다.
             "plan": {"type": "string", "description": "날씨와 태그로 본 필요한 옷, 짧게"},
             "outfits": {
                 "type": "array",
                 "maxItems": 3,
                 "items": {
                     "type": "object",
                     "properties": {
                         **{f"{slot}_id": {"type": "integer", "description": f"{SLOT_NAMES[slot]} 옷 번호, 없으면 0"}
                            for slot in RECOMMEND_SLOTS},
                         "summary": {"type": "string", "description": "고른 까닭 한 줄"},
                         "details": {"type": "object",
                                     "properties": {slot: {"type": "string"} for slot in RECOMMEND_SLOTS}},
                     },
                     "required": [f"{slot}_id" for slot in RECOMMEND_SLOTS] + ["summary", "details"],
                 },
             },
         },
         "required": ["plan", "outfits"]},
        max_tokens=1500,
        temperature=0.7,
    )
    results = []
    for item in answer.get("outfits") or []:
        if not isinstance(item, dict):
            continue
        outfit = {}
        for slot in RECOMMEND_SLOTS:
            value = item.get(f"{slot}_id")
            outfit[slot] = value if isinstance(value, int) and value > 0 else None
        details = item.get("details") if isinstance(item.get("details"), dict) else {}
        results.append({"outfit": outfit, "summary": item.get("summary"), "details": details})
    return results
