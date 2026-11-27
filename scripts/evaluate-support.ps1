#Requires -Version 5.1
<#
.SYNOPSIS
  Execute a avaliacao real do SuportAI em bancos descartaveis.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\evaluate-support.ps1 -ApproveExternalAI
#>
[CmdletBinding()]
param(
    [switch]$ApproveExternalAI,
    [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
# Native nonzero exit codes are handled explicitly, including on PowerShell 7.
$PSNativeCommandUseErrorActionPreference = $false
if (-not $ApproveExternalAI) {
    Write-Host 'A avaliacao usa fixtures sinteticas e uma chave de API com cobranca. Execute com -ApproveExternalAI se estiver autorizado.'
    exit 2
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$containerId = $null
$reportDir = $null
$apiKey = $null
$dbPassword = $null
$savedEnv = @{}
$summary = [ordered]@{
    schemaVersion = 1
    commit = $null
    chatModel = 'gpt-4.1-mini'
    embeddingModel = 'text-embedding-3-small'
    stages = [ordered]@{}
    coverage = $null
    rag = $null
    comparisonComparable = $null
    automatedChecksPassed = $false
    humanReview = 'pending'
    status = 'failed'
}
$exitCode = 1

function Set-EvalEnv([string]$Name, [string]$Value) {
    if (-not $savedEnv.ContainsKey($Name)) {
        $savedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Protect-Log([string]$Text) {
    foreach ($secret in @($apiKey, $dbPassword)) {
        if (-not [string]::IsNullOrEmpty($secret)) {
            $Text = $Text.Replace($secret, '[REDACTED]')
        }
    }
    return ($Text -replace 'sk-[A-Za-z0-9_-]{12,}', '[REDACTED]')
}

function Invoke-Logged {
    param([string]$Executable, [string[]]$Arguments, [string]$LogName)
    # Windows PowerShell represents native stderr as ErrorRecord objects.
    # Preserve both streams and use the actual exit code, not the pipeline status.
    $ErrorActionPreference = 'Continue'
    & $Executable @Arguments 2>&1 |
        ForEach-Object { Protect-Log $_.ToString() } |
        Tee-Object -FilePath (Join-Path $reportDir $LogName) |
        Out-Host
    return [int]$LASTEXITCODE
}

function Require-Success([int]$Code, [string]$Stage) {
    $summary.stages[$Stage] = $Code
    if ($Code -ne 0) { throw "Falha em $Stage (codigo $Code). Consulte os logs." }
}

function Read-Report([string]$Name) {
    $path = Join-Path $reportDir $Name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    try { return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { Write-Warning "Relatorio invalido ou incompleto: $Name"; return $null }
}

Push-Location $root
try {
    foreach ($cmd in @('git','docker','node')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "Comando necessario nao encontrado: $cmd"
        }
    }
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) { $npmCommand = Get-Command npm -CommandType Application -ErrorAction Stop }
    $npm = $npmCommand.Source
    $nodeMajor = & node -p "process.versions.node.split('.')[0]"
    if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 22) { throw 'Node.js 22 ou superior e obrigatorio.' }

    $dirty = & git status --porcelain
    if ($LASTEXITCODE -ne 0 -or $dirty) {
        throw 'Use um checkout limpo e commitado (git status). O script nao altera nem descarta seu codigo.'
    }
    $commit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') { throw 'Nao foi possivel identificar o commit.' }
    $summary.commit = $commit
    $corpus = (Resolve-Path 'docs/validation-pr-84-evidence/2026-11-27-head-7818cc2/rag-calibration-corpus-v2.json').Path
    $baseline = (Resolve-Path 'docs/validation-pr-84-evidence/episode-real-report.json').Path

    # env.ts loads the repository .env. Refuse ambiguous *_FILE settings rather
    # than loading secrets from an unrelated deployment configuration.
    & node -e "const fs=require('node:fs');const u=require('node:util');const f=fs.existsSync('.env')?u.parseEnv(fs.readFileSync('.env','utf8')):{};process.exit(['DATABASE_URL_FILE','OPENAI_API_KEY_FILE','BOOTSTRAP_ADMIN_PASSWORD_FILE'].some(k=>process.env[k]||f[k])?1:0)"
    if ($LASTEXITCODE -ne 0) { throw 'Configuracao de arquivos de segredos ambigua. Use um checkout local de desenvolvimento, sem *_FILE.' }
    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker indisponivel. Abra o Docker Desktop.' }

    $apiKey = $env:OPENAI_API_KEY
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        $secureKey = Read-Host 'Chave da API OpenAI autorizada para este teste' -AsSecureString
        try { $apiKey = [System.Net.NetworkCredential]::new('', $secureKey).Password }
        finally { $secureKey.Dispose() }
    }
    if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'Chave da API ausente.' }
    $apiKey = $apiKey.Trim()

    $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $commit.Substring(0,7) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $reportDir = Join-Path $root "test-results\support-eval-$runId"
    New-Item -ItemType Directory -Path $reportDir | Out-Null
    $containerName = "suportai-eval-$runId"

    if (-not $SkipInstall) {
        Write-Host '1/5 - Instalando dependencias do lockfile...'
        Require-Success (Invoke-Logged $npm @('ci','--no-audit','--no-fund') 'install.log') 'install'
    } else {
        if (-not (Test-Path 'node_modules/tsx/package.json')) { throw 'Dependencias ausentes. Execute sem -SkipInstall.' }
        $summary.stages.install = 'skipped_by_request'
    }

    # Create our own fresh PostgreSQL instance. Never reuse the Compose DB,
    # an inherited DATABASE_URL, a production host, or an existing container.
    Write-Host '2/5 - Preparando PostgreSQL/pgvector descartavel...'
    $dbPassword = [guid]::NewGuid().ToString('N')
    $created = & docker run -d --rm --name $containerName --label 'suportai.purpose=synthetic-evaluation' -p '127.0.0.1::5432' -e 'POSTGRES_USER=suportai' -e "POSTGRES_PASSWORD=$dbPassword" -e 'POSTGRES_DB=suportai_eval' 'pgvector/pgvector:pg17'
    if ($LASTEXITCODE -ne 0 -or "$created" -notmatch '^[a-f0-9]{64}$') { throw 'Falha ao criar o banco descartavel.' }
    $containerId = "$created"
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $containerId pg_isready -U suportai -d suportai_eval | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'O PostgreSQL de teste nao ficou pronto.' }
    $binding = & docker port $containerId '5432/tcp'
    if ($LASTEXITCODE -ne 0 -or "$binding" -notmatch '^127\.0\.0\.1:([0-9]+)$') { throw 'Porta local isolada nao confirmada.' }
    $port = $Matches[1]
    $baseUrl = "postgres://suportai:$dbPassword@127.0.0.1:$port"
    # Separate RAG corpus database: an interrupted conversational suite must
    # not contaminate the subsequent ranking experiment.
    Require-Success (Invoke-Logged 'docker' @('exec',$containerId,'createdb','-U','suportai','suportai_rag_eval') 'create-rag-db.log') 'createRagDatabase'

    $settings = @{
        NODE_ENV = 'test'
        APP_ORIGIN = 'http://localhost:5173'
        OPENAI_API_KEY = $apiKey
        OPENAI_BASE_URL = 'https://api.openai.com/v1'
        ALLOW_EXTERNAL_AI_DATA_PROCESSING = 'true'
        OPENAI_CHAT_MODEL = $summary.chatModel
        OPENAI_EMBED_MODEL = $summary.embeddingModel
        RUN_REAL_EPISODES = '1'
        AGENT_MAX_STEPS = '8'
        AGENT_MAX_RAG_SEARCHES = '5'
        AGENT_TIMEOUT_MS = '60000'
        AGENT_TOKENS_PER_CALL = '1800'
        AGENT_COMPLETION_TOKEN_BUDGET = '9000'
        AGENT_TOTAL_TOKEN_BUDGET = '40000'
        EVALUATION_COMMIT = $commit
        DATABASE_URL = "$baseUrl/suportai_eval"
        TEST_DATABASE_URL = "$baseUrl/suportai_eval"
        EPISODE_REPORT_PATH = (Join-Path $reportDir 'phone-report.json')
        EXPANDED_EPISODE_REPORT_PATH = (Join-Path $reportDir 'expanded-report.json')
        CALIBRATION_REPORT_PATH = (Join-Path $reportDir 'calibration-report.json')
        RAG_SPLIT = 'all'
        RAG_INCLUDE_SECURITY = '1'
        RAG_CANDIDATE_SEMANTIC_MINIMUM = '0.45'
        RAG_RERANK_SEMANTIC_MINIMUM = '0.56'
        RAG_RERANK_DIVERSITY_PENALTY = '0.18'
        RAG_RERANK_LEXICAL_MINIMUM = '0'
    }
    foreach ($name in $settings.Keys) { Set-EvalEnv $name $settings[$name] }
    Require-Success (Invoke-Logged $npm @('run','db:migrate') 'migrate.log') 'migrate'
    Require-Success (Invoke-Logged $npm @('run','db:migrate') 'migrate-repeat.log') 'migrateRepeat'

    Write-Host '3/5 - Avaliando os episodios HTTP com o modelo real...'
    Push-Location (Join-Path $root 'apps/api')
    try {
        $summary.stages.episodes = Invoke-Logged 'node' @('--import','tsx','--test','src/investigation-chat.test.ts') 'execution.log'
    } finally { Pop-Location }

    # Preserve reports and continue independent evaluations even if assertions fail.
    Write-Host '4/5 - Avaliando os 100 casos positivos e 20 casos de seguranca do RAG...'
    Set-EvalEnv 'DATABASE_URL' "$baseUrl/suportai_rag_eval"
    Set-EvalEnv 'TEST_DATABASE_URL' "$baseUrl/suportai_rag_eval"
    Require-Success (Invoke-Logged $npm @('run','db:migrate') 'migrate-rag.log') 'migrateRag'
    $summary.stages.rag = Invoke-Logged $npm @('run','rag:baseline','-w','@suportai/api','--',$corpus,(Join-Path $reportDir 'rag-report.json'),$commit) 'rag.log'

    Write-Host '5/5 - Comparando com o baseline e verificando cobertura...'
    if (Test-Path -LiteralPath $env:EPISODE_REPORT_PATH -PathType Leaf) {
        $summary.stages.comparison = Invoke-Logged $npm @('run','episode:compare','-w','@suportai/api','--',$baseline,$env:EPISODE_REPORT_PATH,(Join-Path $reportDir 'comparison.json')) 'comparison.log'
    } else { $summary.stages.comparison = 'missing_phone_report' }
    $phone = Read-Report 'phone-report.json'
    $expanded = Read-Report 'expanded-report.json'
    $calibration = Read-Report 'calibration-report.json'
    $rag = Read-Report 'rag-report.json'
    $comparison = Read-Report 'comparison.json'
    $phoneTurns = @($phone.turns | Where-Object { $null -ne $_ }).Count
    $expandedEpisodes = @($expanded.episodes | Where-Object { $null -ne $_ }).Count
    $expandedTurns = @($expanded.episodes | ForEach-Object { $_.turns } | Where-Object { $null -ne $_ }).Count
    $expandedFailures = @($expanded.failures | Where-Object { $null -ne $_ }).Count
    $calibrationCases = @($calibration | Where-Object { $null -ne $_ }).Count
    $coverageOk = ($phone.complete -eq $true -and $phone.commit -eq $commit -and $phoneTurns -eq 5 -and
        $expanded.complete -eq $true -and $expanded.commit -eq $commit -and $expandedEpisodes -eq 9 -and
        $expandedTurns -eq 26 -and $calibrationCases -eq 4)
    $summary.coverage = [ordered]@{
        phoneTurns = $phoneTurns
        expandedEpisodes = $expandedEpisodes
        expandedTurns = $expandedTurns
        expandedFailedChecks = $expandedFailures
        calibrationCases = $calibrationCases
        complete = $coverageOk
    }
    $ragOk = ($null -ne $rag -and $rag.commit -eq $commit -and $rag.pilot.cases -eq 60 -and
        $rag.holdout.cases -eq 40 -and $rag.security.cases -eq 20 -and
        $null -ne $rag.security.unauthorizedOrRevokedReturned -and $rag.security.unauthorizedOrRevokedReturned -eq 0)
    if ($rag) {
        $summary.rag = [ordered]@{
            pilot = $rag.pilot
            holdout = $rag.holdout
            securityCases = $rag.security.cases
            unauthorizedOrRevokedReturned = $rag.security.unauthorizedOrRevokedReturned
        }
    }
    if ($comparison) { $summary.comparisonComparable = $comparison.comparable }
    $summary.automatedChecksPassed = ($summary.stages.episodes -eq 0 -and $summary.stages.rag -eq 0 -and
        $summary.stages.comparison -eq 0 -and $coverageOk -and $expandedFailures -eq 0 -and $ragOk -and
        $comparison.comparable -eq $true)
    if ($summary.automatedChecksPassed) {
        $summary.status = 'automated_checks_passed_review_pending'
        $exitCode = 0
    } else { $summary.status = 'evaluation_requires_review' }
} catch {
    Write-Warning (Protect-Log $_.Exception.Message)
    $summary.error = Protect-Log $_.Exception.Message
} finally {
    # Remove only the container created by this invocation; never stop Compose
    # or delete existing volumes. Restore process-scoped environment variables.
    if ($containerId) {
        try {
            & docker stop $containerId | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel parar o container descartavel.' }
        } catch {
            Write-Warning (Protect-Log $_.Exception.Message)
            $summary.status = 'cleanup_failed'
            $summary.automatedChecksPassed = $false
            $exitCode = 1
        }
    }
    foreach ($name in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process')
    }
    $apiKey = $null
    $dbPassword = $null
    Pop-Location
    if ($reportDir -and (Test-Path -LiteralPath $reportDir -PathType Container)) {
        $summary.finishedAtUtc = [DateTime]::UtcNow.ToString('o')
        $summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $reportDir 'summary.json') -Encoding UTF8
        try {
            $zip = "$reportDir.zip"
            Compress-Archive -Path (Join-Path $reportDir '*') -DestinationPath $zip
            Write-Host "Arquivo para analise: $zip"
        } catch { Write-Warning 'Nao foi possivel compactar. Envie a pasta de relatorios.' }
        Write-Host "Relatorios: $reportDir"
        Write-Host "Resultado: $($summary.status). Revisao humana continua pendente."
    }
}
exit $exitCode
