function Get-WhatsAppDetails {
    Write-Host "--- Scanning Windows for WhatsApp Title ---"
    Get-Process | Where-Object { $_.MainWindowTitle -match "WhatsApp" } | Select-Object -Property ProcessName, Id, MainWindowTitle | ForEach-Object {
        Write-Host "MATCH: Process='$($_.ProcessName)' | ID='$($_.Id)' | Title='$($_.MainWindowTitle)'"
    }
}

Get-WhatsAppDetails
