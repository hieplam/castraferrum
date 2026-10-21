<#
.SYNOPSIS
  Test harness for restart-console.ps1 (two restarts called at the same time.

.DESCRIPTION
  Opens a TEST console on -Port (default 7093, never 7070) with DB loops_restart_test and the mock executor, creates one
  mock loop L (30 s per run, yearly cron), then runs three scenarios. Each scenario starts while L has a run in progress:
    1. first call -WaitForIdle; the later call comes 10 s after          -> later call merges (exit 0, no step 5-6)
    2. later call comes when the first one logs 'step 5: npm run build'  -> later call queues, full restart, new PID
    3. later call comes when the first one logs 'step 7: health ok'      -> later call queues, full restart
  then counts the 'Loop Console <port>' windows (must be exactly 1).
  Prints one PASS/FAIL line per check and 'PASS k/4'; exit 1 when any check FAILs.
  At the end it closes every window / process of the test console and drops the test DB (unless -Keep).

  Every call of restart-console.ps1 here carries -Port and -ConsoleDir: without -Port it would kill the real console.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File loop-console\scripts\test-restart-console.ps1
#>
param(
    [int]$Port = 7093,
    [string]$ConsoleDir = '',
    [string]$Db = 'loops_restart_test',
    [switch]$Keep
)

$ErrorActionPreference = 'Stop'
if ($Port -eq 7070) { Write-Host 'refusing to test on 7070 (the real console)'; exit 2 }
if (-not $Db.EndsWith('_test')) { Write-Host "DB must be named *_test, got $Db"; exit 2 }
if (-not $ConsoleDir) { $ConsoleDir = Split-Path $PSScriptRoot -Parent }
$ConsoleDir = (Resolve-Path $ConsoleDir).Path
$Script = Join-Path $ConsoleDir 'scripts\restart-console.ps1'
$Work = Join-Path $ConsoleDir 'reports\test-restart'
$Base = "http://127.0.0.1:$Port"
$Title = "WindowTitle='Loop Console $Port'"

# the console windows opened by restart-console.ps1 inherit these three
$env:LOOPS_PORT = "$Port"
$env:DATABASE_URL = "postgres://loops:loops@127.0.0.1:55432/$Db"
$env:LOOPS_MOCK_EXECUTOR = '1'

function Say([string]$m) { Write-Host ('{0} harness: {1}' -f (Get-Date -Format 'HH:mm:ss'), $m) }

function Get-ListenerPid {
    try {
        $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($c) { return [int]$c.OwningProcess }
    } catch { }
    return $null
}

function Get-ConsoleWindows {
    return @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -and $_.CommandLine.Contains($Title) })
}

function Stop-TestConsole {
    foreach ($w in (Get-ConsoleWindows)) { & taskkill /T /F /PID $w.ProcessId 2>&1 | Out-Null }
    $p = Get-ListenerPid
    if ($null -ne $p) { & taskkill /T /F /PID $p 2>&1 | Out-Null }
    $n = 0
    while (($null -ne (Get-ListenerPid)) -and ($n -lt 15)) { Start-Sleep -Seconds 1; $n++ }
}

function Invoke-Api([string]$Method, [string]$Path, $Body = $null) {
    $json = '{}'
    if ($null -ne $Body) { $json = ($Body | ConvertTo-Json -Depth 5 -Compress) }
    if ($Method -eq 'GET') { return Invoke-RestMethod -Uri "$Base/api$Path" -Method Get -TimeoutSec 10 }
    return Invoke-RestMethod -Uri "$Base/api$Path" -Method $Method -ContentType 'application/json' -Body $json -TimeoutSec 30
}

function Get-Loop([string]$Id) {
    try { return Invoke-Api 'GET' "/loops/$Id" } catch { return $null }
}

function Test-Health {
    try { return ((Invoke-Api 'GET' '/health').ok -eq $true) } catch { return $false }
}

