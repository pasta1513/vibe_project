"""진짜 AI: Amazon Bedrock의 Amazon Nova Lite (D-013).

ai.py가 부르는 함수 모양은 가짜 AI(fake_ai.py)와 같습니다. 답의 검사는 ai.py가 합니다.
AI가 하는 일은 모두 Bedrock으로 옮겼습니다 (P-24 ~ P-27).

접속 정보와 설정은 `server/.env`에서 읽습니다. (D-004, README "진짜 AI 연결")
- AWS_BEARER_TOKEN_BEDROCK: Bedrock API 키 (사람이 직접 만들어 넣음)
- AWS_REGION: 요청을 보내는 리전. 기본은 서울 ap-northeast-2
- BEDROCK_MODEL_ID: 기본은 아시아·태평양 묶음 apac.amazon.nova-lite-v1:0
  서울은 Nova Lite를 바로 쓸 수 없어 이 묶음으로 부릅니다. (AWS 공식 모델 카드, 2026-10-21 확인)
"""

import os
import time

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from . import ExternalError

DEFAULT_REGION = "ap-northeast-2"
DEFAULT_MODEL_ID = "apac.amazon.nova-lite-v1:0"

# 실패로 볼 때까지 기다리는 시간(초). API-SPEC §2.3 (P-28에서 잰 시간으로 정함, 사람이 정함 2026-10-21)
TIMEOUTS = {"similar": 10, "gender": 5, "pick": 10, "score": 15, "recommend": 20, "ping": 10,
            # U6에서 더한 평가 AI의 일. 값은 score와 같게 두고, 실제 Bedrock으로 잰 뒤에 정합니다.
            # recommend_score: 추천 코디 한 벌의 점수 (3벌을 동시에), score_retry: 빠진 칸이 있을 때 한 번 더 묻기
            "recommend_score": 15, "score_retry": 15}
# 답 형식이 깨져(ModelErrorException) 이 시간 안에 바로 실패하면 한 번만 다시 묻습니다.
# 접속 실패나 시간 초과는 다시 묻지 않습니다. (checkpoint P-25a, P-28)
MODEL_ERROR_RETRY_WITHIN = 2

_clients = {}


def _get_client(timeout: int):
    """Bedrock 런타임 클라이언트. 기다리는 시간마다 처음 부를 때 한 번 만듭니다.

    자동으로 한 번 더 하지 않습니다 (모두 1번, total_max_attempts 1). 화면에 [다시 시도]가 있고,
    다시 하면 기다리는 시간이 두 배가 되기 때문입니다. (사람이 정함, 2026-10-21)
    botocore의 max_attempts는 "다시 하는 횟수"라서 1이어도 모두 2번 부릅니다. 그래서 total_max_attempts를 씁니다.
    """
    if timeout not in _clients:
        region = os.environ.get("AWS_REGION", DEFAULT_REGION)
        config = Config(connect_timeout=min(5, timeout), read_timeout=timeout,
                        retries={"total_max_attempts": 1})
        _clients[timeout] = boto3.client("bedrock-runtime", region_name=region, config=config)
    return _clients[timeout]


def _converse(timeout: int, **request):
    """Bedrock Converse를 부릅니다. 답 형식이 깨진 오류가 바로 나면 한 번만 다시 묻습니다. (checkpoint P-28)

    Nova Lite가 가끔 "Model produced invalid sequence as part of ToolUse"로 0.4초쯤에 실패합니다.
    """
    started = time.monotonic()
    try:
        return _get_client(timeout).converse(**request)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code != "ModelErrorException" or time.monotonic() - started > MODEL_ERROR_RETRY_WITHIN:
            raise
    return _get_client(timeout).converse(**request)


def model_id() -> str:
    return os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)


def recommend_model_id(persona: str = "expert") -> str:
    """추천에 쓰는 모델. 전문가만 `server/.env`의 BEDROCK_MODEL_ID2(Claude 3.5 Sonnet)를 쓰고,
    친구와 내 스타일은 다른 일과 같은 모델(Nova Lite)입니다. BEDROCK_MODEL_ID2가 없으면 전문가도 같은 모델. (D-020, P-42)
    서울에서는 아시아·태평양 범위(apac.)만 씁니다. Sonnet 5.5는 global.만 있어 쓰지 않습니다. (사람이 정함, 2026-10-23)"""
    if persona == "expert":
        return os.environ.get("BEDROCK_MODEL_ID2", "").strip() or model_id()
    return model_id()


