<#
.SYNOPSIS
  Restart the Castraferrum server (port 7070) after merging new code, then Start the loops again.

.DESCRIPTION
  Restarting the console sets every loop to 'stopped' (D9: no auto-resume), so this script:
    1. reads GET /api/loops and remembers the loops that are 'active' (unless -StartLoop is given)
    2. -WaitForIdle: waits until no loop has an activeRun (poll every 5 s, at most -WaitMaxMinutes)
    3. POST /api/loops/<id>/stop for every active loop (closes the execution cleanly)
    4. kills the process listening on -Port
    5. npm install + npm run build in -ConsoleDir (skip with -NoBuild)
    6. opens a new, independent PowerShell window running 'npm start' (left open, like the manual way)
    7. waits for GET /api/health -> ok:true (at most 90 s)
    8. POST /api/loops/<id>/start for every loop to restart
    9. prints a summary (old PID -> new PID, loops started)
  Every step is logged with a timestamp to the screen and to -LogFile.

  Two calls at the same time: a named mutex 'Local\LoopConsoleRestart-<Port>' is taken BEFORE step 1, and
  the holder writes its phase (wait, stop, build, start, done) to reports\restart-console-<Port>.phase. A later call
  that cannot take the mutex:
    - MERGES (logs 'lock: merged into ...', exit 0) when the holder will build (no -NoBuild), has not reached 'build' yet
      and the later call has no -StartLoop: it adds its active loops to the phase file, the holder Starts them at step 8.
      The coming build already holds the merged code, so nothing is lost.
    - QUEUES (logs 'lock: ... waiting for the lock ...') otherwise: waits for the mutex (at most -WaitMaxMinutes), then runs all
      nine steps itself, so code merged after the holder's build is not lost.
  Step 4 also closes the old 'Castraferrum <Port>' windows left at their prompt (no child process besides conhost).
  A window whose console died stays open, to read the error, until the next restart.

  Called by an agent running INSIDE a loop at the end of its turn (detached, from Bash):
    powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<console folder>\scripts\restart-console.ps1','-WaitForIdle'"
  then end the turn right away: the script waits for the turn to finish before restarting.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restart-console.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restart-console.ps1 -NoBuild -StartLoop 23eb13f6-9a60-4184-b765-9f88fc2aadaf
