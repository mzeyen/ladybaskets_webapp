$ErrorActionPreference = 'Stop'
$backupDirectory = Join-Path $PSScriptRoot '..\data\server-backups'
$backupDirectory = [IO.Path]::GetFullPath($backupDirectory)
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
# Restrict copied personal data to this Windows account and SYSTEM.
$backupIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $backupDirectory /inheritance:r /grant:r "${backupIdentity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to protect backup directory' }
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupTarget = Join-Path $backupDirectory "club-$backupStamp.sqlite"
& scp.exe -o BatchMode=yes -o ConnectTimeout=15 root@91.98.29.130:/var/backups/ladybaskets/latest.sqlite $backupTarget
if ($LASTEXITCODE -ne 0) { throw 'Offsite backup download failed' }
Get-ChildItem -LiteralPath $backupDirectory -Filter 'club-*.sqlite' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
Write-Output "Offsite backup saved: $backupTarget"
