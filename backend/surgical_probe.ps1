Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Start-SurgicalProbe {
    $p = Get-Process *WhatsApp* | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) {
        Write-Host "WhatsApp not found!"
        return
    }

    $wa = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $elements = $wa.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    
    Write-Host "--- HEADER PROBE (Y < 200) ---"
    foreach ($el in $elements) {
        $r = $el.Current.BoundingRectangle
        if ($r.Top -ge 0 -and $r.Top -le 200) {
            $name = $el.Current.Name
            $type = $el.Current.LocalizedControlType
            Write-Host "PROBE: Name='$name' | Type='$type' | Rect=$($r.Left),$($r.Top),$($r.Width),$($r.Height)"
        }
    }
}

Start-SurgicalProbe