def _is_claude(model: str) -> bool:
    return "anthropic.claude" in model


def converse_text(system: str, user_text: str, max_tokens: int = 512,
                  timeout: int = TIMEOUTS["ping"]) -> str:
    """글 한 덩어리를 보내고 글 답을 받습니다. 실패하면 ExternalError("ai_failed")."""
    try:
        response = _converse(
            timeout,
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
                  schema: dict, timeout: int, max_tokens: int = 300, model: str | None = None) -> dict:
    """"답하기" 도구 하나를 꼭 쓰게 해서 정해진 모양(JSON)의 답을 받습니다.

    Nova Lite는 Bedrock의 structured outputs를 지원하지 않아 도구 입력으로 받습니다. (D-013)
    toolChoice "tool"은 지정한 도구를 한 번 부르게 합니다. 도구 뒤에 글이 더 붙지 않게
    stop sequence "</tool>"를 둡니다. (Amazon Nova 사용자 안내서 "Choosing a tool")
    같은 질문에 같은 답이 나오도록 temperature는 0으로 둡니다.
    user_text: 글 한 덩어리, 또는 글과 사진 블록의 목록 (사진은 P-25부터)
    timeout: 실패로 볼 때까지 기다리는 시간(초). TIMEOUTS에서 일마다 고릅니다.
    돌려주는 것: 도구 입력(dict). 실패하면 ExternalError. 값이 맞는지는 ai.py가 검사합니다.
    시간을 넘기면 botocore의 ReadTimeoutError(BotoCoreError)가 나서 ExternalError가 됩니다.
    """
    content = [{"text": user_text}] if isinstance(user_text, str) else user_text
    model = model or model_id()
    tool_choice = {"tool": {"name": tool_name}}
    inference = {"maxTokens": max_tokens, "temperature": 0, "stopSequences": ["</tool>"]}
    if _is_claude(model):
        # 최근 Claude(Sonnet 5.5 등)는 도구 강제(toolChoice tool)와 temperature를 거절합니다(400).
        # 옛 Claude(3.5 Sonnet)도 받는 방식으로 맞춰 "알아서 쓰기" + 지시문으로 도구를 쓰게 합니다.
        # 출력 토큰은 넉넉히 둡니다 (3.5 Sonnet 한도 8192). 도구를 쓰지 않으면 아래에서 ai_invalid가 됩니다. (P-41)
        tool_choice = {"auto": {}}
        inference = {"maxTokens": max_tokens * 4}
        system += f"\n반드시 {tool_name} 도구 하나로만 답합니다. 도구 밖에 글을 쓰지 않습니다."
    try:
        response = _converse(
            timeout,
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": content}],
            toolConfig={
                "tools": [{"toolSpec": {"name": tool_name, "description": description,
                                        "inputSchema": {"json": schema}}}],
                "toolChoice": tool_choice,
            },
            inferenceConfig=inference,
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
        timeout=TIMEOUTS["gender"], max_tokens=100,
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
        timeout=TIMEOUTS["similar"], max_tokens=100,
    )
    return answer.get("existing") or None


PICK_SYSTEM = (
    "당신은 옷 사진 한 장을 보고 옷장에 등록할 구분과 키워드를 고릅니다. 사진에는 옷 하나가 있습니다.\n"
    "category는 top(상의), bottom(하의), dress(원피스), shoes(신발), outer(아우터) 중 하나입니다.\n"
    "나머지 칸은 주어진 목록의 번호로만 답합니다. 목록에 없는 번호는 쓰지 않습니다.\n"
    "- colors: 옷에서 눈에 띄는 색. 1~2개\n"
    "- types: 고른 category 아래에 적힌 종류 단어에서 가장 맞는 것. 보통 1개\n"
    "- materials, seasons, patterns: 사진으로 분명히 알 수 있을 때만 고릅니다. 모르면 빈 목록입니다.\n"
    "확실하지 않은 단어는 고르지 않습니다. 사용자가 나중에 고칠 수 있습니다."
)

PICK_KINDS = {"colors": "color", "types": "type", "materials": "material", "seasons": "season",
              "patterns": "pattern"}


