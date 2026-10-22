param(
    [switch] $Monitor,
    [string] $TraceDirectory
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if ($Monitor) {
    $file = Join-Path $TraceDirectory 'processes.jsonl'
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $bytes = 0
    $limit = 32MB
    function Write-Record($record) {
        $line = ($record | ConvertTo-Json -Compress -Depth 5) + "`n"
        $length = [Text.Encoding]::UTF8.GetByteCount($line)
        if ($script:bytes + $length -gt $script:limit) { return $false }
        [IO.File]::AppendAllText($file, $line)
        $script:bytes += $length
        return $true
    }
    try {
        $null = Write-Record @{
            kind = 'monitor-start'
            timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            cadenceMilliseconds = 1000
            maxSeconds = 1500
            maxBytes = $limit
            handleIdentification = 'unavailable: no handle-owner collector configured; process presence does not identify an EBUSY owner'
        }
        while ($clock.Elapsed.TotalSeconds -lt 1500 -and $bytes -lt $limit) {
            try {
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $all = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, CreationDate, Name, KernelModeTime, UserModeTime -OperationTimeoutSec 3)
                $byId = @{}
                foreach ($process in $all) { $byId[[uint32] $process.ProcessId] = $process }
                $selected = @{}
                foreach ($process in $all) {
                    if ($process.Name -notin @('node.exe', 'esbuild.exe', 'taskkill.exe')) { continue }
                    $current = $process
                    for ($depth = 0; $depth -lt 16 -and $null -ne $current; $depth++) {
                        $id = [uint32] $current.ProcessId
                        if ($selected.ContainsKey($id)) { break }
                        $selected[$id] = $current
                        $parent = $byId[[uint32] $current.ParentProcessId]
                        if ($null -ne $parent -and $parent.CreationDate -gt $current.CreationDate) { break }
                        $current = $parent
                    }
                }
                $rows = @($selected.Values | Sort-Object ProcessId | Select-Object -First 2048 | ForEach-Object {
                    @{
                        pid = [uint32] $_.ProcessId
                        parentPid = [uint32] $_.ParentProcessId
                        creationTime = if ($null -eq $_.CreationDate) { $null } else { $_.CreationDate.ToUniversalTime().ToString('o') }
                        imageName = $_.Name
                        kernelTime100ns = [string] $_.KernelModeTime
                        userTime100ns = [string] $_.UserModeTime
                    }
                })
                if (-not (Write-Record @{
                    kind = 'snapshot'
                    timestamp = $timestamp
                    truncated = $selected.Count -gt 2048
                    processes = $rows
                })) { break }
            } catch {
                if (-not (Write-Record @{ kind = 'snapshot-unavailable'; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() })) { break }
            }
            Start-Sleep -Milliseconds 1000
        }
        $null = Write-Record @{ kind = 'monitor-limit'; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    } catch {
        Write-Warning 'Process diagnostics unavailable; exception details omitted.'
    }
    exit 0
}

$previousTrace = $env:CONFECT_CLI_PROCESS_TRACE
$previousPhaseTrace = $env:CONFECT_CLI_PHASE_TRACE_DIRECTORY
$monitorProcess = $null
$exitCode = 1
try {
    try {
        if (-not $IsWindows) { throw 'Windows diagnostics require Windows.' }
        if (-not $TraceDirectory) { $TraceDirectory = Join-Path $env:RUNNER_TEMP 'confect-cli-diagnostics' }
        $null = New-Item -ItemType Directory -Path $TraceDirectory -Force
        $TraceDirectory = [IO.Path]::GetFullPath($TraceDirectory)
        $env:CONFECT_CLI_PROCESS_TRACE = Join-Path $TraceDirectory 'fixtures.jsonl'
        $env:CONFECT_CLI_PHASE_TRACE_DIRECTORY = $TraceDirectory
        [IO.File]::WriteAllText($env:CONFECT_CLI_PROCESS_TRACE, '')
        [IO.File]::WriteAllText((Join-Path $TraceDirectory 'processes.jsonl'), '')
        $monitorProcess = Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -ArgumentList @(
            '-NoLogo', '-NoProfile', '-NonInteractive', '-File', "`"$PSCommandPath`"", '-Monitor', '-TraceDirectory', "`"$TraceDirectory`""
        ) -PassThru -WindowStyle Hidden
    } catch {
        Write-Warning 'Process diagnostics setup failed; running tests unchanged.'
        $env:CONFECT_CLI_PROCESS_TRACE = $null
        $env:CONFECT_CLI_PHASE_TRACE_DIRECTORY = $null
    }
    Push-Location (Join-Path $PSScriptRoot '../packages/cli')
    try {
        pnpm test
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    $env:CONFECT_CLI_PROCESS_TRACE = $previousTrace
    $env:CONFECT_CLI_PHASE_TRACE_DIRECTORY = $previousPhaseTrace
    if ($null -ne $monitorProcess) {
        try {
            if (-not $monitorProcess.HasExited) { $monitorProcess.Kill() }
            if (-not $monitorProcess.WaitForExit(5000)) { Write-Warning 'Diagnostic monitor did not acknowledge exit.' }
        } catch {
            Write-Warning 'Diagnostic monitor cleanup failed; its independent duration cap remains active.'
        } finally {
            $monitorProcess.Dispose()
        }
    }
}
exit $exitCode
