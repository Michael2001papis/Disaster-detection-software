$ErrorActionPreference = 'SilentlyContinue'
$lines = New-Object System.Collections.Generic.List[string]
function Add-Section {
    param([string]$Title)
    $lines.Add('')
    $lines.Add('=' * 80)
    $lines.Add($Title)
    $lines.Add('=' * 80)
}

Add-Section 'SYSTEM STATUS REPORT'
$lines.Add('Generated (UTC local): ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$lines.Add('Time zone: ' + [TimeZoneInfo]::Local.Id + ' | ' + [TimeZoneInfo]::Local.DisplayName)
$lines.Add('User: ' + $env:USERNAME)
$lines.Add('Computer: ' + $env:COMPUTERNAME)
$cs = Get-CimInstance Win32_ComputerSystem
$lines.Add('Domain/Workgroup: ' + $cs.Domain)
$lines.Add('Manufacturer: ' + $cs.Manufacturer)
$lines.Add('Model: ' + $cs.Model)
$lines.Add('Total physical RAM (reported by OS) GB: ' + [math]::Round($cs.TotalPhysicalMemory / 1GB, 2))

Add-Section 'OPERATING SYSTEM'
$os = Get-CimInstance Win32_OperatingSystem
$lines.Add('Caption: ' + $os.Caption)
$lines.Add('Version: ' + $os.Version)
$lines.Add('Build: ' + $os.BuildNumber)
$lines.Add('Architecture: ' + $os.OSArchitecture)
try {
    $install = ([Management.ManagementDateTimeConverter]::ToDateTime($os.InstallDate)).ToString('yyyy-MM-dd')
    $lines.Add('Install date: ' + $install)
} catch {
    $lines.Add('Install date: (unavailable)')
}
$lines.Add('Last boot: ' + $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm:ss'))
$up = (Get-Date) - $os.LastBootUpTime
$lines.Add(('Uptime: {0} days, {1} hours, {2} minutes' -f $up.Days, $up.Hours, $up.Minutes))
$lines.Add('Locale (culture): ' + [System.Globalization.CultureInfo]::CurrentCulture.Name)
$lines.Add('OS language (UI culture): ' + [System.Globalization.CultureInfo]::CurrentUICulture.Name)

Add-Section 'CPU'
$cpus = @(Get-CimInstance Win32_Processor)
$c = $cpus[0]
$lines.Add('Name: ' + $c.Name.Trim())
$lines.Add('Physical CPU packages: ' + $cpus.Count)
$lines.Add('Cores (first package): ' + $c.NumberOfCores)
$lines.Add('Logical processors (first package): ' + $c.NumberOfLogicalProcessors)
$lines.Add('Max clock MHz: ' + $c.MaxClockSpeed)
$lines.Add('L2 cache KB: ' + $c.L2CacheSize + ' | L3 cache KB: ' + $c.L3CacheSize)

Add-Section 'MEMORY (from Win32_OperatingSystem)'
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedGB = [math]::Round($totalGB - $freeGB, 2)
$pct = if ($totalGB -gt 0) { [math]::Round(100 * $usedGB / $totalGB, 1) } else { 0 }
$lines.Add('Total visible GB: ' + $totalGB)
$lines.Add('Free GB: ' + $freeGB)
$lines.Add('Used GB: ' + $usedGB)
$lines.Add('Used percent: ' + $pct)
$lines.Add('')
$lines.Add('Physical memory modules:')
Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
    $gb = [math]::Round($_.Capacity / 1GB, 2)
    $lines.Add(('  {0} GB | Speed {1} MHz | Manufacturer: {2} | PartNumber: {3}' -f $gb, $_.Speed, $_.Manufacturer, $_.PartNumber))
}

Add-Section 'LOGICAL DISKS (fixed)'
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    $size = [math]::Round($_.Size / 1GB, 2)
    $free = [math]::Round($_.FreeSpace / 1GB, 2)
    $used = [math]::Round($size - $free, 2)
    $p = if ($size -gt 0) { [math]::Round(100 * $used / $size, 1) } else { 0 }
    $lines.Add($_.DeviceID + ' | Total GB: ' + $size + ' | Free GB: ' + $free + ' | Used GB: ' + $used + ' | Used %: ' + $p)
    $lines.Add('  FileSystem: ' + $_.FileSystem + ' | Volume name: ' + $_.VolumeName + ' | Serial: ' + $_.VolumeSerialNumber)
}

Add-Section 'PHYSICAL DISKS'
Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $gb = if ($_.Size) { [math]::Round($_.Size / 1GB, 2) } else { 'N/A' }
    $lines.Add($_.Model + ' | GB: ' + $gb + ' | Interface: ' + $_.InterfaceType + ' | Status: ' + $_.Status + ' | Partitions: ' + $_.Partitions)
}

Add-Section 'VIDEO'
Get-CimInstance Win32_VideoController | ForEach-Object {
    $lines.Add($_.Name + ' | DriverVersion: ' + $_.DriverVersion + ' | VideoMode: ' + $_.VideoModeDescription)
    if ($_.AdapterRAM -and $_.AdapterRAM -gt 0) {
        $lines.Add('  Adapter RAM (reported) MB: ' + [math]::Round($_.AdapterRAM / 1MB, 0))
    }
}