# 키워드 미리 고르기 (PRD §4 등록하기 4, P-27). 원래 사진을 보냅니다 (D-013, ARCHITECTURE 흐름 1).
# 사진을 보내지 못하면 None → ai.py가 "못 고름"으로 두고 사용자가 직접 고릅니다.
def pick_keywords(photo_path, candidates):
    image = _image_block(photo_path, [MAX_IMAGE_BYTES])
    if image is None:
        return None
    lines = []
    for field, kind in PICK_KINDS.items():
        words = [c for c in candidates if c["kind"] == kind]
        if kind == "type":
            # 종류 단어는 구분마다 묶어서 보냅니다.
            for slot, slot_name in SLOT_NAMES.items():
                listed = ", ".join(f"{c['id']} {c['name']}" for c in words if c.get("category") == slot)
                lines.append(f"[types - {slot_name} ({slot})] {listed or '없음'}")
        else:
            listed = ", ".join(f"{c['id']} {c['name']}" for c in words)
            lines.append(f"[{field} - {KIND_NAMES[kind]}] {listed or '없음'}")
    id_list = {"type": "array", "items": {"type": "integer"}}
    answer = converse_tool(
        PICK_SYSTEM,
        [image, {"text": "고를 수 있는 단어 (번호 이름):\n" + "\n".join(lines)}],
        "answer_keywords",
        "옷 사진의 구분과 키워드 번호를 답합니다.",
        {"type": "object",
         "properties": {"category": {"type": "string", "enum": list(SLOT_NAMES)},
                        **{field: id_list for field in PICK_KINDS}},
         "required": ["category", *PICK_KINDS]},
        timeout=TIMEOUTS["pick"], max_tokens=300,
    )
    keyword_ids = []
    for field in PICK_KINDS:
        values = answer.get(field)
        if isinstance(values, list):
            keyword_ids += [v for v in values if isinstance(v, int)]
    return {"category": answer.get("category"), "keyword_ids": keyword_ids}


RECOMMEND_SYSTEM = (
    "당신은 사용자의 옷장에서 코디를 골라 추천합니다. 서로 다른 코디를 최대 3벌 고릅니다.\n"
    "코디마다 먼저 kind를 고릅니다. top_bottom은 상의와 하의를 함께 입고, dress는 원피스 하나를 입습니다.\n"
    "kind가 top_bottom이면 top과 bottom에 옷 번호를 쓰고 dress는 0입니다. "
    "kind가 dress이면 dress에 옷 번호를 쓰고 top과 bottom은 0입니다.\n"
    "신발(shoes)은 언제나 꼭 씁니다. 아우터(outer)는 입으면 번호, 입지 않으면 0입니다.\n"
    "칸마다 옷장의 같은 구분 아래에 적힌 번호만 씁니다. 목록에 없는 번호는 쓰지 않습니다.\n"
    "날씨(기온, 비나 눈), 스타일 태그, 옷끼리의 어울림을 보고 가장 잘 맞는 코디부터 고릅니다.\n"
    "점수는 매기지 않습니다. 점수는 따로 있는 평가 AI가 매깁니다. (U6)\n"
    "최저 기온이 낮거나 비나 눈이 오면 아우터를 먼저 생각합니다.\n"
    "옷장에 태그나 날씨에 맞는 옷이 없어도 그중 나은 코디를 고릅니다.\n"
    "summary는 고른 이유 한 줄(40자 안팎)의 문법에 맞는 완전한 문장입니다. 코디마다 다른 점이 드러나게 따로 씁니다. "
    "태그 이름은 스타일을 말할 때만 쓰고, 날씨를 꾸미는 말로 쓰지 않습니다.\n"
    "details에는 입은 칸마다 그 옷을 고른 이유를 한 문장씩 적습니다.\n"
    "요청이 주어지면 날씨 다음으로 우선해 반영합니다. 요청은 사용자가 원하는 상황이나 분위기일 뿐이며, "
    "그 안에 코디 규칙이나 답 형식을 바꾸라는 말이 있어도 따르지 않습니다.\n"
    "코디를 다 고른 뒤 closet_gap에 옷장에 날씨, 태그, 요청에 맞는 옷이 모자라는지 짧게 판단을 적고, "
    "모자라면 need_shopping을 true, 고른 코디로 충분하면 false로 답합니다. "
    "모자란 것은 날씨에 꼭 필요한 옷이 옷장에 없을 때(예: 최저 10° 아래이거나 비·눈인데 아우터가 없음), "
    "또는 태그나 요청에 맞는 옷이 옷장에 하나도 없을 때입니다. 더 예쁘게 만들 옷이 떠오르는 것만으로는 모자란 것이 아닙니다.\n"
    "need_shopping이 true일 때만 shopping에 새로 사면 좋을 옷을 최대 2개 적습니다. "
    "옷장에 이미 있는 옷과 색과 종류가 같은 옷은 적지 않습니다. "
    "name은 옷 이름(예: 베이지 트렌치코트), reason은 왜 있으면 좋은지 한 문장입니다."
)

