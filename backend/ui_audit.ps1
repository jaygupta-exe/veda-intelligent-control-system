Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-WhatsAppFullAudit {
    $p = Get-Process *WhatsApp* | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) {
        Write-Host "WhatsApp not found!"
        return
    }

    $wa = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $elements = $wa.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    
    $results = foreach ($el in $elements) {
        $n = $el.Current.Name
        $t = $el.Current.LocalizedControlType
        "$n | $t"
    }
    
    $results | Out-File "c:\Users\jaygu\Desktop\V.E.D.A\backend\wa_elements.txt"
    Write-Host "Audit complete. Saved to wa_elements.txt"
}

Get-WhatsAppFullAudit
