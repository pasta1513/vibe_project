"""응답의 공통 모양 (API-SPEC §2.1).

성공:      {"result": "ok", "data": ...}
확인 필요: {"result": "confirm", "confirm": {"kind": ..., ...}}
실패:      {"result": "error", "error": {"kind": ..., "message": "화면에 보일 한 줄"}}

HTTP 상태: 성공과 확인 필요는 200, 잘못된 입력은 400, 없는 것은 404, 저장소 실패는 500
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError


def ok(data=None) -> dict:
    return {"result": "ok", "data": data}


def confirm(kind: str, **details) -> dict:
    return {"result": "confirm", "confirm": {"kind": kind, **details}}


class ApiError(Exception):
    """요청을 처리하지 못했을 때 냅니다. 아무것도 저장하지 않은 상태여야 합니다."""

    def __init__(self, kind: str, message: str, status: int = 400):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status = status


def _error(kind: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"result": "error", "error": {"kind": kind, "message": message}})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError):
        return _error(exc.kind, exc.message, exc.status)

    # FastAPI가 원래 422로 내는 입력 오류도 같은 모양으로 바꿉니다.
    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        return _error("invalid_input", "보낸 값이 올바르지 않아요.", 400)

    @app.exception_handler(SQLAlchemyError)
    async def handle_storage_error(request: Request, exc: SQLAlchemyError):
        return _error("storage_failed", "저장소에 쓰거나 읽지 못했어요.", 500)