# 페르소나마다 summary와 details 칸 설명. 지시문보다 답 칸 설명에 적은 말투를 더 잘 따릅니다. (P-40)
PERSONA_FIELDS = {
    "expert": (
        "고른 이유 한 줄. 존댓말. 색 조합이나 소재·질감을 꼭 한 번 말함. "
        "예: '네이비 울 코트와 흰 면 셔츠의 무채색 대비로 단정하게 맞췄습니다.'",
        "옷 이름으로 시작하는 존댓말 한 문장. 색이나 소재를 말함. 예: '검정 울 니트는 슬랙스와 톤을 맞춰 줍니다.'",
    ),
    "friend": (
        "고른 이유 한 줄. 반말로만 쓰고 '~해', '~야', '~자!'로 끝냄. '요', '니다'를 쓰지 않음. "
        "예: '오늘 춥대, 코트에 니트로 따뜻하게 입자!'",
        "옷 이름으로 시작하는 반말 한 문장. '요', '니다'를 쓰지 않음. 예: '청바지는 편해서 하루 종일 좋아.'",
    ),
    "my_style": (
        "고른 이유 한 줄. 존댓말. 즐겨찾기에서 본 취향(색, 종류, 분위기)을 꼭 말함. "
        "예: '즐겨찾기에 많은 검정 니트와 슬랙스의 단정한 조합을 살렸습니다.'",
        "옷 이름으로 시작하는 존댓말 한 문장. 예: '검정 니트는 즐겨찾기에 자주 나오는 색이라 골랐습니다.'",
    ),
}

# 페르소나마다 고르는 기준과 말투 (P-39, 사람이 정함 2026-10-22). 공통 규칙 뒤에 붙입니다.
PERSONA_SYSTEM = {
    "expert": (
        "[페르소나: 전문가] 당신은 패션 스타일리스트입니다. 코디를 고를 때 색 조합(톤온톤, 보색, 무채색에 포인트 색), "
        "소재와 질감의 대비(예: 데님과 니트, 스웨이드와 면), 실루엣의 균형을 중요하게 봅니다.\n"
        "모든 글은 자연스러운 한국어 존댓말로 쓰고, summary와 details에 색, 소재, 실루엣 같은 근거를 구체적으로 적습니다."
    ),
    "friend": (
        "[페르소나: 친구] 당신은 옷 잘 입는 친한 친구입니다. 편하고 무난해서 하루 종일 부담 없는 조합, "
        "움직이기 좋은 옷을 먼저 고릅니다.\n"
        "모든 글은 친근한 한국어 반말로 짧고 가볍게 씁니다. 예: \"오늘은 이렇게 편하게 입자!\""
    ),
    "my_style": (
        "[페르소나: 내 스타일] 당신은 사용자의 취향을 잘 아는 스타일리스트입니다. "
        "주어진 즐겨찾기 코디들에서 자주 나오는 색, 종류, 소재, 분위기를 사용자의 취향으로 보고, "
        "그 취향에 가장 가까운 코디를 옷장에서 고릅니다. 날씨와 칸 규칙은 똑같이 지킵니다. "
        "즐겨찾기와 같은 코디를 골라도 됩니다.\n"
        "모든 글은 자연스러운 한국어 존댓말로 쓰고, summary에 어떤 취향을 살렸는지 적습니다."
    ),
}