# L must be active with a run in progress at the start of each scenario
function Wait-Running([string]$Id) {
    $deadline = (Get-Date).AddSeconds(120)
    $kicked = $false
    while ((Get-Date) -lt $deadline) {
        $l = Get-Loop $Id
        if ($null -ne $l -and $l.status -eq 'active' -and $null -ne $l.activeRun) { return $true }
        if ($null -ne $l -and -not $kicked) {
            Say "loop is $($l.status), activeRun = $($l.activeRun) -> stop/start to get a run"
            if ($l.status -eq 'active') { try { Invoke-Api 'POST' "/loops/$Id/stop" | Out-Null } catch { } }
            try { Invoke-Api 'POST' "/loops/$Id/start" | Out-Null } catch { }
            $kicked = $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-Restart([string]$Log) {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Script, '-Port', "$Port", '-ConsoleDir', $ConsoleDir, '-WaitForIdle', '-LogFile', $Log)
    $p = Start-Process powershell -ArgumentList $a -WindowStyle Hidden -PassThru
    $null = $p.Handle # keep the handle so ExitCode is readable after exit
    return $p
}

# The later call, started ahead of time and held on a named event until the trigger: PowerShell takes ~1 s to start,
# longer than the first call needs from 'step 7: health ok' to 'step 9', so a call started at the trigger comes too late.
function New-Gate([string]$Name) { return New-Object System.Threading.EventWaitHandle($false, 'ManualReset', $Name) }
function Start-GatedRestart([string]$Log, [string]$GateName) {
    $cmd = "`$g = [System.Threading.EventWaitHandle]::OpenExisting('$GateName'); [void]`$g.WaitOne(3600000); " +
        "& '$Script' -Port $Port -ConsoleDir '$ConsoleDir' -WaitForIdle -LogFile '$Log'; exit `$LASTEXITCODE"
    $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) -WindowStyle Hidden -PassThru
    $null = $p.Handle
    return $p
}

function Wait-Exit($Proc, [int]$Minutes) {
    if (-not $Proc.WaitForExit($Minutes * 60 * 1000)) { try { $Proc.Kill() } catch { }; return 'timeout' }
    return $Proc.ExitCode
}

function Read-Log([string]$Log) {
    if (Test-Path $Log) { return @(Get-Content $Log) }
    return @()
}

function Wait-LogLine([string]$Log, [string]$Pattern, [int]$Minutes) {
    $deadline = (Get-Date).AddMinutes($Minutes)
    while ((Get-Date) -lt $deadline) {
        if (@(Read-Log $Log | Where-Object { $_ -match $Pattern }).Count -gt 0) { return $true }
        Start-Sleep -Milliseconds 100
    }
    return $false
}

function Get-LineTime([string[]]$Lines, [string]$Pattern) {
    $l = @($Lines | Where-Object { $_ -match $Pattern }) | Select-Object -First 1
    if ($null -eq $l) { return $null }
    return [datetime]::ParseExact($l.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null)
}

function Get-DonePid([string[]]$Lines) {
    $l = @($Lines | Where-Object { $_ -match 'step 9: done\. PID \S+ -> (\d+)' }) | Select-Object -Last 1
    if ($null -ne $l -and $l -match 'step 9: done\. PID \S+ -> (\d+)') { return [int]$Matches[1] }
    return $null
}

function Show-Logs([string]$A, [string]$B) {
    Say "--- log of the first call ($A)"; Read-Log $A | ForEach-Object { Write-Host "  A | $_" }
    Say "--- log of the later call ($B)"; Read-Log $B | ForEach-Object { Write-Host "  B | $_" }
}

$results = New-Object System.Collections.Generic.List[string]
function Add-Result([bool]$Ok, [string]$Text, [string[]]$Why) {
    $line = ('FAIL ' + $Text)
    if ($Ok) { $line = ('PASS ' + $Text) } else { foreach ($w in $Why) { $line += "`n    - $w" } }
    $results.Add($line)
    Write-Host $line
}

# ---------------------------------------------------------------------------- setup
if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Say "console dir $ConsoleDir, port $Port, DB $Db, logs in $Work"
Stop-TestConsole
$out = & docker exec loop_console_pg psql -U loops -d loops -tAc "SELECT 1 FROM pg_database WHERE datname = '$Db'" 2>&1
if ("$out".Trim() -ne '1') {
    & docker exec loop_console_pg psql -U loops -d loops -c "CREATE DATABASE $Db" 2>&1 | Out-Null
    Say "created DB $Db"
}

Say 'bootstrap: restart-console.ps1 opens the test console (npm install + build)'
$boot = Join-Path $Work 'boot.log'
$bp = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Script, '-Port', "$Port", '-ConsoleDir', $ConsoleDir, '-LogFile', $boot) -WindowStyle Hidden -PassThru
$null = $bp.Handle
$bc = Wait-Exit $bp 15
if ($bc -ne 0 -or -not (Test-Health)) {
    Read-Log $boot | ForEach-Object { Write-Host "  boot | $_" }
    Say "bootstrap failed (exit $bc) -> exit 1"; Stop-TestConsole; exit 1
}

