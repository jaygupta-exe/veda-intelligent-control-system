const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");

const app = express();
const PORT = 5000;

// ─── MIDDLEWARE ───
app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));
app.use(express.json());

// ─── CONTACTS MEMORY ───
const CONTACTS = {
  pihu: { name: "Pihu", phone: "919872421788" },
  anmol: { name: "Anmol", phone: "916280868254" },
};

// ─── COMMAND WHITELIST (Security: Only these commands can execute) ───
const COMMAND_MAP = {
  // ── Desktop Applications ──
  notepad:        { cmd: "start notepad",    label: "Notepad" },
  calculator:     { cmd: "start calc",       label: "Calculator" },
  calc:           { cmd: "start calc",       label: "Calculator" },
  paint:          { cmd: "start mspaint",    label: "MS Paint" },
  wordpad:        { cmd: "start wordpad",    label: "WordPad" },
  snipping:       { cmd: "start SnippingTool", label: "Snipping Tool" },
  screenshot:     { cmd: "start SnippingTool", label: "Snipping Tool" },

  // ── Browsers ──
  chrome:         { cmd: "start chrome",     label: "Google Chrome" },
  edge:           { cmd: "start msedge",     label: "Microsoft Edge" },
  firefox:        { cmd: "start firefox",    label: "Firefox" },
  brave:          { cmd: "start brave",      label: "Brave Browser" },

  // ── System Tools ──
  explorer:       { cmd: "start explorer",   label: "File Explorer" },
  fileexplorer:   { cmd: "start explorer",   label: "File Explorer" },
  files:          { cmd: "start explorer",   label: "File Explorer" },
  cmd:            { cmd: "start cmd",        label: "Command Prompt" },
  terminal:       { cmd: "start cmd",        label: "Command Prompt" },
  powershell:     { cmd: "start powershell", label: "PowerShell" },
  taskmanager:    { cmd: "start taskmgr",    label: "Task Manager" },
  settings:       { cmd: "start ms-settings:", label: "Windows Settings" },

  // ── Dev Tools ──
  vscode:         { cmd: "start code",       label: "VS Code" },
  code:           { cmd: "start code",       label: "VS Code" },

  // ── Media & Entertainment ──
  spotify:        { cmd: "start spotify:",   label: "Spotify" },
  vlc:            { cmd: "start vlc",        label: "VLC Player" },

  // ── Websites ──
  whatsapp:       { cmd: 'start whatsapp:',                        label: "WhatsApp" },
  instagram:      { cmd: 'start "" "https://www.instagram.com"',  label: "Instagram" },
  youtube:        { cmd: 'start "" "https://www.youtube.com"',    label: "YouTube" },
  google:         { cmd: 'start "" "https://www.google.com"',     label: "Google" },
  gmail:          { cmd: 'start "" "https://mail.google.com"',    label: "Gmail" },
  twitter:        { cmd: 'start "" "https://x.com"',             label: "Twitter / X" },
  x:              { cmd: 'start "" "https://x.com"',             label: "Twitter / X" },
  github:         { cmd: 'start "" "https://github.com"',        label: "GitHub" },
  linkedin:       { cmd: 'start "" "https://www.linkedin.com"',  label: "LinkedIn" },
  facebook:       { cmd: 'start "" "https://www.facebook.com"',  label: "Facebook" },
  chatgpt:        { cmd: 'start "" "https://chat.openai.com"',   label: "ChatGPT" },
  netflix:        { cmd: 'start "" "https://www.netflix.com"',   label: "Netflix" },
  amazon:         { cmd: 'start "" "https://www.amazon.in"',     label: "Amazon" },
};

// ─── HELPER: Normalize user input to multiple command keys ───
function extractAppKeys(userCommand) {
  const cleaned = userCommand.toLowerCase();
  const foundKeys = new Set();
  let contactAction = null; // { type: 'message'|'call', contact: {}, text: '' }

  // 1. Check for Contact Actions (WhatsApp Specific)
  const contactKeys = Object.keys(CONTACTS);
  const actionTerms = "message|msg|bhejo|likho|send|call|milao|lagao|karo|do";
  
  // Look for name and action anywhere
  let matchedContact = null;
  let matchedAction = null;

  for (const key of contactKeys) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(cleaned)) {
      matchedContact = CONTACTS[key];
      break;
    }
  }

  if (matchedContact) {
    if (new RegExp(`\\b(message|msg|bhejo|likho|send)\\b`, 'i').test(cleaned)) {
      matchedAction = 'message';
    } else if (new RegExp(`\\b(call|milao|lagao)\\b`, 'i').test(cleaned)) {
      matchedAction = 'call';
    }
  }

  if (matchedContact && matchedAction) {
    if (matchedAction === 'message') {
      // Extract text: remove action words and name
      let text = cleaned
        .replace(new RegExp(`\\b(message|msg|bhejo|likho|send|ko|pe|par|on|whatspp|whatsapp|kro|karo|do)\\b`, 'gi'), "")
        .replace(new RegExp(`\\b${matchedContact.name}\\b`, 'gi'), "")
        .trim();
      
      contactAction = { 
        type: 'message', 
        contact: matchedContact, 
        text: text || "Hello!", 
        cmd: `start whatsapp://send?phone=${matchedContact.phone}^&text=${encodeURIComponent(text || "Hello!")}`
      };
    } else {
      contactAction = { 
        type: 'call', 
        contact: matchedContact, 
        cmd: `start whatsapp://send?phone=${matchedContact.phone}` 
      };
    }
  }

  // 2. Standard App Detection
  // Fuzzy/alias matching
  const aliases = {
    "microsoftedge": "edge", "msedge": "edge", "googlechrome": "chrome",
    "filebrowser": "explorer", "folder": "explorer", "folders": "explorer", "file": "explorer",
    "visualstudiocode": "vscode", "visualstudio": "vscode", "vs": "vscode",
    "note": "notepad", "notes": "notepad", "calculater": "calculator",
    "whatsappweb": "whatsapp", "whatsappp": "whatsapp", "whatsppp": "whatsapp",
    "wp": "whatsapp", "insta": "instagram", "ig": "instagram", "yt": "youtube",
    "fb": "facebook", "gpt": "chatgpt", "tw": "twitter", "taskmgr": "taskmanager",
    "task": "taskmanager", "snip": "snipping", "ss": "snipping", "mail": "gmail", "email": "gmail",
  };

  for (const key of Object.keys(COMMAND_MAP)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(cleaned)) foundKeys.add(key);
  }
  for (const [alias, target] of Object.entries(aliases)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(cleaned)) foundKeys.add(target);
  }

  // Fallback: partial matches
  if (foundKeys.size === 0 && !contactAction) {
    for (const key of Object.keys(COMMAND_MAP)) {
      if (cleaned.includes(key)) foundKeys.add(key);
    }
  }

  return { 
    keys: Array.from(foundKeys), 
    contactAction 
  };
}