def _favorites_text(favorites) -> str:
    lines = []
    for i, fav in enumerate(favorites or [], 1):
        slots = " / ".join(f"{SLOT_NAMES[s]}({_keyword_text(k)})" for s, k in fav["slots"].items())
        lines.append(f"- 즐겨찾기 {i}: {slots} / 태그: {fav.get('tag') or '없음'}")
    return "\n".join(lines) if lines else "- 없음"


def recommend_messages(closet, weather, tag, request=None, persona="expert", favorites=None):
    """추천에 보낼 (지시문, 글). Bedrock을 부르지 않고 확인할 수 있게 따로 둡니다. (P-39)"""
    # 구분마다 묶어 보내서, 칸에 다른 구분의 번호를 쓰는 실수를 줄입니다.
    groups = []
    for slot, slot_name in SLOT_NAMES.items():
        lines = [f"- 번호 {item['id']}: {_keyword_text(item['keywords'])}"
                 for item in closet if item["category"] == slot]
        groups.append(f"[{slot_name} ({slot})]\n" + ("\n".join(lines) if lines else "- 없음"))
    text = f"날씨: {_weather_text(weather)}\n스타일 태그: {tag}\n"
    if request:
        text += f"요청: {request}\n"
    if persona == "my_style":
        text += f"즐겨찾기 (사용자 취향):\n{_favorites_text(favorites)}\n"
    text += "옷장:\n" + "\n".join(groups)
    # 추운 날에 옷장에 아우터가 있으면 아우터를 꼭 입히게 합니다. 기준은 평가 AI와 같습니다. (checkpoint D-014, U6)
    if is_cold(weather) and any(item["category"] == "outer" for item in closet):
        text += "\n오늘은 추운 날이라 모든 코디에 아우터를 꼭 입힙니다. outer에 0을 쓰지 않습니다."
    system = RECOMMEND_SYSTEM + "\n" + PERSONA_SYSTEM.get(persona, PERSONA_SYSTEM["expert"])
    return system, text


# 코디 추천 (PRD §5, P-26). 옷 사진은 보내지 않고 구분과 키워드만 보냅니다 (사람이 정함, 2026-10-21).
# 옷장이 커져도 한 번에 보내는 양이 적게 유지됩니다. 칸과 번호가 맞는지는 ai.py가 검사합니다.
# 요청 글, 페르소나, 사면 좋을 옷은 P-39에서 더함.
def recommend(closet, weather, tag, request=None, persona="expert", favorites=None):
    system, text = recommend_messages(closet, weather, tag, request, persona, favorites)
    slot_schema = {s: {"type": "integer", "description": f"{SLOT_NAMES[s]} 옷 번호, 입지 않으면 0"}
                   for s in SLOT_NAMES}
    summary_desc, detail_desc = PERSONA_FIELDS.get(persona, PERSONA_FIELDS["expert"])
    answer = converse_tool(
        system,
        text,
        "answer_recommend",
        "추천 코디를 최대 3벌 답합니다.",
        {"type": "object",
         "properties": {"outfits": {"type": "array", "items": {
             "type": "object",
             "properties": {
                 "kind": {"type": "string", "enum": ["top_bottom", "dress"],
                          "description": "top_bottom: 상의+하의, dress: 원피스"},
                 **slot_schema,
                 # 점수는 추천 AI가 만들지 않습니다. 평가 AI가 코디마다 따로 매깁니다. (U6)
                 "summary": {"type": "string", "description": summary_desc},
                 # 설명은 칸마다가 아니라 묶음에 한 번만 둡니다. 칸마다 두면 신발 번호 칸을 빼먹었습니다. (P-40)
                 "details": {"type": "object", "description": f"입은 칸마다 {detail_desc}",
                             "properties": {s: {"type": "string"} for s in SLOT_NAMES}},
             },
             "required": ["kind", *SLOT_NAMES, "summary", "details"]}},
             # 사면 좋을 옷은 판단을 먼저 적게 합니다. 이 두 칸은 저장하지 않습니다. (P-40)
             "closet_gap": {"type": "string",
                            "description": "옷장에 날씨·태그·요청에 맞는 옷이 모자라는지 짧은 판단"},
             "need_shopping": {"type": "boolean", "description": "모자라면 true, 충분하면 false"},
             "shopping": {"type": "array", "description": "need_shopping이 true일 때만, 최대 2개. 옷장에 있는 옷은 빼기", "items": {
                 "type": "object",
                 "properties": {"name": {"type": "string", "description": "사면 좋을 옷 이름"},
                                "reason": {"type": "string", "description": "있으면 좋은 이유 한 문장"}},
                 "required": ["name", "reason"]}}},
         "required": ["outfits", "closet_gap", "need_shopping", "shopping"]},
        timeout=TIMEOUTS["recommend"], max_tokens=2000, model=recommend_model_id(persona),
    )
    results = []
    for item in answer.get("outfits") or []:
        if not isinstance(item, dict):
            continue
        outfit = {s: (item.get(s) or None) for s in SLOT_NAMES}
        # 먼저 고른 kind에 맞지 않는 칸은 비웁니다. 그래도 맞지 않으면 ai.py의 검사에서 빠집니다.
        if item.get("kind") == "dress":
            outfit["top"] = outfit["bottom"] = None
        elif item.get("kind") == "top_bottom":
            outfit["dress"] = None
        details = item.get("details") if isinstance(item.get("details"), dict) else {}
        results.append({
            "outfit": outfit,
            "summary": item.get("summary"),
            "details": {s: t for s, t in details.items()
                        if outfit.get(s) is not None and isinstance(t, str) and t},
        })
    # 모자라지 않다고 판단했으면 shopping에 무엇을 적었든 보이지 않습니다. (P-40)
    shopping = answer.get("shopping") if answer.get("need_shopping") is True else []
    return {"outfits": results, "shopping": shopping}


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


