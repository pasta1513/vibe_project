@echo off
chcp 65001 > nul
rem 매일 쓸 때 켜는 파일 (D-018). 더블클릭하면 화면 빌드 → 서버(8080) → 브라우저 순서로 켭니다.
rem 끌 때는 이 창을 닫습니다. 데이터는 data\ 폴더에 저장됩니다 (server\.env의 DATA_DIR로 바꿀 수 있음).
cd /d "%~dp0"
title moire (http://localhost:8080)

echo [1/2] 화면을 빌드합니다...
call npm --prefix web run build
if errorlevel 1 goto failed

echo [2/2] 서버를 켭니다: http://localhost:8080  (끄려면 이 창을 닫으세요)
rem 서버가 응답하기 시작하면 브라우저를 엽니다. 확인 작업에서는 START_NO_BROWSER=1로 열지 않습니다.
if not defined START_NO_BROWSER (
    start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest http://127.0.0.1:8080/api/health -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process http://localhost:8080; break } catch { Start-Sleep -Milliseconds 500 } }"
)
server\.venv\Scripts\python -m uvicorn app.main:app --app-dir server --host 127.0.0.1 --port 8080
if errorlevel 1 goto failed
goto :eof

:failed
echo.
echo 켜지 못했습니다. 위의 오류를 확인해 주세요.
echo 처음이라면 README의 "시작 방법"대로 패키지를 설치했는지 확인합니다.
pause
