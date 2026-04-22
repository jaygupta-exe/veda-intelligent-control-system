Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseHelper {
    [DllImport("user32.dll")] 
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    public const uint MOUSEEVENTF_LEFTDOWN = 0x02;
    public const uint MOUSEEVENTF_LEFTUP = 0x04;
    public const int SW_MAXIMIZE = 3;
    
    public static void Click() {
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }
}
"@

# Find the WhatsApp process (handles both WhatsApp and WhatsApp.Root)
$waProc = Get-Process *WhatsApp* | Select-Object -First 1
if (-not $waProc) {
    Write-Host "RESULT: WhatsApp process not found!"
    exit 1
}

# Use UIAutomation to find the window by ProcessId (Bypasses blank titles)
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $waProc.Id)
$wa = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)

if (-not $wa) {
    Write-Host "RESULT: WhatsApp window core not found!"
    exit 1
}

# Force MAXIMIZE (Full Screen)
[MouseHelper]::ShowWindow($wa.Current.NativeWindowHandle, 3)
$ws = New-Object -ComObject WScript.Shell
$ws.AppActivate($waProc.Id)
Start-Sleep -s 4

# Recalculate rectangle after activation
$r = $wa.Current.BoundingRectangle

# Step 1: Click the 'Call' dropdown button
$callX = [int]($r.Right - 280) 
$callY = [int]($r.Top + 80)
Write-Host "RESULT: Moving to Call Dropdown at $callX, $callY"
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($callX, $callY)
Start-Sleep -Milliseconds 500
[MouseHelper]::Click()

# Step 2: Wait for popup menu to stabilize
Start-Sleep -s 1.5

# Step 3: Click the 'Voice' button in the popup
$voiceX = [int]($r.Right - 420)
$voiceY = [int]($r.Top + 240)
Write-Host "RESULT: Moving to Voice Button at $voiceX, $voiceY"
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($voiceX, $voiceY)
Start-Sleep -Milliseconds 500
[MouseHelper]::Click()
Write-Host "RESULT: Bulletproof Strike Successful"
