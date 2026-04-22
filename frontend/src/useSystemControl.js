import { useCallback, useRef, useState } from "react";

const BACKEND_URL = "http://localhost:5000";

/**
 * useSystemControl — Detects system-control intent from user input (Hinglish/English)
 * and sends commands to the V.E.D.A backend bridge.
 */
export const useSystemControl = () => {
  const [backendOnline, setBackendOnline] = useState(null); // null = unknown, true/false
  const healthCheckDoneRef = useRef(false);

  // ─── HEALTH CHECK (runs once) ───
  const checkBackendHealth = useCallback(async () => {
    if (healthCheckDoneRef.current) return backendOnline;
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
      const data = await res.json();
      const isOnline = data.status === "online";
      setBackendOnline(isOnline);
      healthCheckDoneRef.current = true;
      return isOnline;
    } catch {
      setBackendOnline(false);
      healthCheckDoneRef.current = true;
      return false;
    }
  }, [backendOnline]);

  // ─── INTENT DETECTION: Is this a system control command? ───
  const isSystemCommand = useCallback((message) => {
    const lower = message.toLowerCase();
    
    // Must contain an action verb (open/kholo/chalao/chalu kar/start/launch/run/message/call/karo/kro/do/phone)
    const hasAction = /\b(open|kholo|chalao|chalu\s*kar|shuru\s*kar|start|launch|run|message|msg|send|bhejo|call|milao|lagao|karo|kro|kro|do|phone)\b/i.test(lower);
    if (!hasAction) return false;

    // Must contain at least one recognizable app/site name or contact
    const appKeywords = /\b(notepad|calculator|calc|paint|wordpad|chrome|edge|firefox|brave|explorer|file|folder|cmd|terminal|powershell|taskmanager|task\s*manager|settings|vscode|code|visual\s*studio|spotify|vlc|whatsapp|wp|instagram|insta|ig|youtube|yt|google|gmail|mail|email|twitter|x|github|linkedin|facebook|fb|chatgpt|gpt|netflix|amazon|snipping|screenshot|note|notes|pihu|anmol|lambu)\b/i;
    
    return appKeywords.test(lower);
  }, []);

  // ─── EXECUTE SYSTEM COMMAND ───
  const executeSystemCommand = useCallback(async (message) => {
    // Step 1: Check if this is a system command
    if (!isSystemCommand(message)) return null;

    // Step 2: Check backend health
    const online = await checkBackendHealth();
    if (!online) {
      return "Boss, system control backend offline hai. Pehle backend server start karo: `node server.js`";
    }

    // Step 3: Check for WhatsApp Contact Intent for specialized feedback
    const lower = message.toLowerCase();
    const isContactAction = /\b(message|msg|send|call|milao|pihu|anmol|lambu)\b/i.test(lower);
    
    if (isContactAction) {
      // Return immediate feedback for WhatsApp actions (simulated delay warning)
      // Note: Since executeSystemCommand is awaited, we can't easily return twice.
      // But we can construct a response that acknowledges the delay.
      console.log("[SystemControl] WhatsApp action detected, warning user about delay.");
    }

    try {
      const res = await fetch(`${BACKEND_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: message }),
      });

      const data = await res.json();

      if (data.success) {
        const appNames = data.opened.join(" aur ");
        const count = data.opened.length;
        
        // Randomized Hinglish confirmations
        const confirmations = [
          `Done Boss! ${appNames} khol diya hai. Aur kuch?`,
          `${appNames} open ho gaya Boss! Bolo next kya karein?`,
          `Set hai! ${appNames} launch kar diya. Enjoy karo Boss!`,
          `${appNames} chalu ho gaya Boss. Kuch aur chahiye?`,
          `Boss, ${appNames} ${count > 1 ? 'dono' : ''} ready hai aapke liye!`,
        ];
        return confirmations[Math.floor(Math.random() * confirmations.length)];
      } else {
        // App not found or execution failed
        if (res.status === 404) {
          return "Boss, ye app meri list mein nahi hai. Koi aur app try karo!";
        }
        const failedApps = data.failed ? data.failed.join(", ") : "app";
        return `Boss, ${failedApps} open karne mein dikkat aayi: ${data.message}`;
      }
    } catch (error) {
      console.error("[SystemControl] Fetch error:", error);
      return "Boss, backend se connection fail ho gaya. Server check karo!";
    }
  }, [isSystemCommand, checkBackendHealth]);

  return { executeSystemCommand, isSystemCommand, backendOnline };
};
