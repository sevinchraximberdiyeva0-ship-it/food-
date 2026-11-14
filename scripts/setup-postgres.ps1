# Enter the database password ONLY in this local terminal's masked prompt.
# No reset, db push, seed, drop, or Git write is performed by this script.
$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$serverDirectory = Join-Path $repoDirectory 'server'
$envFile = Join-Path $serverDirectory '.env'
$resultFile = Join-Path $serverDirectory '.postgres-setup-result.json'
$checkScript = Join-Path $serverDirectory 'scripts\check-postgres.mjs'
$prismaCli = Join-Path $serverDirectory 'node_modules\prisma\build\index.js'
$schemaFile = Join-Path $serverDirectory 'prisma\schema.prisma'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$previousDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
$report = [ordered]@{ status = 'awaiting_password'; database = 'tezkor_demo'; host = '127.0.0.1'; port = 5432; username = 'postgres'; migrationsApplied = $false; checkedAt = [DateTime]::UtcNow.ToString('o') }

function Save-Report {
    $report.checkedAt = [DateTime]::UtcNow.ToString('o')
    [IO.File]::WriteAllText($resultFile, ($report | ConvertTo-Json -Depth 8), $utf8)
}

function Invoke-PrismaStep([string]$label, [string[]]$cliArguments) {
    # Native CLI output is kept private, because an error could contain a URL.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $captured = (& $nodeExecutable $prismaCli @cliArguments 2>&1 | Out-String)
        $stepExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($stepExit -ne 0) {
        $safeCode = [regex]::Match($captured, '\bP[0-9]{4}\b').Value
        if (-not $safeCode) { $safeCode = 'PRISMA_STEP_FAILED' }
        $captured = $null
        $report.status = 'failed'
        $report.step = $label
        $report.code = $safeCode
        Save-Report
        throw 'Prisma step failed. See the safe status below; no reset was performed.'
    }
    $captured = $null
    Write-Host ($label + ': OK') -ForegroundColor Green
}

try {
    Set-Location -LiteralPath $serverDirectory
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath $prismaCli)) { throw 'Install server dependencies first: npm.cmd ci --prefix server' }
    $tracked = & git -C $repoDirectory ls-files -- server/.env server/.env.setup.tmp server/.postgres-setup-result.json
    if ($LASTEXITCODE -ne 0 -or $tracked) { throw 'Private files must not be tracked by Git.' }
    foreach ($privatePath in @('server/.env', 'server/.env.setup.tmp', 'server/.postgres-setup-result.json')) {
        & git -C $repoDirectory check-ignore --quiet -- $privatePath
        if ($LASTEXITCODE -ne 0) { throw 'Git ignore protection is missing for a private file.' }
    }
    Save-Report
    Write-Host 'FOOD / Tezkor Partner PostgreSQL setup' -ForegroundColor Cyan
    Write-Host 'Target: postgres @ 127.0.0.1:5432 / tezkor_demo'
    Write-Host 'Password is entered locally, hidden, and never printed or sent to chat/GitHub.'
    Write-Host 'Only existing migrations are deployed. Existing data is not reset. Seed is not run.'
    $secret = Read-Host 'PostgreSQL postgres parolini kiriting (yashirin)' -AsSecureString
    if ($secret.Length -eq 0) { throw 'Password cannot be empty.' }
    $secretPointer = [IntPtr]::Zero
    try {
        $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
        $encodedPassword = [Uri]::EscapeDataString($plainPassword)
        $env:DATABASE_URL = 'postgresql://postgres:' + $encodedPassword + '@127.0.0.1:5432/tezkor_demo?schema=public&connect_timeout=10'
    } finally {
        if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
        $plainPassword = $null
        $encodedPassword = $null
        if ($secret) { $secret.Dispose() }
    }
    $report.status = 'checking_connection'
    Save-Report
    Invoke-PrismaStep 'Prisma schema validation' @('validate', '--schema', $schemaFile)
    Invoke-PrismaStep 'Prisma Client generation' @('generate', '--schema', $schemaFile)
    $preflightText = & $nodeExecutable $checkScript --preflight
    $preflightExit = $LASTEXITCODE
    $preflight = $preflightText | ConvertFrom-Json
    if ($preflightExit -ne 0 -or -not $preflight.ok) {
        $report.code = $preflight.code
        throw 'Database connection failed. Check the password, database and PostgreSQL service. No migration was run.'
    }
    $report.serverVersion = $preflight.version
    Write-Host ('Connection: OK. PostgreSQL ' + $preflight.version) -ForegroundColor Green

    # Keep all unrelated .env settings. Duplicate DATABASE_URL entries are refused.
    $sourceEnv = if (Test-Path -LiteralPath $envFile) { $envFile } else { Join-Path $serverDirectory '.env.example' }
    $envText = [IO.File]::ReadAllText($sourceEnv, [Text.Encoding]::UTF8)
    $matches = [regex]::Matches($envText, '(?m)^\s*(?:export\s+)?DATABASE_URL\s*=.*$')
    if ($matches.Count -gt 1) { throw 'Duplicate DATABASE_URL entries: fix them locally before continuing.' }
    $urlLine = 'DATABASE_URL=' + $env:DATABASE_URL
    if ($matches.Count -eq 1) {
        $envText = $envText.Remove($matches[0].Index, $matches[0].Length).Insert($matches[0].Index, $urlLine)
    } else { $envText = $envText.TrimEnd() + [Environment]::NewLine + $urlLine + [Environment]::NewLine }
    $temporaryEnv = Join-Path $serverDirectory '.env.setup.tmp'
    [IO.File]::WriteAllText($temporaryEnv, $envText, $utf8)
    Move-Item -LiteralPath $temporaryEnv -Destination $envFile -Force
    $envText = $null
    $urlLine = $null
    Write-Host 'server/.env saved. The password/URL is not displayed.'
    Invoke-PrismaStep 'Existing migrations deploy' @('migrate', 'deploy', '--schema', $schemaFile)
    Invoke-PrismaStep 'Migration status' @('migrate', 'status', '--schema', $schemaFile)
    $verificationText = & $nodeExecutable $checkScript
    $verificationExit = $LASTEXITCODE
    $verification = $verificationText | ConvertFrom-Json
    if ($verificationExit -ne 0 -or -not $verification.ok) { throw 'Final database/schema verification failed.' }
    $report.status = 'success'
    $report.migrationsApplied = $true
    $report.verification = $verification
    Save-Report
    Write-Host 'SUCCESS: connection, existing migrations, model tables and active-courier index verified.' -ForegroundColor Green
    Write-Host 'No seed, reset, data deletion, or GitHub push was performed.'
} catch {
    # Do not print raw exception details: they may contain credentials.
    $report.status = 'failed'
    if (-not $report.Contains('code')) { $report.code = 'SETUP_FAILED' }
    try { Save-Report } catch { }
    Write-Host ('Setup stopped. Safe error code: ' + $report.code) -ForegroundColor Red
    if ($report.Contains('step')) { Write-Host ('Step: ' + $report.step) }
    Write-Host 'No reset or seed was performed. Fix the connection/configuration and run this script again.'
    if ($report.code -eq 'P3005') { Write-Host 'The database has existing tables without migration history. Stop and review a non-destructive baseline; do not reset.' }
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('DATABASE_URL', $previousDatabaseUrl, 'Process')
}
