Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient

function Test-Calibration {
    $p = Get-Process *WhatsApp* | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) { Write-Host "WhatsApp NOT found!"; return }

    $wa = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $r = $wa.Current.BoundingRectangle

    # Estimated "Call" Position based on your latest screenshot
    # Windowed mode: Right - 130 seems about right for the center of the Call dropdown.
    $targetX = [int]($r.Right - 130)
    $targetY = [int]($r.Top + 50)

    Write-Host "CALIBRATION: Moving mouse to $targetX, $targetY (Targeting Call Dropdown)"
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($targetX, $targetY)
    
    # Shake mouse briefly to show user where we are
    for ($i = 0; $i -lt 5; $i++) {
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($targetX + 10, $targetY)
        Start-Sleep -Milliseconds 50
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($targetX - 10, $targetY)
        Start-Sleep -Milliseconds 50
    }
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($targetX, $targetY)
}

Test-Calibration
