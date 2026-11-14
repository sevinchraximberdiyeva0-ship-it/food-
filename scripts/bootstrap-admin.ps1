# Run only after the project owner has approved creating the real first admin.
# Credentials remain in this local process/child stdin; no .env or log writes.
param([switch]$VerifyOnly, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$serverDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'server'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$cliPath = Join-Path $serverDirectory 'node_modules\tsx\dist\cli.mjs'
$entryPath = Join-Path $serverDirectory 'src\createAdmin.ts'
$secret = $null
$confirmationSecret = $null
$created = $false
$resultFile = Join-Path $serverDirectory '.admin-bootstrap-result.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$report = [ordered]@{ status = 'starting'; created = $false; verified = $false; checkedAt = [DateTime]::UtcNow.ToString('o') }

function Save-SafeResult {
    $report.checkedAt = [DateTime]::UtcNow.ToString('o')
    [IO.File]::WriteAllText($resultFile, ($report | ConvertTo-Json -Depth 6), $utf8)
}

function Invoke-PrivateBootstrap([string]$mode, [string]$payload, [string]$scriptPath = $entryPath) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $nodeExecutable
    $start.Arguments = '"' + $cliPath + '" "' + $scriptPath + '" ' + $mode
    $start.WorkingDirectory = $serverDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    [void]$process.Start()
    try {
        if ($payload) { $process.StandardInput.Write($payload) }
        $process.StandardInput.Close()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        # Do not display raw stderr, even on a dependency/configuration error.
        $safe = $stdoutTask.Result.Trim() | ConvertFrom-Json
        if ($process.ExitCode -ne 0 -or -not $safe.ok) {
            $safeCode = if ($safe.code -match '^[A-Z_]+$') { $safe.code } else { 'BOOTSTRAP_FAILED' }
            throw $safeCode
        }
        return $safe
    } finally { $process.Dispose() }
}

try {
    $privatePath = 'server/.admin-bootstrap-result.json'
    $repoDirectory = Split-Path -Parent $serverDirectory
    $trackedResult = & git -C $repoDirectory ls-files -- $privatePath
    if ($LASTEXITCODE -ne 0 -or $trackedResult) { throw 'PRIVATE_RESULT_NOT_PROTECTED' }
    & git -C $repoDirectory check-ignore --quiet -- $privatePath
    if ($LASTEXITCODE -ne 0) { throw 'PRIVATE_RESULT_NOT_PROTECTED' }
    Save-SafeResult
    $status = Invoke-PrivateBootstrap '--check' ''
    if ($CheckOnly) {
        $report.status = 'preflight_ok'
        $report.bootstrapAvailable = $status.available
        Save-SafeResult
        Write-Host 'Private terminal preflight: OK. No account created.' -ForegroundColor Green
        exit 0
    }
    if (-not $VerifyOnly -and -not $status.available) { throw 'BOOTSTRAP_CLOSED' }
    if ($VerifyOnly -and (-not $status.completed -or -not $status.adminExists)) { throw 'NO_BOOTSTRAPPED_ADMIN' }
    Write-Host 'FOOD: first SUPER ADMIN (database role ADMIN)' -ForegroundColor Cyan
    Write-Host 'Creates ONE real platform account and permanently closes bootstrap.'
    Write-Host 'No seed/reset, restaurant, order or GitHub push will be performed.'
    if (-not $VerifyOnly) {
        $approval = Read-Host 'Only with owner approval: type CREATE FIRST ADMIN to continue'
        if ($approval -cne 'CREATE FIRST ADMIN') { $report.status = 'cancelled'; Save-SafeResult; Write-Host 'Cancelled. No account created.'; exit 0 }
    } else { Write-Host 'Verification only: no new account is created.' }
    $report.status = 'awaiting_local_credentials'; Save-SafeResult
    $email = Read-Host 'Administrator email (local terminal only)'
    $displayName = Read-Host 'Administrator display name'
    $secret = Read-Host 'Administrator password (12-200 characters, hidden)' -AsSecureString
    $confirmationSecret = Read-Host 'Repeat password (hidden)' -AsSecureString
    $secretPointer = [IntPtr]::Zero
    $confirmationPointer = [IntPtr]::Zero
    try {
        $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmationSecret)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
        $confirmationPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
        if ($plainPassword -cne $confirmationPassword) { throw 'PASSWORDS_DO_NOT_MATCH' }
        $payload = @{ email = $email; name = $displayName; password = $plainPassword } | ConvertTo-Json -Compress
        if (-not $VerifyOnly) {
            $result = Invoke-PrivateBootstrap '--apply' $payload
            $created = $true
            $report.created = $true
            $report.status = 'account_created_verifying'; Save-SafeResult
            Write-Host 'SUCCESS. First SUPER ADMIN created; bootstrap is now closed.' -ForegroundColor Green
        }
        Write-Host 'Checking real browser login, SUPER ADMIN panel and logout. No credentials or browser traces are saved.'
        $verification = Invoke-PrivateBootstrap '--verify' $payload (Join-Path $serverDirectory 'scripts\verify-admin-login.mjs')
        $finalStatus = Invoke-PrivateBootstrap '--check' ''
        if ($finalStatus.available -or -not $finalStatus.adminExists -or -not $finalStatus.completed) { throw 'BOOTSTRAP_FINAL_CHECK_FAILED' }
        $report.status = 'success'
        $report.verified = $true
        $report.bootstrapClosed = $true
        $report.verification = $verification
        Save-SafeResult
        Write-Host 'VERIFIED: login, SUPER ADMIN panel, logout and closed bootstrap.' -ForegroundColor Green
        Write-Host 'You can sign in at http://127.0.0.1:5173/ with your local credentials.'
    } finally {
        if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
        if ($confirmationPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
        $plainPassword = $null
        $confirmationPassword = $null
        $payload = $null
    }
} catch {
    $code = $_.Exception.Message
    if ($code -notmatch '^[A-Z_]+$') { $code = 'BOOTSTRAP_FAILED' }
    $report.status = if ($created) { 'created_verification_failed' } else { 'failed' }
    $report.code = $code
    try { Save-SafeResult } catch { }
    Write-Host ('Stopped. Safe code: ' + $code) -ForegroundColor Red
    if ($created) { Write-Host 'The account IS created; bootstrap is closed. Do not create it again. Retry verification using -VerifyOnly.' }
    Write-Host 'No existing account was overwritten. No credentials were printed.'
    exit 1
} finally {
    if ($secret) { $secret.Dispose() }
    if ($confirmationSecret) { $confirmationSecret.Dispose() }
}