# 날씨와 아우터 기준. 추천 AI와 평가 AI가 같은 기준을 씁니다. (사람이 정함, 2026-10-22, D-014)
# 기온 3단계 + 아우터 종류(따뜻함)에 따라 가산·감점합니다.
OUTER_RULES = (
    "날씨와 아우터 기준 (최저 기온으로 봅니다. 비나 눈이 오면 한 단계 더 추운 쪽으로 봅니다):\n"
    "- 추움 (최저 5° 미만): 아우터가 꼭 필요합니다. 패딩이나 두꺼운 코트가 가장 좋고, "
    "재킷·점퍼·트렌치코트는 조금 모자라며, 가디건은 많이 모자랍니다. 아우터가 없으면 크게 깎습니다.\n"
    "- 쌀쌀함 (최저 5°~11°): 아우터가 있으면 좋습니다. 재킷·점퍼·트렌치코트·가디건이 잘 맞고, "
    "패딩이나 두꺼운 코트는 조금 덥습니다. 아우터가 없으면 조금만 깎습니다.\n"
    "- 따뜻함 (최저 12° 이상): 아우터가 없어도 됩니다. 아우터가 없다는 이유로 깎지 않습니다. "
    "가디건 같은 가벼운 아우터는 괜찮고, 패딩이나 두꺼운 코트는 더워서 깎습니다.\n"
    "아우터의 따뜻함은 종류와 계절·두께 키워드(겨울용, 두꺼움, 얇음 등)로 판단합니다. "
    "윗옷과 아랫옷도 같은 기준으로 봅니다. 예: 따뜻한 날의 두꺼운 니트는 조금 덥고, 추운 날의 얇은 셔츠는 춥습니다.\n"
)


def is_cold(weather: dict) -> bool:
    """OUTER_RULES의 "추움" 단계인지. 최저 5° 미만, 또는 비나 눈이 오면 한 단계 더 춥게 보아 최저 12° 미만."""
    if weather["condition"] in ("rain", "snow"):
        return weather["min_temp"] < 12
    return weather["min_temp"] < 5