Add-Section 'NETWORK ADAPTERS (Status = Up)'
Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Sort-Object Name | ForEach-Object {
    $lines.Add($_.Name + ' | ' + $_.InterfaceDescription)
    $lines.Add('  MAC: ' + $_.MacAddress + ' | Link speed: ' + $_.LinkSpeed)
}

Add-Section 'IPv4 ADDRESSES'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Sort-Object InterfaceAlias | ForEach-Object {
    $lines.Add($_.InterfaceAlias + ': ' + $_.IPAddress + ' /' + $_.PrefixLength + ' | Origin: ' + $_.PrefixOrigin)
}

Add-Section 'DEFAULT GATEWAY'
Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 8 | ForEach-Object {
    $lines.Add('NextHop: ' + $_.NextHop + ' | Interface: ' + $_.InterfaceAlias + ' | Metric: ' + $_.RouteMetric)
}

Add-Section 'DNS SERVERS (IPv4)'
Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 } | ForEach-Object {
    $lines.Add($_.InterfaceAlias + ': ' + ($_.ServerAddresses -join ', '))
}

Add-Section 'POWER & BATTERY'
$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if (-not $bat) {
    $lines.Add('No battery reported (desktop or driver).')
} else {
    $bat | ForEach-Object {
        $lines.Add('Name: ' + $_.Name + ' | Status: ' + $_.Status + ' | Estimated charge %: ' + $_.EstimatedChargeRemaining)
    }
}

Add-Section 'POWERSHELL RUNTIME'
$lines.Add('PSVersion: ' + $PSVersionTable.PSVersion)
$lines.Add('PSEdition: ' + $PSVersionTable.PSEdition)
$lines.Add('CLR: ' + $PSVersionTable.CLRVersion)

Add-Section 'SELECTED ENVIRONMENT'
$lines.Add('TEMP: ' + $env:TEMP)
$lines.Add('TMP: ' + $env:TMP)
$lines.Add('USERPROFILE: ' + $env:USERPROFILE)
$lines.Add('ProgramFiles: ' + $env:ProgramFiles)
${pf86} = ${env:ProgramFiles(x86)}
$lines.Add('ProgramFiles(x86): ' + ${pf86})
$lines.Add('APPDATA: ' + $env:APPDATA)
$lines.Add('LOCALAPPDATA: ' + $env:LOCALAPPDATA)
$lines.Add('PUBLIC: ' + $env:PUBLIC)
$lines.Add('SystemRoot: ' + $env:SystemRoot)
$pathLen = ([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')).Length
$lines.Add('PATH total character length: ' + $pathLen)

Add-Section 'SERVICES: StartMode=Auto but not Running (first 50)'
Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } |
    Sort-Object Name | Select-Object -First 50 | ForEach-Object {
    $lines.Add($_.Name + ' | State: ' + $_.State + ' | StartMode: ' + $_.StartMode)
}

Add-Section 'RECENT WINDOWS UPDATES (HotFix, last 20)'
Get-HotFix -ErrorAction SilentlyContinue | Sort-Object { $_.InstalledOn } -Descending | Select-Object -First 20 | ForEach-Object {
    $lines.Add($_.HotFixID + ' | InstalledOn: ' + $_.InstalledOn + ' | ' + $_.Description)
}

Add-Section 'TOP PROCESSES BY WORKING SET (25)'
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 25 | ForEach-Object {
    $cpuSec = 'N/A'
    try { $cpuSec = [math]::Round($_.CPU, 2).ToString() } catch { }
    $lines.Add($_.ProcessName + ' | PID: ' + $_.Id + ' | WS MB: ' + [math]::Round($_.WorkingSet64 / 1MB, 1) + ' | CPU(s): ' + $cpuSec)
}

Add-Section 'RUNNING SERVICES COUNT'
$running = @(Get-CimInstance Win32_Service | Where-Object { $_.State -eq 'Running' }).Count
$total = @(Get-CimInstance Win32_Service).Count
$lines.Add('Running services: ' + $running + ' / Total: ' + $total)

Add-Section 'END OF REPORT'
$lines.Add('This file was generated automatically for system documentation and troubleshooting.')

$outPath = Join-Path $PSScriptRoot 'SYSTEM_REPORT_BODY.txt'
$enc = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($outPath, $lines.ToArray(), $enc)
$introPath = Join-Path $PSScriptRoot '_report_intro_he.txt'
$finalName = [string]::Concat(
    [char]0x05D3, [char]0x05D5, [char]0x05D7, '_',
    [char]0x05DE, [char]0x05E6, [char]0x05D1, '_',
    [char]0x05DE, [char]0x05E2, [char]0x05E8, [char]0x05DB, [char]0x05EA, '.txt'
)
$finalPath = Join-Path $PSScriptRoot $finalName
$intro = [System.IO.File]::ReadAllText($introPath, [System.Text.Encoding]::UTF8)
$bodyText = [System.IO.File]::ReadAllText($outPath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($finalPath, $intro + $bodyText, $enc)
Write-Host "OK $outPath"
Write-Host "OK $finalPath"
