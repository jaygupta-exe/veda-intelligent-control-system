import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";

const USER_DOC_PATH = "users/user_001";
const LOCAL_STORAGE_KEY = "veda_memory";

// ─── Default Memory Structure ───
const DEFAULT_MEMORY = {
  name: "Boss",
  preferences: [],
  history: [],
};

// ─── localStorage Helpers ───
const loadFromLocal = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : { ...DEFAULT_MEMORY };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
};

const saveToLocal = (memory) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(memory));
  } catch (e) {
    console.error("[Memory] localStorage write failed:", e);
  }
};

// ─── Firestore Operations ───

/**
 * Load memory from Firestore. Falls back to localStorage on failure.
 */
export const loadMemory = async () => {
  try {
    const ref = doc(db, USER_DOC_PATH);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      const memory = {
        name: data.name || DEFAULT_MEMORY.name,
        preferences: data.preferences || [],
        history: data.history || [],
      };
      // Sync to localStorage as backup
      saveToLocal(memory);
      return memory;
    } else {
      // First-time: create the document with defaults
      await setDoc(ref, DEFAULT_MEMORY);
      saveToLocal(DEFAULT_MEMORY);
      return { ...DEFAULT_MEMORY };
    }
  } catch (error) {
    console.error("[Memory] Firestore loadMemory failed, using localStorage:", error);
    return loadFromLocal();
  }
};

/**
 * Update a specific field in memory (name or preferences).
 */
export const updateMemory = async (field, value) => {
  try {
    const ref = doc(db, USER_DOC_PATH);
    await updateDoc(ref, { [field]: value });

    // Also update localStorage
    const local = loadFromLocal();
    local[field] = value;
    saveToLocal(local);

    console.log(`[Memory] Updated ${field} →`, value);
    return true;
  } catch (error) {
    console.error("[Memory] Firestore updateMemory failed:", error);
    // Fallback: update localStorage only
    const local = loadFromLocal();
    local[field] = value;
    saveToLocal(local);
    return false;
  }
};

/**
 * Append a conversation entry to history. Trims to last 10 messages.
 */
export const saveHistory = async (userMsg, aiResponse) => {
  const entry = {
    user: userMsg,
    ai: aiResponse,
    timestamp: new Date().toISOString(),
  };

  try {
    const ref = doc(db, USER_DOC_PATH);

    // Append using arrayUnion
    await updateDoc(ref, {
      history: arrayUnion(entry),
    });

    // Trim to last 10 entries
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (data.history && data.history.length > 10) {
        const trimmed = data.history.slice(-10);
        await updateDoc(ref, { history: trimmed });
      }
    }

    // Update localStorage
    const local = loadFromLocal();
    local.history.push(entry);
    if (local.history.length > 10) {
      local.history = local.history.slice(-10);
    }
    saveToLocal(local);

    return true;
  } catch (error) {
    console.error("[Memory] Firestore saveHistory failed:", error);
    // Fallback: save to localStorage only
    const local = loadFromLocal();
    local.history.push(entry);
    if (local.history.length > 10) {
      local.history = local.history.slice(-10);
    }
    saveToLocal(local);
    return false;
  }
};
