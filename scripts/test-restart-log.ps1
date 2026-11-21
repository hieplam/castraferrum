<#
.SYNOPSIS
  Stress test of the restart log: a writer and a reader open the same file at the same time.

.DESCRIPTION
  Takes the function Write-Log of restart-console.ps1 and the function Read-Log of test-restart-console.ps1 from
  their files (the PowerShell parser, so the test runs the shipped code), then:
    - a writer process calls Write-Log -Lines times as fast as it can;
    - this process calls Read-Log in a loop until the writer exits (at least -Reads times).
  Checks: the reader never throws, the writer never reports a lost line, and the log holds every line, in order.
  Prints one PASS/FAIL line per check and 'PASS k/3'; exit 1 when any check FAILs. Needs no console and no database.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\test-restart-log.ps1
#>
param(
    [int]$Lines = 500,
    [int]$Reads = 100
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

function Get-FunctionText([string]$File, [string]$Name) {
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($File, [ref]$tokens, [ref]$errors)
    $fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name }, $true)
    if ($null -eq $fn) { throw "no function $Name in $File" }
    return $fn.Extent.Text
}

$writeLog = Get-FunctionText (Join-Path $here 'restart-console.ps1') 'Write-Log'
$readLog = Get-FunctionText (Join-Path $here 'test-restart-console.ps1') 'Read-Log'

$dir = Join-Path ([System.IO.Path]::GetTempPath()) ('lc-restart-log-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir 'restart.log'
$out = Join-Path $dir 'writer.out'
$writer = Join-Path $dir 'writer.ps1'
$body = "`$ErrorActionPreference = 'Stop'`n`$LogFile = '$($log.Replace("'", "''"))'`n$writeLog`n" +
    "for (`$i = 1; `$i -le $Lines; `$i++) { Write-Log ('line {0}' -f `$i) }`n"
[System.IO.File]::WriteAllText($writer, $body)

Invoke-Expression $readLog

$p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $writer) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out
$null = $p.Handle
$readErrors = New-Object System.Collections.Generic.List[string]
$reads = 0
while (-not $p.HasExited -or $reads -lt $Reads) {
    try { $null = Read-Log $log } catch { $readErrors.Add($_.Exception.Message) }
    $reads++
}
$p.WaitForExit()

$results = New-Object System.Collections.Generic.List[string]
function Add-Result([bool]$Ok, [string]$Text, [string[]]$Why) {
    $line = ('FAIL ' + $Text)
    if ($Ok) { $line = ('PASS ' + $Text) } else { foreach ($w in $Why) { $line += "`n    - $w" } }
    $results.Add($line)
    Write-Host $line
}

$why = @()
if ($readErrors.Count -gt 0) { $why += ('{0} of {1} reads threw, first: {2}' -f $readErrors.Count, $reads, $readErrors[0]) }
Add-Result ($why.Count -eq 0) "the reader never throws ($reads reads while the writer appends)" $why

$screen = @()
if (Test-Path $out) { $screen = @(Get-Content $out) }
$lost = @($screen | Where-Object { $_ -match 'cannot write log|lost a log line' })
$why = @()
if ($lost.Count -gt 0) { $why += ('{0} line(s) on the screen say a line was lost, first: {1}' -f $lost.Count, $lost[0]) }
Add-Result ($why.Count -eq 0) 'the writer never reports a lost line' $why

$got = @()
if (Test-Path $log) { $got = @([System.IO.File]::ReadAllLines($log) | ForEach-Object { if ($_ -match 'line (\d+)$') { [int]$Matches[1] } }) }
$why = @()
if ($got.Count -ne $Lines) { $why += ('the log holds {0} of {1} lines' -f $got.Count, $Lines) }
else { for ($i = 0; $i -lt $Lines; $i++) { if ($got[$i] -ne $i + 1) { $why += "line $($i + 1) is out of order"; break } } }
Add-Result ($why.Count -eq 0) "the log holds every line that the writer printed ($Lines), in order" $why

Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
$pass = @($results | Where-Object { $_.StartsWith('PASS') }).Count
Write-Host ("PASS {0}/{1}" -f $pass, $results.Count)
if ($pass -ne $results.Count) { exit 1 }
exit 0
