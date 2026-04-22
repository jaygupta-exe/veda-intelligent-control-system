import { useState, useRef, useCallback, useEffect } from 'react';

const useSpeechRecognition = (shouldIgnore = false) => {
  const [listening, setListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [transcriptLines, setTranscriptLines] = useState([
    { id: 0, type: 'system', text: 'V.E.D.A TERMINAL v4.05 — AWAITING VOICE INPUT...' },
    { id: 1, type: 'system', text: 'Click the orb to activate microphone.' },
  ]);
  
  const recognitionRef = useRef(null);
  const transcriptIdRef = useRef(2);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isIntentionalStopRef = useRef(false);
  const isRestartingRef = useRef(false);
  const [volume, setVolume] = useState(0);
  const [availableMics, setAvailableMics] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [activeMicName, setActiveMicName] = useState("Default");

  // CRITICAL: Use a ref for shouldIgnore to avoid closure capture in event listeners
  const shouldIgnoreRef = useRef(shouldIgnore);
  const wasListeningBeforeMuteRef = useRef(false);

  // NUCLEAR ECHO FIX: Physically stop/start recognition when shouldIgnore changes
  useEffect(() => {
    const prev = shouldIgnoreRef.current;
    shouldIgnoreRef.current = shouldIgnore;

    if (shouldIgnore && !prev && recognitionRef.current) {
      // V.E.D.A started speaking → STOP recognition engine
      wasListeningBeforeMuteRef.current = true;
      isRestartingRef.current = true; // Block onend from also restarting
      try { recognitionRef.current.abort(); } catch(e) {}
      console.log("[Echo] Recognition STOPPED (Veda speaking)");
    } else if (!shouldIgnore && prev && wasListeningBeforeMuteRef.current) {
      // V.E.D.A finished speaking → RESTART recognition engine
      wasListeningBeforeMuteRef.current = false;
      // Use longer delay to ensure abort's onend has fully fired first
      setTimeout(() => {
        isRestartingRef.current = false;
        if (recognitionRef.current && !isIntentionalStopRef.current && !shouldIgnoreRef.current) {
          try { 
            recognitionRef.current.start(); 
            console.log("[Echo] Recognition RESTARTED (Veda done)");
          } catch(e) {
            console.warn("[Echo] Restart failed, retrying...", e.message);
            // Retry once more after a short delay
            setTimeout(() => {
              if (recognitionRef.current && !isIntentionalStopRef.current) {
                try { recognitionRef.current.start(); } catch(e2) {}
              }
            }, 500);
          }
        }
      }, 600);
    }
  }, [shouldIgnore]);

  const enumerateMics = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(device => device.kind === 'audioinput');
      setAvailableMics(mics);
      
      // If we have a selected ID, update the active name
      if (selectedMicId) {
        const active = mics.find(m => m.deviceId === selectedMicId);
        if (active) setActiveMicName(active.label || "Selected Microphone");
      } else if (mics.length > 0) {
        setActiveMicName(mics[0].label || "Default Microphone");
      }
    } catch (err) {
      console.error("[Speech] Failed to enumerate devices:", err);
    }
  }, [selectedMicId]);

  useEffect(() => {
    enumerateMics();
    // Listen for device changes (plugging/unplugging)
    navigator.mediaDevices.addEventListener('devicechange', enumerateMics);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateMics);
  }, [enumerateMics]);

  const stopListening = useCallback(() => {
    isIntentionalStopRef.current = true;
    setIsSpeaking(false);
    setVolume(0);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    setTranscriptLines(prev => [...prev.slice(-49), { id: transcriptIdRef.current++, type: 'system', text: '--- LINK TERMINATED ---' }]);
    setInterimText("");
    setListening(false);
  }, []);

  const startListening = async () => {
    if (listening) return;
    isIntentionalStopRef.current = false;
    try {
      // NEW robust constraints for internal microphones
      const constraints = { 
        audio: {
          deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1, // Mono is better for speech recognition
        } 
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      // Re-enumerate to get labels if they were missing
      enumerateMics();

      setTranscriptLines(prev => [...prev.slice(-99), { id: transcriptIdRef.current++, type: 'system', text: '--- SECURE LINK ESTABLISHED ---' }]);
      setTranscriptLines(prev => [...prev.slice(-99), { id: transcriptIdRef.current++, type: 'system', text: `[AUDIO] Stream Calibrated on "${activeMicName}".` }]);

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let silenceCounter = 0;
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Diagnostic: If we get absolute silence for too long, notify user
        if (average < 1) {
          silenceCounter++;
          if (silenceCounter === 100) { // Approx 1.5 seconds of silence
             console.warn("[System] Absolute silence detected on mic stream.");
             setTranscriptLines(prev => [...prev.slice(-49), { id: transcriptIdRef.current++, type: 'system', text: '[WARN] Low input detected. Please check if Mic is physically muted.' }]);
          }
        } else {
          silenceCounter = 0;
        }

        const normalizedVolume = Math.min(1, (average / 128) * 2.5);
        setVolume(normalizedVolume);
        
        if (micStreamRef.current) {
          requestAnimationFrame(updateVolume);
        }
      };
      updateVolume();

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true; 
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; 
        
        recognition.onstart = () => {
          console.log("[Speech] Engine Ready...");
          setTranscriptLines(prev => [...prev.slice(-99), { id: transcriptIdRef.current++, type: 'system', text: '[AUDIO] Engine Online — Waiting for voice commands...' }]);
        };

        recognition.onsoundstart = () => {
          setIsSpeaking(true);
          console.log("[Speech] Sound detected...");
        };
        
        recognition.onspeechstart = () => {
          console.log("[Speech] Human speech detected...");
        };

        recognition.onspeechend = () => {
          setIsSpeaking(false);
        };
        recognition.onsoundend = () => setIsSpeaking(false);
        recognition.onspeechstart = () => setIsSpeaking(true);
        recognition.onspeechend = () => setIsSpeaking(false);

        recognition.onresult = (event) => {
          // Secondary guard: if somehow a result leaks through, block it
          if (shouldIgnoreRef.current) {
            return;
          }

          let finalTranscript = '';
          let currentInterim = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
               finalTranscript += transcript + ' ';
            } else {
               currentInterim += transcript;
            }
          }
          
          setInterimText(currentInterim);
          
          if (finalTranscript.trim()) {
            const now = new Date();
            const ts = now.toTimeString().split(' ')[0];
            setTranscriptLines(prev => [
              ...prev.slice(-49),
              { id: transcriptIdRef.current++, type: 'user', text: finalTranscript.trim(), time: ts }
            ]);
            setInterimText("");
          }
        };
        
        recognition.onend = () => {
          setIsSpeaking(false);
          setInterimText("");
          
          if (isIntentionalStopRef.current) return;
          // Don't restart if Veda is currently speaking
          if (shouldIgnoreRef.current) return;
          // Don't restart if echo-cancel is handling the restart
          if (isRestartingRef.current) {
            console.log("[Speech] onend skipped — echo-cancel managing restart");
            return;
          }

          if (recognitionRef.current) {
            setTimeout(() => {
              if (recognitionRef.current && !isIntentionalStopRef.current && !shouldIgnoreRef.current && !isRestartingRef.current) {
                try { 
                  recognitionRef.current.start(); 
                  console.log("[Speech] Auto-restarted after onend");
                } catch(e) {
                  console.warn("[Speech] Auto-restart failed:", e.message);
                }
              }
            }, 500);
          }
        };
        
        recognition.onerror = (e) => {
           setIsSpeaking(false);
           // Suppress expected errors: no-speech and aborted (from echo fix)
           if (e.error === 'no-speech' || e.error === 'aborted') return;
           
           const errorMsg = `[ERR] ${e.error}${e.message ? ': ' + e.message : ''}`;
           setTranscriptLines(prev => [...prev.slice(-49), { id: transcriptIdRef.current++, type: 'error', text: errorMsg }]);

           if (e.error === 'audio-capture' || e.error === 'not-allowed') {
             stopListening();
           }
        };
        
        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e) {}
      }
      
      setListening(true);
    } catch (err) { 
      setTranscriptLines(prev => [...prev.slice(-49), { id: transcriptIdRef.current++, type: 'error', text: `[SYS] Microphone access denied.` }]);
      setListening(false);
      setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (listening) stopListening();
    else startListening();
  };

  return {
    listening,
    isSpeaking,
    interimText,
    transcriptLines,
    volume,
    availableMics,
    selectedMicId,
    setSelectedMicId,
    activeMicName,
    toggleListening,
    setTranscriptLines
  };
};

export default useSpeechRecognition;
