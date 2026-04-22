import { useEffect, useRef, useCallback } from 'react';

export const useClapDetector = ({ onDoubleClap }) => {
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const reqFrameRef = useRef(null);
  
  const lastClapTimeRef = useRef(0);
  const ignoreClapsUntilRef = useRef(0);
  const isHighRef = useRef(false);

  const startDetection = useCallback(async () => {
    if (audioContextRef.current) return; // Already running
    
    try {
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

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

      const CLAP_THRESHOLD = 45;    // Minimum volume average to be considered a clap
      const DOUBLE_CLAP_MIN = 150;  // Min ms between claps
      const DOUBLE_CLAP_MAX = 1200; // Max ms between claps (must be fast)

      const monitorAudio = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const averageVolume = sum / bufferLength;

        const now = Date.now();

        if (averageVolume > CLAP_THRESHOLD) {
          if (!isHighRef.current && now > ignoreClapsUntilRef.current) {
            // SPURT DETECTED!
            isHighRef.current = true;
            
            const timeSinceLastClap = now - lastClapTimeRef.current;
            
            if (timeSinceLastClap > DOUBLE_CLAP_MIN && timeSinceLastClap < DOUBLE_CLAP_MAX) {
              // DOUBLE CLAP DETECTED!
              console.log("[ClapDetector] DOUBLE CLAP DETECTED!");
              ignoreClapsUntilRef.current = now + 1500; // Ignore further claps for 1.5s
              lastClapTimeRef.current = 0; // Reset
              
              if (onDoubleClap) onDoubleClap();
            } else {
              // Register as first clap
              lastClapTimeRef.current = now;
            }
          }
        } else if (averageVolume < CLAP_THRESHOLD - 10) {
          // Volume dropped back down
          isHighRef.current = false;
        }

        reqFrameRef.current = requestAnimationFrame(monitorAudio);
      };

      monitorAudio();
      console.log("[ClapDetector] Ambient Double Clap Listener Started.");

    } catch (err) {
      console.warn("[ClapDetector] Could not start ambient listener. Permissions maybe denied or no mic.", err);
    }
  }, [onDoubleClap]);

  const stopDetection = useCallback(() => {
    if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  return { startDetection, stopDetection };
};
