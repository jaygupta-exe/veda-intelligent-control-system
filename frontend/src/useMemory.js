import { useState, useEffect, useCallback } from "react";
import {
  loadMemory as fbLoadMemory,
  updateMemory as fbUpdateMemory,
  saveHistory as fbSaveHistory,
} from "./memory";

export const useMemory = () => {
  const [memory, setMemory] = useState({
    name: "Boss",
    preferences: [],
    history: [],
  });
  const [memoryLoaded, setMemoryLoaded] = useState(false);

  // Load memory from Firestore on mount
  useEffect(() => {
    const init = async () => {
      const data = await fbLoadMemory();
      setMemory(data);
      setMemoryLoaded(true);
      console.log("[Memory] Loaded:", data.name, `| ${data.preferences.length} prefs | ${data.history.length} history entries`);
    };
    init();
  }, []);

  // Update a field (name or preferences)
  const updateField = useCallback(async (field, value) => {
    await fbUpdateMemory(field, value);
    setMemory((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Save a conversation entry
  const saveConversation = useCallback(async (userMsg, aiResponse) => {
    await fbSaveHistory(userMsg, aiResponse);
    setMemory((prev) => {
      const newHistory = [...prev.history, { user: userMsg, ai: aiResponse, timestamp: new Date().toISOString() }];
      return { ...prev, history: newHistory.slice(-10) };
    });
  }, []);

  // Build a context string for the AI system prompt
  const buildMemoryContext = useCallback(() => {
    const parts = [];
    if (memory.name && memory.name !== "Boss") {
      parts.push(`[MEMORY] User's name is ${memory.name}.`);
    }
    if (memory.preferences.length > 0) {
      parts.push(`[MEMORY] User preferences: ${memory.preferences.join(", ")}.`);
    }
    if (memory.history.length > 0) {
      const recent = memory.history.slice(-5);
      const histStr = recent.map((h) => `User: "${h.user}" → Veda: "${h.ai}"`).join(" | ");
      parts.push(`[HISTORY] Recent: ${histStr}`);
    }
    return parts.join(" ");
  }, [memory]);

  return {
    memory,
    memoryLoaded,
    updateField,
    saveConversation,
    buildMemoryContext,
  };
};
