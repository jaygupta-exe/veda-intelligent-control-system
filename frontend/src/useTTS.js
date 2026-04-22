import { useState, useCallback, useEffect, useRef } from 'react';

export const useTTS = () => {
  const synthRef = useRef(window.speechSynthesis);
  const voicesRef = useRef([]);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      voicesRef.current = synthRef.current.getVoices();
    };
    updateVoices();
    if (synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = updateVoices;
    }
  }, []);

  const speak = useCallback((text) => {
    if (!text) return;

    // CRITICAL: Set speaking state to true IMMEDIATELY to mute mic during prep/processing gap
    setIsAssistantSpeaking(true);

    // Cancel any ongoing speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onstart = () => setIsAssistantSpeaking(true);
    utterance.onend = () => setIsAssistantSpeaking(false);
    utterance.onerror = () => setIsAssistantSpeaking(false);

    // Find a high-quality "humanoid" voice (Natural/Neural/Google)
    const voiceList = voicesRef.current;
    
    // 1. First priority: Specifically requested high-quality Hindi voices
    const premiumHindiVoices = [
      "Google हिन्दी",
      "Microsoft Hemant",
      "Microsoft Kalpana",
      "Microsoft Hemant Online",
      "Microsoft Kalpana Online",
      "Hindi India"
    ];

    let selectedVoice = null;
    
    // Try to find a premium Hindi voice by name
    for (const name of premiumHindiVoices) {
      selectedVoice = voiceList.find(v => v.name.includes(name));
      if (selectedVoice) break;
    }

    // 2. Second priority: Any voice with 'hi' (Hindi) language code
    if (!selectedVoice) {
      selectedVoice = voiceList.find(v => v.lang.startsWith("hi"));
    }

    // 3. Third priority: Known good English voices (for Hinglish)
    if (!selectedVoice) {
      const preferredEnglish = ["Microsoft Aria Online", "Google US English", "Microsoft Guy Online"];
      for (const name of preferredEnglish) {
        selectedVoice = voiceList.find(v => v.name.includes(name));
        if (selectedVoice) break;
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      // If it's a Hindi voice, we might want to slow it down slightly for clarity
      if (selectedVoice.lang.startsWith("hi")) {
        utterance.rate = 1.05; // Slightly faster but natural
        utterance.pitch = 0.95; // Slightly deeper for better presence
      } else {
        utterance.rate = 0.95; // Slightly slower if it's an English voice trying to read Hindi
      }
    } else {
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
    }

    utterance.volume = 1.0;

    synthRef.current.speak(utterance);
  }, []);

  return { speak, isAssistantSpeaking };
};
