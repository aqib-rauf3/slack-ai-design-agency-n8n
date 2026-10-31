# Launcher for Local n8n Instance
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Local n8n Instance for AI Design Agency..." -ForegroundColor Cyan
Write-Host " Web UI will be available at: http://localhost:5678" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Load keys from .env (lines like KEY=value, comments start with #)
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#=\s][^=]*)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
} else {
    Write-Host "WARNING: .env not found. Copy .env.example to .env and fill in your keys." -ForegroundColor Yellow
}

# Set local execution environment variables
$env:N8N_PORT = "5678"
$env:N8N_PROTOCOL = "http"
$env:N8N_HOST = "localhost"
$env:EXECUTIONS_DATA_PRUNE = "true"
$env:EXECUTIONS_DATA_MAX_AGE = "168"
# Needed by the workflow: signature check uses crypto, Code nodes read $env
$env:NODE_FUNCTION_ALLOW_BUILTIN = "crypto"
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = "false"

# Start n8n
npx -y n8n
