@echo off
title Local n8n Server - AI Graphic Design Agency
echo ==========================================================
echo  Starting Local n8n Instance for AI Design Agency...
echo  Web UI: http://localhost:5678
echo ==========================================================

REM Load keys from .env (lines like KEY=value, comments start with #)
if exist .env (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
) else (
  echo WARNING: .env not found. Copy .env.example to .env and fill in your keys.
)

set N8N_PORT=5678
set N8N_PROTOCOL=http
set N8N_HOST=localhost
set EXECUTIONS_DATA_PRUNE=true
set EXECUTIONS_DATA_MAX_AGE=168
REM Needed by the workflow: signature check uses crypto, Code nodes read $env
set NODE_FUNCTION_ALLOW_BUILTIN=crypto
set N8N_BLOCK_ENV_ACCESS_IN_NODE=false

npx -y n8n
pause