// ─── API ENDPOINT: POST /execute ───
app.post("/execute", async (req, res) => {
  const { command } = req.body;

  if (!command || typeof command !== "string") {
    return res.status(400).json({ success: false, message: "No command provided." });
  }

  const { keys, contactAction } = extractAppKeys(command);

  if (keys.length === 0 && !contactAction) {
    return res.status(404).json({ success: false, message: `Unknown command: "${command}".`, apps: [] });
  }

  const results = [];

  // 1. Handle Contact Action (Priority)
  if (contactAction) {
    const { type, contact, cmd, text } = contactAction;
    
    // Execute the protocol link
    const success = await new Promise((resolve) => {
      exec(cmd, (error) => {
        if (error) {
          console.error(`[WHATSAPP ERROR] ${contact.name}:`, error.message);
          resolve(false);
        } else {
          console.log(`[WHATSAPP OK] Opened: ${contact.name} (${type})`);
          resolve(true);
        }
      });
    });

    if (success) {
      if (type === 'message') {
        const psCommand = `powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $stop = (Get-Date).AddSeconds(15); while ((Get-Date) -lt $stop) { if ($ws.AppActivate('WhatsApp.Root') -or $ws.AppActivate('WhatsApp')) { Start-Sleep -s 3; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); break; } Start-Sleep -s 1; }"`;
        exec(psCommand); // Async
        return res.json({
          success: true,
          message: `Ok Boss! WhatsApp khul raha hai. Message 5-10 seconds mein apne aap chala jayega.`,
          opened: [`WhatsApp Contact: ${contact.name}`],
          count: 1
        });
      } else {
        // CALL LOGIC: Execute the surgical calibrated script
        const scriptPath = path.join(__dirname, 'whatsapp_call.ps1');
        const psCommand = `powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
        exec(psCommand); // Async
        return res.json({
          success: true,
          message: `Done! Surgical Precision calling initiated. Veda pixel offsets follow kar rahi hai...`,
          opened: [`WhatsApp Contact: ${contact.name}`],
          count: 1
        });
      }
    }
  }

  // 2. Handle standard apps (Limit to 5)
  const keysToExecute = keys.slice(0, 5);
  const appResults = await Promise.all(
    keysToExecute.map((key) => {
      const { cmd, label } = COMMAND_MAP[key];
      return new Promise((resolve) => {
        exec(cmd, (error) => {
          if (error) {
            console.error(`[EXEC ERROR] ${label}:`, error.message);
            resolve({ success: false, app: label });
          } else {
            console.log(`[EXEC OK] Opened: ${label}`);
            resolve({ success: true, app: label });
          }
        });
      });
    })
  );
  
  results.push(...appResults);

  const succeeded = results.filter(r => r.success).map(r => r.app);
  const failed = results.filter(r => !r.success).map(r => r.app);

  return res.json({
    success: succeeded.length > 0,
    message: succeeded.length > 0 ? `Executed: ${succeeded.join(", ")}` : `Failed to execute.`,
    opened: succeeded,
    failed: failed,
    count: succeeded.length
  });
});

// ─── Health Check ───
app.get("/health", (req, res) => {
  res.json({ status: "online", server: "V.E.D.A System Control Bridge", version: "1.0.0" });
});

// ─── START SERVER ───
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   V.E.D.A SYSTEM CONTROL BRIDGE — ONLINE    ║`);
  console.log(`║   Port: ${PORT}                                ║`);
  console.log(`║   Status: READY                              ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  console.log(`[INFO] Allowed apps: ${Object.keys(COMMAND_MAP).length} commands registered.`);
  console.log(`[INFO] Waiting for commands from V.E.D.A frontend...\n`);
});
