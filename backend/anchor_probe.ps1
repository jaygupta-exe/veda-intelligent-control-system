Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Find-Anchor {
    $p = Get-Process *WhatsApp* | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) {
        Write-Host "WhatsApp not found!"
        return
    }

    $wa = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $close = $wa.FindFirst([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Close'))
    
    if ($close) {
        $r = $close.Current.BoundingRectangle
        Write-Host "ANCHOR_FOUND: Name='Close' | Rect='$($r.Left),$($r.Top),$($r.Width),$($r.Height)'"
    } else {
        Write-Host "ERROR: Close button not found!"
    }
}

Find-Anchor