#>
param(
    [int]$Port = 7070,
    [string]$ConsoleDir = '',
    [string[]]$StartLoop = $null,
    [switch]$WaitForIdle,
    [int]$WaitMaxMinutes = 360,
    [switch]$NoBuild,
    [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'

if (-not $ConsoleDir) { $ConsoleDir = Split-Path $PSScriptRoot -Parent }
$ConsoleDir = (Resolve-Path $ConsoleDir).Path
if (-not $LogFile) { $LogFile = Join-Path $ConsoleDir 'reports\restart-console.log' }
# Leave the caller's directory right away: this process (and the console window it opens) must not hold a lock on
# the folder it was started from -- an agent calls this from its worktree, which it then removes.
Set-Location $ConsoleDir
$logDir = Split-Path $LogFile -Parent
if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$Base = "http://127.0.0.1:$Port"

function Write-Log([string]$Message) {
    $line = '{0} [pid {1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID, $Message
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { Write-Host "(cannot write log: $($_.Exception.Message))" }
}

function Get-HttpError($err) {
    $msg = $err.Exception.Message
    if ($err.ErrorDetails -and $err.ErrorDetails.Message) { $msg = $msg + ' ' + $err.ErrorDetails.Message }
    return $msg
}

# GET /api/loops -> items, or $null when the server does not answer
function Get-Loops {
    try {
        $r = Invoke-RestMethod -Uri "$Base/api/loops" -Method Get -TimeoutSec 10
        return , @($r.items)
    } catch {
        Write-Log ("GET /api/loops failed: " + (Get-HttpError $_))
        return $null
    }
}

function Get-ListenerPid {
    try {
        $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($c) { return [int]$c.OwningProcess }
    } catch { }
    return $null
}

function Invoke-LoopAction([string]$Id, [string]$Action) {
    try {
        # PowerShell 5.1 sends a form content type when there is no body -> server answers 415; send JSON '{}'
        $r = Invoke-RestMethod -Uri "$Base/api/loops/$Id/$Action" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 30
        Write-Log ("POST /api/loops/{0}/{1} -> 200, status = {2}" -f $Id, $Action, $r.status)
        return $true
    } catch {
        Write-Log ("POST /api/loops/{0}/{1} failed: {2}" -f $Id, $Action, (Get-HttpError $_))
        return $false
    }
}

# ---- lock + phase file
$reportsDir = Join-Path $ConsoleDir 'reports'
if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null }
$PhaseFile = Join-Path $reportsDir "restart-console-$Port.phase"

# Runs $Body while holding the short mutex that guards the phase file (read-modify-write by two processes).
function Use-PhaseFile([scriptblock]$Body) {
    $m = New-Object System.Threading.Mutex($false, "Local\LoopConsoleRestartPhase-$Port")
    try {
        try { [void]$m.WaitOne(10000) } catch [System.Threading.AbandonedMutexException] { }
        & $Body
    } finally {
        try { $m.ReleaseMutex() } catch { }
        $m.Dispose()
    }
}

function Read-PhaseFile {
    try { if (Test-Path $PhaseFile) { return (Get-Content -Raw -Path $PhaseFile | ConvertFrom-Json) } } catch { }
    return $null
}

function Write-PhaseFile($State) {
    Set-Content -Path $PhaseFile -Value ($State | ConvertTo-Json -Depth 5) -Encoding UTF8
}

# Holder only: record the phase, keep what later calls merged in.
function Set-Phase([string]$Phase) {
    Use-PhaseFile {
        $s = Read-PhaseFile
        $merged = @()
        if ($null -ne $s -and $s.pid -eq $PID -and $null -ne $s.merged) { $merged = @($s.merged) }
        Write-PhaseFile ([pscustomobject]@{ pid = $PID; phase = $Phase; build = [bool](-not $NoBuild); merged = $merged })
    }
}

# Holder only: release the lock and exit.
function Exit-Script([int]$Code) {
    Set-Phase 'done'
    try { $script:lock.ReleaseMutex() } catch { }
    exit $Code
}

Write-Log "=== restart-console: port $Port, console dir $ConsoleDir, WaitForIdle=$WaitForIdle, NoBuild=$NoBuild"

$explicitStart = $PSBoundParameters.ContainsKey('StartLoop')
$lock = New-Object System.Threading.Mutex($false, "Local\LoopConsoleRestart-$Port")
$owned = $false
try { $owned = $lock.WaitOne(0) } catch [System.Threading.AbandonedMutexException] {
    $owned = $true
    Write-Log "lock: the previous holder died without releasing -> lock taken"
}
if (-not $owned) {
    # Another restart of this port is running. Merge into it when its build is still to come, else queue.
    $mine = @()
    $cur = Get-Loops
    if ($null -ne $cur) { $mine = @($cur | Where-Object { $_.status -eq 'active' } | ForEach-Object { $_.id }) }
    $verdict = Use-PhaseFile {
        $s = Read-PhaseFile
        if ($null -eq $s) { return 'queue|?|?|no phase file' }
        $alive = $null -ne (Get-Process -Id ([int]$s.pid) -ErrorAction SilentlyContinue)
        $why = ''
        if (-not $alive -or $s.phase -eq 'done') { $why = 'finished' }
        elseif (-not $s.build) { $why = 'no build (-NoBuild)' }
        elseif ($s.phase -ne 'wait' -and $s.phase -ne 'stop') { $why = 'already built' }
        elseif ($explicitStart) { $why = 'this call has -StartLoop' }
        if ($why) { return ('queue|{0}|{1}|{2}' -f $s.pid, $s.phase, $why) }
        $merged = @()
        if ($null -ne $s.merged) { $merged = @($s.merged) }
        $merged += [pscustomobject]@{ pid = $PID; loops = $mine }
        Write-PhaseFile ([pscustomobject]@{ pid = $s.pid; phase = $s.phase; build = $s.build; merged = $merged })
        return ('merge|{0}|{1}|' -f $s.pid, $s.phase)
    }
    $v = "$verdict".Split('|')
    if ($v[0] -eq 'merge') {
        Write-Log ("lock: merged into restart of pid {0} (at step {1}, not built yet), active loops of this call [{2}] -> exit 0" -f $v[1], $v[2], ($mine -join ', '))
        exit 0
    }
    Write-Log ("lock: restart of pid {0} (step {1}: {2}), waiting for the lock, then a full restart (at most {3} min)" -f $v[1], $v[2], $v[3], $WaitMaxMinutes)
    try { $owned = $lock.WaitOne([TimeSpan]::FromMinutes($WaitMaxMinutes)) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { Write-Log "lock: still no lock after $WaitMaxMinutes min -> exit 1, nothing restarted"; exit 1 }
    Write-Log "lock: got the lock -> full restart from step 1"
}
Set-Phase 'wait'

# 1. remember the active loops
$toStart = New-Object System.Collections.Generic.List[string]
if ($explicitStart) {
    foreach ($id in $StartLoop) { if ($id -and -not $toStart.Contains($id)) { $toStart.Add($id) } }
}
$loops = Get-Loops
if ($null -eq $loops) {
    Write-Log "step 1: server not answering on $Base -> no active loop"
} else {
    $active = @($loops | Where-Object { $_.status -eq 'active' })
    Write-Log ("step 1: {0} loop(s), active: [{1}]" -f $loops.Count, (($active | ForEach-Object { $_.id }) -join ', '))
    if (-not $explicitStart) {
        foreach ($l in $active) { if (-not $toStart.Contains($l.id)) { $toStart.Add($l.id) } }
    }
}
if ($explicitStart) {
    Write-Log ("step 1: loops to start (from -StartLoop): [" + ($toStart -join ', ') + "]")
} else {
    Write-Log ("step 1: loops to start (active now): [" + ($toStart -join ', ') + "]")
}

# 2. wait until no loop has a run in progress
if ($WaitForIdle) {
    $deadline = (Get-Date).AddMinutes($WaitMaxMinutes)
    Write-Log "step 2: waiting until no loop has an activeRun (max $WaitMaxMinutes min, poll 5 s)"
    while ($true) {
        $cur = Get-Loops
        if ($null -eq $cur) { Write-Log "step 2: server not answering -> treated as idle"; break }
        $busy = @($cur | Where-Object { $null -ne $_.activeRun })
        if ($busy.Count -eq 0) { Write-Log "step 2: idle (no activeRun)"; break }
        if ((Get-Date) -gt $deadline) {
            Write-Log ("step 2: still busy after $WaitMaxMinutes min [" + (($busy | ForEach-Object { $_.id }) -join ', ') + "] -> exit 1, nothing restarted")
            Exit-Script 1
        }
        Start-Sleep -Seconds 5
    }
} else {
    Write-Log "step 2: skipped (no -WaitForIdle)"
}

Set-Phase 'stop'

# 3. stop every loop that is active right now (closes the execution cleanly instead of startup recovery)
$now = Get-Loops
$stopped = 0
if ($null -ne $now) {
    foreach ($l in @($now | Where-Object { $_.status -eq 'active' })) {
        # a loop Started while we waited is Started again too, unless -StartLoop was given
        if (-not $explicitStart -and -not $toStart.Contains($l.id)) { $toStart.Add($l.id) }
        if (Invoke-LoopAction $l.id 'stop') { $stopped++ }
    }
}
Write-Log "step 3: stopped $stopped loop(s)"

# 4. kill the process listening on the port
$oldPid = Get-ListenerPid
if ($null -eq $oldPid) {
    Write-Log "step 4: no process is listening on port $Port"
} else {
    $cmdLine = ''
    try { $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid").CommandLine } catch { }
    Write-Log "step 4: killing PID $oldPid ($cmdLine)"
    try {
        Stop-Process -Id $oldPid -Force -ErrorAction Stop
        Wait-Process -Id $oldPid -Timeout 30 -ErrorAction SilentlyContinue
    } catch {
        Write-Log ("step 4: Stop-Process failed: " + $_.Exception.Message)
    }
    $waited = 0
    while (($null -ne (Get-ListenerPid)) -and ($waited -lt 15)) { Start-Sleep -Seconds 1; $waited++ }
    $still = Get-ListenerPid
    if ($null -ne $still) { Write-Log "step 4: port $Port still in use by PID $still -> exit 1"; Exit-Script 1 }
    Write-Log "step 4: port $Port is free"
}
# the old window of this port stays at its prompt once its server is gone (-NoExit, ~90 MB each): close it
$winTitle = "WindowTitle='Castraferrum $Port'"
foreach ($w in @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($winTitle) })) {
    $kids = @()
    for ($i = 0; $i -lt 10; $i++) {
        # npm / cmd exit a moment after the server they ran was killed; conhost belongs to every console window
        $kids = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $w.ProcessId) | Where-Object { $_.Name -ne 'conhost.exe' })
        if ($kids.Count -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    if ($kids.Count -eq 0) {
        try {
            Stop-Process -Id $w.ProcessId -Force -ErrorAction Stop
            Write-Log ("step 4: closed old window PID {0} (no child process left)" -f $w.ProcessId)
        } catch {
            Write-Log ("step 4: cannot close old window PID {0}: {1}" -f $w.ProcessId, $_.Exception.Message)
        }
    } else {
        Write-Log ("step 4: window PID {0} kept, still runs: {1}" -f $w.ProcessId, (($kids | ForEach-Object { '{0} {1}' -f $_.Name, $_.ProcessId }) -join ', '))
    }
}

# 5. npm install + build
Set-Phase 'build'
if ($NoBuild) {
    Write-Log "step 5: skipped (-NoBuild)"
} else {
    Push-Location $ConsoleDir
    try {
        Write-Log "step 5: npm install --no-audit --no-fund"
        $out = & cmd /c "npm install --no-audit --no-fund 2>&1"
        $code = $LASTEXITCODE
        foreach ($o in @($out | Select-Object -Last 5)) { Write-Log "  npm install | $o" }
        if ($code -ne 0) { Write-Log "step 5: npm install exit $code -> exit 1"; Exit-Script 1 }
        Write-Log "step 5: npm run build"
        $out = & cmd /c "npm run build 2>&1"
        $code = $LASTEXITCODE
        foreach ($o in @($out | Select-Object -Last 5)) { Write-Log "  npm run build | $o" }
        if ($code -ne 0) { Write-Log "step 5: npm run build exit $code -> exit 1"; Exit-Script 1 }
    } finally {
        Pop-Location
    }
}

# 6. new independent window running npm start
Set-Phase 'start'
# the server takes its port from LOOPS_PORT (server/config.ts), so -Port must reach it
$env:LOOPS_PORT = "$Port"
# The new console must not inherit the variables of the Claude Code session that called this script
# (CLAUDECODE, CLAUDE_CODE_SESSION_ID, ...): every loop agent would then believe it runs inside a parent
# session that no longer exists. Variables that are also set at User / Machine level are kept.
$dropped = @()
foreach ($v in @(Get-ChildItem Env: | Where-Object { $_.Name -like 'CLAUDE*' })) {
    $u = [Environment]::GetEnvironmentVariable($v.Name, 'User')
    $m = [Environment]::GetEnvironmentVariable($v.Name, 'Machine')
    if ($null -eq $u -and $null -eq $m) {
        Remove-Item -Path ("Env:" + $v.Name) -ErrorAction SilentlyContinue
        $dropped += $v.Name
    }
}
if ($dropped.Count -gt 0) { Write-Log ("step 6: not passed to the new console: " + ($dropped -join ', ')) }
$dirLit = $ConsoleDir.Replace("'", "''")
$command = "`$host.UI.RawUI.WindowTitle='Castraferrum $Port'; Set-Location '$dirLit'; npm start"
$proc = Start-Process powershell -ArgumentList '-NoExit', '-Command', $command -WorkingDirectory $ConsoleDir -PassThru
Write-Log ("step 6: opened window PID {0}: npm start in {1}" -f $proc.Id, $ConsoleDir)

# 7. wait for /api/health
$ok = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    try {
        $h = Invoke-RestMethod -Uri "$Base/api/health" -Method Get -TimeoutSec 5
        if ($h.ok -eq $true) { $ok = $true; Write-Log ("step 7: health ok (db = {0})" -f $h.db); break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ok) { Write-Log "step 7: /api/health not ok after 90 s -> exit 1"; Exit-Script 1 }
$newPid = Get-ListenerPid

# 8. Start the loops again, plus the active loops of the later calls that merged into this one
$mergedIn = @(Use-PhaseFile {
    $s = Read-PhaseFile
    if ($null -ne $s -and $s.pid -eq $PID -and $null -ne $s.merged) { @($s.merged) }
})
foreach ($m in $mergedIn) {
    Write-Log ("step 8: merged call pid {0}, its active loops [{1}]" -f $m.pid, (@($m.loops) -join ', '))
    foreach ($id in @($m.loops)) { if ($id -and -not $toStart.Contains($id)) { $toStart.Add($id) } }
}
$started = @()
foreach ($id in $toStart) {
    if (Invoke-LoopAction $id 'start') { $started += $id }
}
if ($toStart.Count -eq 0) { Write-Log "step 8: no loop to start" }

# 9. summary
$oldText = '(none)'
if ($null -ne $oldPid) { $oldText = "$oldPid" }
Write-Log ("step 9: done. PID {0} -> {1}; loops started {2}/{3} [{4}]" -f $oldText, $newPid, $started.Count, $toStart.Count, ($started -join ', '))
if ($started.Count -ne $toStart.Count) { Exit-Script 1 }
Exit-Script 0
