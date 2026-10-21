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


# 아직 Bedrock으로 옮기지 않은 일: 가짜 AI를 그대로 씁니다.
def pick_keywords(photo_path, candidates):
    return fake_ai.pick_keywords(photo_path, candidates)


def decide_gender(word, category):
    return fake_ai.decide_gender(word, category)


def find_similar(name, candidates):
    return fake_ai.find_similar(name, candidates)


def recommend(closet, weather, tag):
    return fake_ai.recommend(closet, weather, tag)


def score(outfit, weather, tag):
    return fake_ai.score(outfit, weather, tag)