$repoDir = Join-Path $env:TEMP ('lc-restart-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $repoDir | Out-Null
$repo = Invoke-Api 'POST' '/repos' @{ path = $repoDir; name = ('restart test ' + (Split-Path $repoDir -Leaf)) }
$loop = Invoke-Api 'POST' '/loops' @{ repoId = $repo.id; name = 'restart test L'; prompt = 'restart test'; cron = '0 0 1 1 *'; executor = @{ kind = 'mock'; config = @{ durationSec = 30 } } }
$L = $loop.id
Invoke-Api 'POST' "/loops/$L/start" | Out-Null
Say "loop L = $L started"

# ---------------------------------------------------------------------------- scenario 1: merge
$a1 = Join-Path $Work 's1-first.log'; $b1 = Join-Path $Work 's1-later.log'
if (-not (Wait-Running $L)) { Say 'scenario 1: L has no run in progress' }
Say 'scenario 1: first call, later call 10 s after'
$pa = Start-Restart $a1
Start-Sleep -Seconds 10
$pb = Start-Restart $b1
$ca = Wait-Exit $pa 15; $cb = Wait-Exit $pb 15
$lb = Read-Log $b1
$why = @()
if ($ca -ne 0) { $why += "first call exit $ca" }
if ($cb -ne 0) { $why += "later call exit $cb" }
if (@($lb | Where-Object { $_ -match 'lock: merged' }).Count -eq 0) { $why += 'later call has no "lock: merged" line' }
$par = @($lb | Where-Object { $_ -match 'step [56]:' })
if ($par.Count -gt 0) { $why += ('later call ran step 5-6: ' + ($par[0] -replace '^\S+ \S+ ', '')) }
$st = Get-Loop $L
if ($null -eq $st -or $st.status -ne 'active') { $why += 'L is not active at the end' }
if (-not (Test-Health)) { $why += '/api/health not ok' }
Add-Result ($why.Count -eq 0) 'scenario 1: the later call merges (exit 0), skips steps 5-6, loop active at the end' $why
if ($why.Count -gt 0) { Show-Logs $a1 $b1 }

# ---------------------------------------------------------------------------- scenario 2: queue after build started
$a2 = Join-Path $Work 's2-first.log'; $b2 = Join-Path $Work 's2-later.log'
if (-not (Wait-Running $L)) { Say 'scenario 2: L has no run in progress' }
Say 'scenario 2: later call when the first one logs step 5: npm run build'
$gateName = 'Local\LcRestartTestGate-' + [guid]::NewGuid().ToString('N')
$gate = New-Gate $gateName
$pb = Start-GatedRestart $b2 $gateName
$pa = Start-Restart $a2
$seen = Wait-LogLine $a2 'step 5: npm run build' 10
[void]$gate.Set()
$ca = Wait-Exit $pa 20; $cb = Wait-Exit $pb 20
$la = Read-Log $a2; $lb = Read-Log $b2
$why = @()
if (-not $seen) { $why += 'first call never logged "step 5: npm run build"' }
if ($ca -ne 0) { $why += "first call exit $ca" }
if ($cb -ne 0) { $why += "later call exit $cb" }
if (@($lb | Where-Object { $_ -match 'lock: .*waiting for the lock' }).Count -eq 0) { $why += 'later call has no "lock: ... waiting for the lock" (queued) line' }
$aDone = Get-LineTime $la 'step 9: done'
$bInstall = Get-LineTime $lb 'step 5: npm install'
if ($null -eq $bInstall) { $why += 'later call did not run step 5 (no full restart)' }
elseif ($null -ne $aDone -and $bInstall -lt $aDone) { $why += "later call step 5 ($bInstall) ran before the first call finished ($aDone): parallel build" }
$pidA = Get-DonePid $la; $pidB = Get-DonePid $lb; $pidNow = Get-ListenerPid
if ($null -eq $pidA -or $null -eq $pidNow -or $pidNow -eq $pidA) { $why += "PID listening on $Port did not change (after first call $pidA, now $pidNow)" }
if ($null -ne $pidB -and $pidNow -ne $pidB) { $why += "PID listening now ($pidNow) is not the one the later call opened ($pidB)" }
$st = Get-Loop $L
if ($null -eq $st -or $st.status -ne 'active') { $why += 'L is not active at the end' }
Add-Result ($why.Count -eq 0) "scenario 2: the later call queues, does a full restart, the PID listening on port $Port changes, loop active" $why
if ($why.Count -gt 0) { Show-Logs $a2 $b2 }

# ---------------------------------------------------------------------------- scenario 3: queue after health ok
$a3 = Join-Path $Work 's3-first.log'; $b3 = Join-Path $Work 's3-later.log'
if (-not (Wait-Running $L)) { Say 'scenario 3: L has no run in progress' }
Say 'scenario 3: later call when the first one logs step 7: health ok'
$gateName = 'Local\LcRestartTestGate-' + [guid]::NewGuid().ToString('N')
$gate = New-Gate $gateName
$pb = Start-GatedRestart $b3 $gateName
$pa = Start-Restart $a3
$seen = Wait-LogLine $a3 'step 7: health ok' 15
[void]$gate.Set()
$ca = Wait-Exit $pa 20; $cb = Wait-Exit $pb 20
$la = Read-Log $a3; $lb = Read-Log $b3
$why = @()
if (-not $seen) { $why += 'first call never logged "step 7: health ok"' }
if ($ca -ne 0) { $why += "first call exit $ca" }
if ($cb -ne 0) { $why += "later call exit $cb" }
if (@($lb | Where-Object { $_ -match 'lock: .*waiting for the lock' }).Count -eq 0) { $why += 'later call has no "lock: ... waiting for the lock" (queued) line' }
if (@($lb | Where-Object { $_ -match 'step 9: done' }).Count -eq 0) { $why += 'later call did not finish a full restart' }
$aDone = Get-LineTime $la 'step 9: done'
$bInstall = Get-LineTime $lb 'step 5: npm install'
if ($null -ne $aDone -and $null -ne $bInstall -and $bInstall -lt $aDone) { $why += 'later call step 5 ran before the first call finished' }
$st = Get-Loop $L
if ($null -eq $st -or $st.status -ne 'active') { $why += 'L is not active at the end' }
Add-Result ($why.Count -eq 0) 'scenario 3: the later call queues, does a full restart, loop active at the end' $why
if ($why.Count -gt 0) { Show-Logs $a3 $b3 }

# ---------------------------------------------------------------------------- windows
$wins = @(Get-ConsoleWindows)
$why = @()
if ($wins.Count -ne 1) { $why += ("{0} windows: PID {1}" -f $wins.Count, (($wins | ForEach-Object { $_.ProcessId }) -join ', ')) }
Add-Result ($wins.Count -eq 1) "windows: exactly 1 'Loop Console $Port' window is left after 3 scenarios" $why

# ---------------------------------------------------------------------------- summary + cleanup
$pass = @($results | Where-Object { $_.StartsWith('PASS') }).Count
Write-Host ''
foreach ($r in $results) { Write-Host (($r -split "`n")[0]) }
Write-Host ("PASS {0}/{1}" -f $pass, $results.Count)

if ($Keep) {
    Say "-Keep: test console left running on $Port"
} else {
    Stop-TestConsole
    & docker exec loop_console_pg psql -U loops -d loops -c "DROP DATABASE IF EXISTS $Db WITH (FORCE)" 2>&1 | Out-Null
    Remove-Item -Recurse -Force $repoDir -ErrorAction SilentlyContinue
    Say "closed the test console on $Port, dropped DB $Db"
}
if ($pass -ne $results.Count) { exit 1 }
exit 0