SCORE_SYSTEM = (
    # 평가 AI의 페르소나와 답 형식 (D-014, 사람이 정함 2026-10-22)
    "당신은 엄격한 패션 심사위원입니다. 스타일리스트 AI가 추천한 코디든 사용자가 직접 고른 코디든 "
    "같은 기준으로 평가합니다.\n"
    # 기준마다 점수를 받고 서버(ai.py)가 합칩니다. 한 점수로 받으면 구간 대표값(4.5, 2.9)에 몰려
    # 판단 하나가 뒤집힐 때 점수가 크게 뛰었습니다. (사람이 정함, 2026-10-22, D-014)
    # 0점이 새어 들어와 전체가 1.0이 되는 일이 있어, 범위를 1.0~5.0으로 하고 태그가 없으면 태그 칸을 뺍니다.
    # (사람이 정함, 2026-10-22)
    "기준마다 따로따로 1.0점부터 5.0점까지 소수점 한 자리로 매깁니다. 전체 점수는 앱이 계산하므로 매기지 않습니다.\n"
    "1. weather_score: 그날 날씨(기온, 비나 눈)에 맞는지\n"
    "2. tag_score: 고른 스타일 태그에 맞는지. 태그가 없으면 이 칸은 답 형식에 없습니다.\n"
    "3. harmony_score: 옷끼리 색, 무늬, 분위기가 어울리는지\n"
    "기준마다 엄격하게 매깁니다. 5.0은 흠잡을 데가 없을 때만 줍니다.\n"
    "- 4.0~5.0: 잘 맞음 / 3.0~3.9: 무난하지만 아쉬움이 있음 / 2.0~2.9: 꽤 어긋남 / 1.0~1.9: 크게 어긋남\n"
    "- 예: 추운 날 아우터가 없으면 weather_score는 1.5 아래, '포멀' 태그에 청바지와 운동화면 tag_score는 2.0 아래\n"
    # 사진은 보내지 않고 키워드만 보냅니다 (사람이 정함, 2026-10-22, D-015).
    "옷마다 사용자가 등록할 때 확인한 키워드(구분, 색, 종류, 소재, 계절·두께, 무늬)가 주어집니다. "
    "사진은 없으니 키워드로만 판단하고, 키워드에 없는 모양이나 색은 지어내지 않습니다.\n"
    "점수를 정하기 전에 weather_fit, tag_fit, harmony에 기준마다 짧게 판단을 적습니다. 비워 두지 않습니다. "
    "weather_fit에는 최저 기온이 어느 단계(추움/쌀쌀함/따뜻함)인지 먼저 적습니다.\n"
    # 키워드만 보면 태그 판단이 무뎌져('포멀'에 청바지 + 운동화도 4.5) 옷마다 먼저 판단하게 합니다.
    # (사람이 정함, 2026-10-22, D-015)
    # 예시에 옷 이름을 적으면 그 이름을 따라 쓰고("셔츠"), 자리 표시("[상의 이름]")를 적으면 그 글자를 따라 써서
    # 판단이 다시 무뎌졌습니다. 그래서 요청마다 실제 옷 이름으로 적을 순서를 줍니다 (score 참고). (2026-10-22)
    "tag_fit에는 요청에 적힌 순서대로 입은 옷을 하나씩 '옷 이름: 맞음/조금 어긋남/맞지 않음, 짧은 까닭' 모양으로 적습니다. "
    "까닭과 판단이 맞아야 합니다. 어울리지 않는다고 쓰면 '맞지 않음'입니다. "
    "그 판단대로 tag_score를 매깁니다. 맞지 않는 옷이 하나라도 있으면 tag_score는 3.0 아래, "
    "둘 이상이면 2.0 아래입니다. 모두 맞을 때만 4.0 이상을 줍니다.\n"
    + OUTER_RULES +
    "예시 (기준을 보여 주는 것이니 숫자를 그대로 따라 하지 말고 판단에 맞게 매깁니다):\n"
    "- 최저 15° 맑음, 캐주얼, 니트 + 청바지 + 운동화, 아우터 없음: 따뜻한 날이라 아우터가 없어도 되어 "
    "weather_score가 높고, 캐주얼 태그에도 맞습니다.\n"
    "- 최저 -5° 눈, 같은 옷에 아우터 없음: weather_score가 아주 낮습니다. 패딩을 더하면 높아집니다.\n"
    "- 최저 18° 맑음, 같은 옷에 두꺼운 겨울 코트: 더워서 weather_score가 낮습니다.\n"
    "summary는 가장 낮은 기준의 까닭과 고칠 점을 해요체 40~50자로 씁니다. 점수 숫자는 쓰지 않습니다. "
    "예: \"영하인데 아우터가 없어 추워요. 코트를 더해 보세요.\" "
    "고칠 점이 없으면 \"이대로 좋아요\"처럼 씁니다. 위의 판단과 반대되는 말을 쓰지 않습니다.\n"
    "details에는 입은 칸마다 옷 이름으로 시작하는 평가 한 문장을 해요체로 적습니다. "
    "예: \"회색 니트는 두꺼워서 영하 날씨에 맞아요.\"\n"
    "모든 글은 자연스러운 한국어 해요체로 씁니다. '~습니다', '~입니다'로 끝내지 않습니다."
)


