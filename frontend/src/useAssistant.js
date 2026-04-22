import Groq from "groq-sdk";
import { useState, useCallback, useRef } from "react";
import { useWeather } from "./useWeather";
import { useTime } from "./useTime";
import { useSystemControl } from "./useSystemControl";

const groq = new Groq({
  apiKey: process.env.REACT_APP_GROQ_API_KEY,
  dangerouslyAllowBrowser: true 
});

export const useAssistant = ({ memory, updateField, saveConversation, buildMemoryContext }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const sessionTimeoutRef = useRef(null);

  // Pending memory confirmation state
  const pendingMemoryRef = useRef(null); // { type: 'name'|'preference', value: string }
  
  const { fetchWeather } = useWeather();
  const { fetchTime } = useTime();
  const { executeSystemCommand } = useSystemControl();

  const resetSession = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    setSessionActive(true);
    sessionTimeoutRef.current = setTimeout(() => {
      setSessionActive(false);
    }, 30000); // 30 second session duration
  }, []);

  const getResponse = useCallback(async (message) => {
    setIsProcessing(true);
    try {
      let processedMessage = message.trim();
      let weatherContext = "";
      let timeContext = "";

      // 1. Universal Activation Trigger (Robust Phonetics)
      const lowerMsg = processedMessage.toLowerCase();
      // Detect if Veda is being addressed (only Veda phonetic variants)
      const isAddressed = /\b(veda|ved|weda|vada)\b/i.test(lowerMsg.substring(0, 25));

      // Protocol: If session is active OR wake word is detected, proceed.
      if (!isAddressed && !sessionActive) {
        return null; 
      }

      // If addressed or in active session, refresh/start session
      resetSession();

      // Cleanup: Strip the wake word from both beginning and end
      if (isAddressed) {
        processedMessage = processedMessage
          .replace(/^(hey\s+)?(veda|ved|weda|vada)(,|\s+)?/i, "") // Beginning
          .replace(/(,|\s+)?(veda|ved|weda|vada)$/i, "")         // End
          .trim();
      }
      
      // ─── EMPTY COMMAND GREETING ───
      // If the user ONLY said the wake word, give a premium greeting
      if (isAddressed && !processedMessage) {
        // We'll need the time context for the greeting
        const trueTimeData = await fetchTime("India");
        const groundTruthTime = trueTimeData ? trueTimeData.time : new Date().toLocaleTimeString();
        
        let timeOfDay = "Night";
        if (groundTruthTime.includes("AM")) {
            const hour = parseInt(groundTruthTime.split(":")[0]);
            if (hour === 12 || hour < 5) timeOfDay = "Night";
            else timeOfDay = "Morning";
        } else if (groundTruthTime.includes("PM")) {
            const hour = parseInt(groundTruthTime.split(":")[0]);
            if (hour === 12 || hour < 4) timeOfDay = "Afternoon";
            else if (hour >= 4 && hour < 8) timeOfDay = "Evening"; 
            else timeOfDay = "Night";
        }

        const greetings = [
          `Hey Boss! Veda active hai. Kya scene hai aaj ka? Main is ${timeOfDay} mein aapki kya help karoon?`,
          `Veda online hai Boss! System nominal. Abhi ${groundTruthTime} ho rha hai, bolo kya help karoon?`,
          `Hello Boss! Sab set hai. Is fresh ${timeOfDay} ka kya plan hai? Main ready hoon help ke liye.`,
          `Veda link established! Command dijiye Boss, main poore Josh mein hoon.`
        ];
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        return randomGreeting;
      }

      const cleanedMessage = processedMessage.toLowerCase();

      // ─── MEMORY CONFIRMATION CHECK ───
      // If there is a pending memory update, check for yes/no
      if (pendingMemoryRef.current) {
        const pending = pendingMemoryRef.current;
        const isYes = /\b(yes|yeah|yep|sure|correct|confirm|haan|ha|okay|ok|theek|sahi|bilkul)\b/i.test(cleanedMessage);
        const isNo = /\b(no|nah|nope|cancel|wrong|nahi|naa|never)\b/i.test(cleanedMessage);

        if (isYes) {
          pendingMemoryRef.current = null;
          if (pending.type === 'name') {
            await updateField('name', pending.value);
            const response = `Done Boss! Maine save kar liya hai ki aapka naam ${pending.value} hai. Ab clear hai.`;
            await saveConversation(processedMessage, response);
            return response;
          } else if (pending.type === 'preference') {
            const currentPrefs = memory.preferences || [];
            if (!currentPrefs.includes(pending.value)) {
              await updateField('preferences', [...currentPrefs, pending.value]);
            }
            const response = `Done! Aapki preference "${pending.value}" maine memory mein fix kar di hai.`;
            await saveConversation(processedMessage, response);
            return response;
          }
        } else if (isNo) {
          pendingMemoryRef.current = null;
          return "Cool Boss, memory update cancel kar di hai. No worries!";
        }
        // If neither yes/no, clear pending and process as normal command
        pendingMemoryRef.current = null;
      }

      // ─── MEMORY DETECTION (HINGLISH) ───
      // Detect "my name is ..." or "mera naam ... hai"
      const nameMatch = cleanedMessage.match(/(?:my name is|mera naam|main)\s+([a-z]+)(?:\s+hoon|\s+hai)?/i);
      if (nameMatch && nameMatch[1]) {
        const detectedName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
        pendingMemoryRef.current = { type: 'name', value: detectedName };
        return `Boss, kya main yaad rakhun ki aapka naam "${detectedName}" hai? Haan ya naa bolo?`;
      }

      // Detect "I like ..." / "Mujhe ... pasand hai"
      const prefMatch = cleanedMessage.match(/(?:i (?:like|prefer|enjoy|love)|mujhe)\s+(.+?)(?:\s+pasand\s+hai|\s+pasand\s+hain)?$/i);
      if (prefMatch && prefMatch[1].trim()) {
        const detectedPref = prefMatch[1].trim().replace(/[^a-z\s]/gi, "");
        if (detectedPref.length > 1 && detectedPref.length < 50) {
          pendingMemoryRef.current = { type: 'preference', value: detectedPref };
          return `Boss, kya main save kar loon ki aapko "${detectedPref}" pasand hai? Yes or no fix karen?`;
        }
      }

      // 2. Semantic Intent Detection: Weather
      const weatherKeywords = /\b(weather|temp|temperature|rain|forecast|condition|climate|humid|wind|sunny|cloudy|mausam|baaris|dhup)\b/i;
      const isWeatherQuery = weatherKeywords.test(cleanedMessage);

      if (isWeatherQuery) {
        let location = "default";
        const locMatch = cleanedMessage.match(/(?:weather|temp|temperature|mausam|in|at|for|of)\s+([^?.!,]+)/i);
        
        if (locMatch && locMatch[1].trim()) {
           location = locMatch[1].trim().split(" ")[0].replace(/[^a-z\s]/gi, "").trim();
        }
        
        const weatherData = await fetchWeather(location);
        if (weatherData) {
          if (weatherData.error === "NOT_FOUND" && location !== "default") {
             weatherContext = `[WEATHER] Location "${location}" unknown. Using defaults.`;
          } else {
             weatherContext = `[WEATHER] ${weatherData.location}: ${weatherData.temp}°C, ${weatherData.condition}.`;
          }
        }
      }

      // 3. Semantic Intent Detection: Time
      const timeKeywords = /\b(time|ghadi|waqt|clock|hour|minute|samay)\b/i;
      const isTimeQuery = timeKeywords.test(cleanedMessage);

      if (isTimeQuery) {
        let location = "default";
        const locMatch = cleanedMessage.match(/(?:time|ghadi|waqt|samay|in|at|for|of)\s+([^?.!,]+)/i);
        
        if (locMatch && locMatch[1].trim()) {
           location = locMatch[1].trim().split(" ")[0].replace(/[^a-z\s]/gi, "").trim();
        }

        const timeData = await fetchTime(location);
        if (timeData) {
          timeContext = `[TIME] ${timeData.location}: ${timeData.time}.`;
        }
      }

      // ─── SYSTEM CONTROL DETECTION (before LLM — instant execution) ───
      const systemResult = await executeSystemCommand(cleanedMessage);
      if (systemResult) {
        await saveConversation(processedMessage, systemResult);
        return systemResult;
      }

      // 4. Absolute Ground Truth Fallback (Bypasses broken local PC clocks)
      const trueTimeData = await fetchTime("India");
      const groundTruthTime = trueTimeData ? trueTimeData.time : new Date().toLocaleTimeString();
      const groundTruthDate = trueTimeData ? trueTimeData.date : new Date().toLocaleDateString();

      let timeOfDay = "Night";
      if (groundTruthTime.includes("AM")) {
          const hour = parseInt(groundTruthTime.split(":")[0]);
          if (hour === 12 || hour < 5) timeOfDay = "Night";
          else timeOfDay = "Morning";
      } else if (groundTruthTime.includes("PM")) {
          const hour = parseInt(groundTruthTime.split(":")[0]);
          if (hour === 12 || hour < 4) timeOfDay = "Afternoon";
          else if (hour >= 4 && hour < 8) timeOfDay = "Evening"; 
          else timeOfDay = "Night";
      }

      // 5. Build Memory Context
      const memoryCtx = buildMemoryContext();

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are Veda, an intelligent, cool, and friendly Indian-style AI assistant with a Gen Z vibe.
ABSOLUTE SOURCE OF TRUTH (IST): ${groundTruthTime}, ${groundTruthDate}. Current Period: ${timeOfDay}.

PROTOCOL:
1. RESPONSE STYLE: ALWAYS reply in "Modern Hinglish". This is a chill, clever mix of Hindi and English. Avoid formal, old-school Hindi (like "Bataiye", "Kijiye", "Shama"). Use casual, modern words (like "Batao", "Scene", "Set hai", "Fix"). Sound like a smart, cool human helping a friend.
2. IDENTITY: ALWAYS address the user as 'Boss'. NEVER use their real name unless they specifically ask "mera naam kya hai" or "what is my name".
3. DATA: Use provided [TIME]/[WEATHER] context. Fallback to ABSOLUTE SOURCE OF TRUTH.
4. CHRONO-AWARENESS: Naturally mention time context (Subah/Dopahar/Shaam/Raat) using modern phrasing.
5. NO HALLUCINATION: Always use the clock provided.
6. CONCISENESS: Keep responses medium length, around 15-20 words.
7. MEMORY: ${memoryCtx || 'No prior memory.'} Use stored memory to personalize your Modern Hinglish replies.`
          },
          {
            role: "user",
            content: `CONTEXT: ${weatherContext} ${timeContext} \nINPUT: ${processedMessage}`
          }
        ],
        model: "llama-3.1-8b-instant",
      });

      const response = chatCompletion.choices[0]?.message?.content || "I encountered an error processing that.";
      const cleanResponse = response.replace(/V\.?E\.?D\.?A\.?/gi, "Veda");

      // Save conversation to history
      await saveConversation(processedMessage, cleanResponse);

      return cleanResponse;
    } catch (error) {
      console.error("Groq API Error:", error);
      return "System error: Unable to reach neural network.";
    } finally {
      setIsProcessing(false);
    }
  }, [fetchWeather, fetchTime, executeSystemCommand, resetSession, sessionActive, memory, updateField, saveConversation, buildMemoryContext]);
  return { getResponse, isProcessing, forceWakeSession: resetSession };
};