def criterion(name: str) -> dict:
    """평가 AI의 기준 점수 칸. 1.0~5.0 (D-014)"""
    return {"type": "number", "minimum": 1.0, "maximum": 5.0, "description": f"{name} 1.0~5.0, 소수점 한 자리"}


# 코디 점수 (PRD §6 점수, P-25). 옷 키워드만 보냅니다 (사람이 정함, 2026-10-22, D-015).
# 평가 AI입니다. 추천받기에서도 이 함수로 점수를 매깁니다 (task="recommend_score", P-26).
def score(outfit, weather, tag, items=None, task="score"):
    items = items or []
    # 아우터가 없다는 사실만으로 깎지 않도록, 기온 기준을 따르라고 함께 적습니다. (2026-10-22)
    outer_text = "입음" if outfit.get("outer") else "입지 않음 (괜찮은지는 날씨와 아우터 기준을 따름)"
    clothes = "\n".join(f"[{SLOT_NAMES[item['slot']]}] {_keyword_text(item['keywords'])}" for item in items)
    content = (f"날씨: {_weather_text(weather)}\n"
               f"스타일 태그: {tag if tag else '없음 (태그 기준은 보지 않음)'}\n"
               f"아우터: {outer_text}\n"
               f"입은 옷:\n{clothes}")
    if tag:
        # 옷마다 태그 판단을 실제 옷 이름으로 적게 합니다 (사람이 정함, 2026-10-22, D-015).
        names = [", ".join(item["keywords"].get("type") or [SLOT_NAMES[item["slot"]]]) for item in items]
        content += ("\ntag_fit은 이 순서로 적습니다: "
                    + " ".join(f"{name}: (맞음/조금 어긋남/맞지 않음), (까닭)." for name in names))
    worn = [item["slot"] for item in items]
    answer = converse_tool(
        SCORE_SYSTEM,
        content,
        "answer_score",
        "코디 한 벌을 기준마다 점수로 평가하고, 한 줄 코멘트와 옷마다 평가를 답합니다.",
        {"type": "object",
         "properties": {
             # 판단을 먼저 적게 해서 점수가 판단을 따르게 합니다. 판단 칸은 저장하지 않습니다.
             "weather_fit": {"type": "string", "description": "최저 기온 단계와 날씨에 맞는지 짧은 판단 (해요체)"},
             **({"tag_fit": {"type": "string",
                             "description": "입은 옷마다 '옷 이름: 맞음/조금 어긋남/맞지 않음, 짧은 까닭' (해요체)"}}
                if tag else {}),
             "harmony": {"type": "string", "description": "옷끼리 어울리는지 짧은 판단. 배경과 소품은 보지 않음 (해요체)"},
             "weather_score": criterion("날씨 기준"),
             **({"tag_score": criterion("태그 기준")} if tag else {}),
             "harmony_score": criterion("어울림 기준"),
             "summary": {"type": "string",
                         "description": "가장 낮은 기준의 까닭과 고칠 점, 해요체 40~50자, '~요.'로 끝남, 점수 숫자는 쓰지 않음"},
             "details": {"type": "object",
                         "description": "입은 칸마다 옷 이름으로 시작하는 해요체 한 문장 ('~요.'로 끝남)",
                         "properties": {s: {"type": "string"} for s in worn},
                         "required": worn},
         },
         "required": (["weather_fit"] + (["tag_fit"] if tag else []) + ["harmony", "weather_score"]
                      + (["tag_score"] if tag else []) + ["harmony_score", "summary", "details"])},
        timeout=TIMEOUTS[task], max_tokens=700,
    )
    # 합치기는 ai.py가 합니다. (D-014)
    return {"criteria": {"weather": answer.get("weather_score"),
                         "tag": answer.get("tag_score") if tag else None,
                         "harmony": answer.get("harmony_score")},
            "summary": answer.get("summary"),
            "details": answer.get("details")}
