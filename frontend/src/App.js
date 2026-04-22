import React, { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import useSpeechRecognition from './useSpeechRecognition';
import { useVision } from './useVision';
import { useAssistant } from './useAssistant';
import { useTTS } from './useTTS';
import { useMemory } from './useMemory';
import { useClapDetector } from './useClapDetector';
import VisionAI from './VisionAI';
import Terminal from "./Terminal";

// Utility: hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 245, g: 158, b: 11 };
}

const COLOR_PRESETS = {
  'Solaris Gold': { primary: '#f59e0b', secondary: '#fbbf24', accent: '#ef4444' },
  'Neon Cyan': { primary: '#06b6d4', secondary: '#22d3ee', accent: '#8b5cf6' },
  'Plasma Green': { primary: '#10b981', secondary: '#34d399', accent: '#f59e0b' },
  'Crimson Fire': { primary: '#ef4444', secondary: '#f87171', accent: '#f59e0b' },
  'Violet Storm': { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#ec4899' },
  'Ice Blue': { primary: '#3b82f6', secondary: '#60a5fa', accent: '#06b6d4' },
};

const App = () => {
  const canvasRef = useRef(null);
  const wavePathRef = useRef(null);
  const [timeString, setTimeString] = useState("00:00:00");
  const [activePanel, setActivePanel] = useState(null);
  const [booting, setBooting] = useState(true);
  const [pulseRings, setPulseRings] = useState([]);
  const pulseTimerRef = useRef(null);

  // Boot sequence — auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 4000);
    return () => clearTimeout(timer);
  }, []);


  // 3D Tilt handler
  const handleTilt = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12;
    card.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${y}deg)`;
    const shine = card.querySelector('.tilt-shine');
    if (shine) shine.style.background = `radial-gradient(circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(255,255,255,0.08) 0%, transparent 60%)`;
  }, []);

  const handleTiltReset = useCallback((e) => {
    e.currentTarget.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg)';
  }, []);

  // --- CUSTOM HOOKS ---
  const { memory, memoryLoaded, updateField, saveConversation, buildMemoryContext } = useMemory();
  const { getResponse, isProcessing, forceWakeSession } = useAssistant({ memory, updateField, saveConversation, buildMemoryContext });
  const { speak, isAssistantSpeaking } = useTTS();
  const {
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
  } = useSpeechRecognition(isAssistantSpeaking || isProcessing);

  const { preloadModels, visionStatus } = useVision();

  // Preload Vision Models on Boot
  useEffect(() => {
    preloadModels();
  }, [preloadModels]);


  // --- AMBIENT CLAP DETECTOR ---
  const handleDoubleClap = useCallback(() => {
    setTranscriptLines(prev => [...prev.slice(-99), { id: Date.now(), type: 'system', text: '[SYS] DOUBLE CLAP WAKE WORD DETECTED. SYSTEM ACTIVE.' }]);
    
    // Always force wake session so it accepts immediate commands
    if (forceWakeSession) forceWakeSession();
    speak("Yes Boss, Veda active.");

    if (!listening) {
      toggleListening();
    }
  }, [listening, toggleListening, forceWakeSession, speak, setTranscriptLines]);

  const { startDetection } = useClapDetector({ onDoubleClap: handleDoubleClap });

  useEffect(() => {
    // Attempt auto-start on load to listen for claps in the background
    startDetection();
  }, [startDetection]);

  // Pulse rings when listening
  useEffect(() => {
    if (listening) {
      pulseTimerRef.current = setInterval(() => {
        setPulseRings(prev => [...prev.slice(-4), Date.now()]);
      }, 1800);
    } else {
      clearInterval(pulseTimerRef.current);
    }
    return () => clearInterval(pulseTimerRef.current);
  }, [listening]);

  const lastProcessedTranscript = useRef("");

  const [colors, setColors] = useState({
    primary: '#f59e0b', secondary: '#fbbf24', accent: '#ef4444',
  });

  // Keep refs for animation loops
  const colorsRef = useRef(colors);
  useEffect(() => { colorsRef.current = colors; }, [colors]);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Simulated wobble based on 'isSpeaking'
  // --- VOX AGENT PIPELINE ---
  useEffect(() => {
    const lastLine = transcriptLines[transcriptLines.length - 1];
    if (lastLine && lastLine.type === 'user' && lastLine.text !== lastProcessedTranscript.current) {
      lastProcessedTranscript.current = lastLine.text;
      
      const processResponse = async () => {
         const response = await getResponse(lastLine.text);
         if (response) {
           setTranscriptLines(prev => [
             ...prev.slice(-99),
             { id: Date.now(), type: 'assistant', text: response, time: new Date().toLocaleTimeString().split(' ')[0] }
           ]);
           speak(response);
         }
      };
      processResponse();
    }
  }, [transcriptLines, getResponse, speak, setTranscriptLines]);



  // --- CLOCK ---
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeString(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`);
    };
    updateClock(); const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  // --- PARTICLES (uses colorsRef for dynamic color) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animationFrameId; let particles = [];
    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2; this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5; this.opacity = Math.random();
      }
      update() { this.x += this.speedX; this.y += this.speedY; if (this.x < 0 || this.x > canvas.width) this.speedX *= -1; if (this.y < 0 || this.y > canvas.height) this.speedY *= -1; }
      draw(ctx, rgb) {
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.opacity})`;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    const initParticles = () => { resize(); particles = []; for (let i = 0; i < 60; i++) particles.push(new Particle()); };
    const animate = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); const rgb = hexToRgb(colorsRef.current.primary); particles.forEach(p => { p.update(); p.draw(ctx, rgb); }); animationFrameId = requestAnimationFrame(animate); };
    initParticles(); animate(); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animationFrameId); };
  }, []);

  // --- WAVEFORM ---
  useEffect(() => {
    const wavePath = wavePathRef.current;
    if (!wavePath) return;
    let phase = 0; let rafId;
    const animateWave = () => {
      const lv = volumeRef.current; 
      phase += 0.15 + lv * 0.3;
      let d = ""; const cx = 100, cy = 100, br = 80;
      for (let i = 0; i <= 360; i += 2) {
        const a = (i * Math.PI) / 180;
        const n = Math.sin(phase + i * 0.08) * (6 + lv * 10) + Math.cos(phase * 0.8 + i * 0.15) * (4 + lv * 6) + Math.sin(phase * 2) * (2 + lv * 4);
        const r = br + n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        d += i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
      }
      d += "Z"; wavePath.setAttribute("d", d);
      rafId = requestAnimationFrame(animateWave);
    };
    rafId = requestAnimationFrame(animateWave);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const blobScale = 1 + volume * 0.4;
  const signalPct = listening ? "98%" : "92%";
  const statusColor = listening ? "text-green-400" : "text-orange-400";
  const handleNavClick = useCallback((panel) => { setActivePanel(prev => prev === panel ? null : panel); }, []);

  // Helper for rgba from hex
  const rgba = (hex, alpha) => { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${alpha})`; };

  // --- OVERLAY PANELS ---
  const renderOverlay = () => {
    if (!activePanel) return null;
    const closeBtn = (
      <button onClick={() => setActivePanel(null)} className="absolute top-4 right-4 font-orbitron text-xs hover:opacity-100 opacity-60 transition-opacity" style={{ color: colors.primary }}>
        ✕ CLOSE
      </button>
    );
    const overlayBg = { backgroundColor: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)' };
    const panelBorder = { border: `1px solid ${rgba(colors.primary, 0.2)}`, boxShadow: `0 0 40px ${rgba(colors.primary, 0.08)}, inset 0 0 40px ${rgba(colors.primary, 0.03)}` };

    if (activePanel === 'vision') {
      return (
        <div className="absolute inset-4 z-50 rounded-2xl overflow-hidden panel-glitch bg-black/95">
          <VisionAI 
            colors={colors} 
            speak={speak} 
            userName={memory?.name || ''} 
          />
          {closeBtn}
        </div>
      );
    }

    if (activePanel === 'settings') {
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={overlayBg}>
          <div className="relative w-full max-w-2xl p-8 rounded-2xl" style={panelBorder}>
            {closeBtn}
            <h2 className="font-orbitron text-2xl tracking-widest mb-8" style={{ color: colors.secondary, textShadow: `0 0 10px ${rgba(colors.primary, 0.5)}` }}>⚙ SETTINGS</h2>
            <div className="mb-8">
              <h3 className="font-orbitron text-xs tracking-widest mb-4" style={{ color: rgba(colors.primary, 0.6) }}>COLOR PRESETS</h3>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(COLOR_PRESETS).map(([name, preset]) => (
                  <button key={name} onClick={() => setColors(preset)}
                    className="p-3 rounded-xl text-left transition-all duration-300 hover:scale-105"
                    style={{ border: `1px solid ${rgba(preset.primary, 0.25)}`, backgroundColor: colors.primary === preset.primary ? rgba(preset.primary, 0.13) : 'rgba(255,255,255,0.02)', boxShadow: colors.primary === preset.primary ? `0 0 20px ${rgba(preset.primary, 0.2)}` : 'none' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary, boxShadow: `0 0 8px ${preset.primary}` }} />
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.secondary }} />
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.accent }} />
                    </div>
                    <span className="font-orbitron text-[10px]" style={{ color: preset.primary }}>{name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <h3 className="font-orbitron text-xs tracking-widest mb-4" style={{ color: rgba(colors.primary, 0.6) }}>CUSTOM COLORS</h3>
              <div className="flex gap-8">
                {[{ label: 'PRIMARY', key: 'primary' }, { label: 'SECONDARY', key: 'secondary' }, { label: 'ACCENT', key: 'accent' }].map(({ label, key }) => (
                  <div key={key} className="flex flex-col items-center gap-2">
                    <label className="font-orbitron text-[9px] tracking-widest" style={{ color: rgba(colors.primary, 0.4) }}>{label}</label>
                    <div className="relative">
                      <input type="color" value={colors[key]} onChange={e => setColors(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-12 h-12 rounded-lg cursor-pointer border-2" style={{ borderColor: rgba(colors[key], 0.4), backgroundColor: 'transparent' }} />
                      <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ boxShadow: `0 0 15px ${rgba(colors[key], 0.25)}` }} />
                    </div>
                    <span className="font-mono text-[9px]" style={{ color: rgba(colors.primary, 0.3) }}>{colors[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-orbitron text-xs tracking-widest mb-4" style={{ color: rgba(colors.primary, 0.6) }}>AUDIO CONFIGURATION</h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="font-orbitron text-[10px] tracking-widest" style={{ color: rgba(colors.primary, 0.4) }}>SELECT MICROPHONE</label>
                  <select 
                    value={selectedMicId} 
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    className="w-full bg-black/60 border p-3 rounded-xl font-exo text-sm appearance-none cursor-pointer focus:outline-none transition-all"
                    style={{ 
                      borderColor: rgba(colors.primary, 0.2), 
                      color: '#f1f5f9',
                      boxShadow: `0 0 15px ${rgba(colors.primary, 0.05)}`
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#111', color: '#f1f5f9' }}>Default System Microphone</option>
                    {availableMics.map(mic => (
                      <option key={mic.deviceId} value={mic.deviceId} style={{ backgroundColor: '#111', color: '#f1f5f9' }}>
                        {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] italic" style={{ color: rgba(colors.primary, 0.3) }}>
                    Tip: If V.E.D.A can't hear you, try selecting your "Realtek Audio" microphone instead of "Virtual Cable".
                  </p>
                </div>
              </div>
            </div>
            <button onClick={() => setColors(COLOR_PRESETS['Solaris Gold'])}
              className="font-orbitron text-[10px] tracking-widest px-6 py-2 rounded-full transition-all duration-300 hover:scale-105"
              style={{ border: `1px solid ${rgba(colors.primary, 0.25)}`, color: colors.primary, backgroundColor: rgba(colors.primary, 0.06) }}>
              ↻ RESET TO DEFAULT
            </button>
          </div>
        </div>
      );
    }

    if (activePanel === 'about') {
      const team = [
        { name: 'Priyanka', role: 'Frontend UI Designer', desc: 'Crafting the holographic future of UX & interface design.',
          icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
        },
        { name: 'Jay Parkash', role: 'AI / ML Engineer', desc: 'Expert in deep learning & neural network optimization.',
          icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
        },
        { name: 'Vikas', role: 'Systems Architect', desc: 'Optimizing core compute & system architecture.',
          icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" /></svg>
        },
      ];
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={overlayBg}>
          <div className="relative w-full max-w-5xl flex flex-col overflow-hidden rounded-xl shadow-2xl"
            style={{ background: rgba(colors.primary, 0.04), backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.3)}` }}>

            {/* Header */}
            <header className="relative px-6 pt-8 pb-6" style={{ borderBottom: `1px solid ${rgba(colors.primary, 0.2)}` }}>
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3" style={{ color: colors.primary }}>
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" /></svg>
                    <h2 className="font-orbitron text-3xl font-black tracking-tighter uppercase italic" style={{ color: '#f1f5f9' }}>About V.E.D.A</h2>
                  </div>
                  <p className="text-sm font-medium tracking-widest uppercase" style={{ color: rgba(colors.primary, 0.8) }}>Virtual Enhanced Digital Assistant — Advanced AI System</p>
                  <div className="mt-2" style={{ height: '2px', width: '8rem', backgroundColor: colors.primary, boxShadow: `0 0 8px ${colors.primary}` }} />
                </div>
                <button onClick={() => setActivePanel(null)}
                  className="p-2 rounded-lg transition-all"
                  style={{ backgroundColor: rgba(colors.primary, 0.1), border: `1px solid ${rgba(colors.primary, 0.2)}`, color: colors.primary }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </header>

            {/* Scrollable Content */}
            <div className="p-6 md:p-10 space-y-12 overflow-y-auto" style={{ maxHeight: '65vh', willChange: 'transform', transform: 'translateZ(0)', WebkitOverflowScrolling: 'touch' }}>
              {/* Description & Mission */}
              <div className="grid md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <h3 className="font-orbitron text-xs font-bold tracking-[0.3em] uppercase" style={{ color: colors.primary }}>Core Protocol</h3>
                  <p className="text-lg leading-relaxed font-light" style={{ color: '#cbd5e1' }}>
                    V.E.D.A is a next-generation neural operating system designed for <span className="font-medium" style={{ color: colors.primary }}>seamless human-AI integration</span>, utilizing advanced heuristic logic and real-time processing to redefine the digital interface.
                  </p>
                </div>
                <div className="space-y-4 pl-10" style={{ borderLeft: `1px solid ${rgba(colors.primary, 0.1)}` }}>
                  <h3 className="font-orbitron text-xs font-bold tracking-[0.3em] uppercase" style={{ color: colors.primary }}>Our Mission</h3>
                  <p className="text-base leading-relaxed" style={{ color: '#cbd5e1' }}>
                    To architect a future where intelligence is ubiquitous and friction-less. We build tools that don't just process data, but understand intent, context, and the nuance of human creativity.
                  </p>
                </div>
              </div>

              {/* HUD Line */}
              <div style={{ height: '1px', width: '100%', background: `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`, opacity: 0.3 }} />

              {/* Team Grid */}
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="font-orbitron text-xl font-bold" style={{ color: '#f1f5f9' }}>Neural Engineering Collective</h3>
                  <span className="font-mono text-xs uppercase tracking-widest" style={{ color: rgba(colors.primary, 0.4) }}>Architects_v4.05</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {team.map(member => (
                    <div key={member.name}
                      className="group relative p-6 rounded-xl transition-all duration-300 hover:-translate-y-1"
                      style={{ background: rgba(colors.primary, 0.04), backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.2)}`, boxShadow: `0 0 15px ${rgba(colors.primary, 0.08)}` }}>
                      <div className="flex flex-col items-center text-center gap-4">
                        {/* Profile Ring */}
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full transition-transform group-hover:scale-110" style={{ border: `1px solid ${colors.primary}`, boxShadow: `0 0 10px ${colors.primary}`, opacity: 0.5 }} />
                          <div className="w-20 h-20 rounded-full flex items-center justify-center p-1" style={{ border: `2px solid ${rgba(colors.primary, 0.2)}` }}>
                            <div className="w-full h-full rounded-full flex items-center justify-center text-2xl font-bold"
                              style={{ backgroundColor: rgba(colors.primary, 0.15), color: colors.secondary }}>
                              {member.name[0]}
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: '#f1f5f9' }}>{member.name}</p>
                          <p className="text-xs font-medium mb-2" style={{ color: colors.primary }}>{member.role}</p>
                          <p className="text-xs leading-tight" style={{ color: rgba(colors.primary, 0.5) }}>{member.desc}</p>
                        </div>
                        <div className="flex gap-3" style={{ color: rgba(colors.primary, 0.4) }}>
                          {member.icon}
                          <svg className="w-5 h-5 cursor-pointer transition-colors" style={{ color: rgba(colors.primary, 0.4) }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Info HUD */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                {[
                  { label: 'System Version', value: 'V.E.D.A v4.05' },
                  { label: 'Neural Engine', value: 'Solaris AI v.Alpha' },
                  { label: 'Deployment Year', value: '2026_CYC' },
                  { label: 'Node Status', value: 'OPTIMIZED', live: true },
                ].map(info => (
                  <div key={info.label} className="p-4 rounded-lg flex flex-col items-center justify-center text-center"
                    style={{ backgroundColor: rgba(colors.primary, 0.05), border: `1px solid ${rgba(colors.primary, 0.1)}` }}>
                    <span className="text-[10px] uppercase font-bold tracking-tighter" style={{ color: colors.primary }}>{info.label}</span>
                    <div className="flex items-center gap-2">
                      {info.live && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />}
                      <span className="font-mono font-bold" style={{ color: '#f1f5f9' }}>{info.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <footer className="px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-2"
              style={{ backgroundColor: rgba(colors.primary, 0.06), borderTop: `1px solid ${rgba(colors.primary, 0.2)}` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: rgba(colors.primary, 0.45) }}>Powered by Advanced AI Systems © 2026</p>
              <div className="flex gap-4 items-center">
                <div className="font-mono text-[10px]" style={{ color: rgba(colors.primary, 0.3) }}>LATENCY: 14MS</div>
                <div className="h-1 w-20 rounded-full overflow-hidden" style={{ backgroundColor: rgba(colors.primary, 0.13) }}>
                  <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: colors.primary }} />
                </div>
              </div>
            </footer>
          </div>
        </div>
      );
    }

    if (activePanel === 'dashboard') {
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={overlayBg}>
          <div className="relative w-full max-w-3xl p-8 rounded-2xl" style={panelBorder}>
            {closeBtn}
            <h2 className="font-orbitron text-2xl tracking-widest mb-6" style={{ color: colors.secondary, textShadow: `0 0 10px ${rgba(colors.primary, 0.5)}` }}>◈ DASHBOARD</h2>
            <div className="grid grid-cols-3 gap-4">
              {[{ label: 'CORE TEMP', value: `${Math.round(54 + volume * 10)}°C`, sub: 'NOMINAL' }, { label: 'DATA FLOW', value: listening ? '8.4 GB/s' : '6.9 GB/s', sub: 'ACTIVE' }, { label: 'THREADS', value: '128', sub: 'SYNCHRONIZED' }, { label: 'MEMORY', value: '94.2%', sub: 'ALLOCATED' }, { label: 'UPTIME', value: '72:14:33', sub: 'CONTINUOUS' }, { label: 'LATENCY', value: '0.4ms', sub: 'OPTIMAL' }].map(stat => (
                <div key={stat.label} className="p-4 rounded-xl" style={{ border: `1px solid ${rgba(colors.primary, 0.13)}`, backgroundColor: rgba(colors.primary, 0.03) }}>
                  <p className="font-orbitron text-[9px] tracking-widest mb-2" style={{ color: rgba(colors.primary, 0.4) }}>{stat.label}</p>
                  <p className="font-orbitron text-xl" style={{ color: colors.secondary }}>{stat.value}</p>
                  <p className="font-exo text-[9px] mt-1" style={{ color: rgba(colors.primary, 0.25) }}>{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activePanel === 'analytics') {
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={overlayBg}>
          <div className="relative w-full max-w-2xl p-8 rounded-2xl" style={panelBorder}>
            {closeBtn}
            <h2 className="font-orbitron text-2xl tracking-widest mb-6" style={{ color: colors.secondary, textShadow: `0 0 10px ${rgba(colors.primary, 0.5)}` }}>◉ ANALYTICS</h2>
            <div className="space-y-4">
              {[{ label: 'VOICE COMMANDS PROCESSED', pct: 87 }, { label: 'AI RESPONSE ACCURACY', pct: 96 }, { label: 'SYSTEM EFFICIENCY', pct: 92 }, { label: 'NEURAL NETWORK LOAD', pct: 64 }].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between mb-1">
                    <span className="font-orbitron text-[10px] tracking-widest" style={{ color: rgba(colors.primary, 0.45) }}>{item.label}</span>
                    <span className="font-orbitron text-[10px]" style={{ color: colors.secondary }}>{item.pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: rgba(colors.primary, 0.06) }}>
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${item.pct}%`, backgroundColor: colors.primary, boxShadow: `0 0 10px ${rgba(colors.primary, 0.4)}` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activePanel === 'neural') {
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={overlayBg}>
          <div className="relative w-full max-w-2xl p-8 rounded-2xl" style={panelBorder}>
            {closeBtn}
            <h2 className="font-orbitron text-2xl tracking-widest mb-6" style={{ color: colors.secondary, textShadow: `0 0 10px ${rgba(colors.primary, 0.5)}` }}>⟁ NEURAL LINK</h2>
            <div className="flex flex-col items-center gap-6">
              <div className="w-32 h-32 rounded-full flex items-center justify-center animate-pulse" style={{ border: `2px solid ${rgba(colors.primary, 0.25)}`, boxShadow: `0 0 30px ${rgba(colors.primary, 0.13)}` }}>
                <span className="font-orbitron text-xl" style={{ color: colors.secondary }}>{listening ? 'LINKED' : 'IDLE'}</span>
              </div>
              <p className="font-exo text-sm text-center max-w-md" style={{ color: rgba(colors.primary, 0.45) }}>
                Neural Link establishes a direct cognitive bridge between the user and V.E.D.A's core intelligence. Click the orb to activate.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                {[{ label: 'STATUS', value: listening ? 'ACTIVE' : 'STANDBY', vColor: listening ? '#4ade80' : colors.secondary }, { label: 'SIGNAL', value: listening ? '98%' : '—', vColor: colors.secondary }].map(s => (
                  <div key={s.label} className="p-3 rounded-xl text-center" style={{ border: `1px solid ${rgba(colors.primary, 0.13)}`, backgroundColor: rgba(colors.primary, 0.03) }}>
                    <p className="font-orbitron text-[9px]" style={{ color: rgba(colors.primary, 0.4) }}>{s.label}</p>
                    <p className="font-orbitron text-sm" style={{ color: s.vColor }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Floating HUD data elements
  const floatingData = [
    { text: 'CORE_TEMP: 54°C', style: { top: '22%', left: '3%' } },
    { text: 'BANDWIDTH: 8.4 Gb/s', style: { top: '75%', right: '2%' } },
    { text: 'NEURAL_SYNC: 99.2%', style: { bottom: '18%', left: '5%' } },
    { text: 'QUANTUM_FLUX: STABLE', style: { top: '50%', right: '1%' } },
    { text: 'ENCRYPT: AES-512', style: { bottom: '8%', right: '8%' } },
  ];

  return (
    <div className="h-screen relative flex flex-col items-center p-3 overflow-hidden">
      {/* BOOT SEQUENCE OVERLAY */}
      {booting && (
        <div className="boot-overlay" style={{ color: colors.primary }}>
          <div className="boot-text" style={{ color: colors.secondary }}>V.E.D.A INITIALIZING...</div>
          <div className="boot-progress-track">
            <div className="boot-progress-bar" style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})` }} />
          </div>
          <div className="boot-status" style={{ color: colors.primary }}>▸ NEURAL ENGINE: ONLINE</div>
          <div className="boot-status" style={{ color: colors.primary }}>▸ VOICE MATRIX: CALIBRATED</div>
          <div className="boot-status" style={{ color: colors.primary }}>▸ HOLOGRAPHIC DISPLAY: ACTIVE</div>
          <div className="boot-status" style={{ color: colors.accent }}>▸ SYSTEM READY — WELCOME, BOSS</div>
        </div>
      )}

      {/* HEX GRID BACKGROUND */}
      <div className="hex-grid" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='${encodeURIComponent(colors.primary)}' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />

      {/* FLOATING HUD DATA */}
      {floatingData.map((item, i) => (
        <div key={i} className="floating-hud" style={{ ...item.style, color: colors.primary }}>{item.text}</div>
      ))}

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full opacity-40" />
      </div>
      <div className="scanline" />

      {/* Header */}
      <header className="relative z-10 w-full flex justify-between items-center px-8 pb-3" style={{ borderBottom: `1px solid ${rgba(colors.primary, 0.06)}` }}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 animate-pulse rounded-full" style={{ backgroundColor: colors.primary, boxShadow: `0 0 8px ${colors.primary}` }} />
            <h1 className="font-orbitron text-3xl tracking-widest glitch-text" data-text="V.E.D.A" style={{ color: colors.secondary, textShadow: `0 0 8px ${rgba(colors.primary, 0.5)}` }}>V.E.D.A</h1>
          </div>
          <p className="font-orbitron text-[10px] tracking-[0.3em] ml-7" style={{ color: rgba(colors.primary, 0.6) }}>
            SYSTEM STATUS: <span className={statusColor}>{listening ? "LISTENING" : "ACTIVE"}</span>
          </p>
        </div>

        <nav className="flex items-center px-8 py-2 rounded-full gap-10 font-orbitron text-[10px] z-20"
          style={{ background: 'rgba(15,10,5,0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.2)}`, color: rgba(colors.primary, 0.6) }}>
          {[{ key: 'dashboard', label: 'DASHBOARD' }, { key: 'analytics', label: 'ANALYTICS' }].map(item => (
            <button key={item.key} onClick={() => handleNavClick(item.key)} className="transition-colors duration-200"
              style={{ color: activePanel === item.key ? colors.secondary : undefined }}>{item.label}</button>
          ))}
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: colors.primary }} />
          {[{ key: 'vision', label: 'VISION ENGINE' }, { key: 'settings', label: 'SETTINGS' }, { key: 'about', label: 'ABOUT' }].map(item => (
            <button key={item.key} onClick={() => handleNavClick(item.key)} className="transition-colors duration-200 hover:scale-105"
              style={{ color: activePanel === item.key ? colors.secondary : undefined, textShadow: activePanel === item.key ? `0 0 10px ${colors.primary}` : 'none' }}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="text-right font-orbitron" style={{ color: rgba(colors.primary, 0.8) }}>
          <div className="text-xl">{timeString}</div>
          <div className="text-[9px] tracking-widest opacity-60">ENCRYPTION: SOLARIS-X</div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex w-full max-w-[1600px] h-full items-center justify-between gap-6 py-2 overflow-hidden">
        {/* LEFT */}
        <aside className="flex-none w-72 h-full flex flex-col gap-3">
          <div className="rounded-xl p-4 flex-grow flex flex-col gap-4 overflow-hidden hud-corners panel-breathe"
            style={{ '--hud-color': colors.primary, background: 'rgba(15,10,5,0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.13)}`, boxShadow: `0 0 10px ${rgba(colors.primary, 0.13)}, inset 0 0 10px ${rgba(colors.primary, 0.03)}` }}>
            <h3 className="font-orbitron text-xs tracking-widest pb-2 flex justify-between" style={{ color: rgba(colors.primary, 0.45), borderBottom: `1px solid ${rgba(colors.primary, 0.13)}` }}>
              <span>LOG_HISTORY</span><span>[v4.0s]</span>
            </h3>
            <div className="flex-grow space-y-4 overflow-y-auto pr-2 custom-scrollbar text-sm font-exo">
              <div className="opacity-80"><span className="font-bold block mb-1" style={{ color: colors.primary }}>USER:</span>Initiate fusion core simulation...</div>
              <div className="opacity-60 italic text-xs"><span className="font-bold block mb-1" style={{ color: colors.accent }}>V.E.D.A:</span>Solaris parameters set. Core stable.</div>
              <div className="opacity-80"><span className="font-bold block mb-1" style={{ color: colors.primary }}>USER:</span>Optimize thermal distribution.</div>
              <div className="opacity-60 italic text-xs"><span className="font-bold block mb-1" style={{ color: colors.accent }}>V.E.D.A:</span>Adjusting gold-reflective shielding...</div>
            </div>
            <div className="font-orbitron pt-2 text-[10px]" style={{ borderTop: `1px solid ${rgba(colors.primary, 0.13)}`, color: rgba(colors.primary, 0.25) }}>LAST BACKUP: 02.45.21</div>
          </div>

          {/* SIMULATION PARAMETERS PANEL */}
          <div className="rounded-xl p-4 flex flex-col gap-3 overflow-hidden hud-corners"
            style={{ '--hud-color': colors.primary, background: 'rgba(15,10,5,0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.13)}` }}>
            <h3 className="font-orbitron text-[10px] tracking-widest text-center" style={{ color: rgba(colors.primary, 0.6), borderBottom: `1px dashed ${rgba(colors.primary, 0.2)}`, paddingBottom: '8px' }}>
              SIMULATION PARAMETERS
            </h3>
            
            <div className="space-y-3 mt-2">
              {[
                { label: 'Simulation Core', val: '5.0', pct: 50 },
                { label: 'Core Stress Parameter', val: '129', pct: 80 },
                { label: 'Core Temperature', val: '6.5', pct: 65, color: colors.accent },
                { label: 'Simulation Output', val: '100', pct: 100 },
                { label: 'Stability Index', val: '1.5', pct: 15 },
              ].map((param, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between font-exo text-[10px]" style={{ color: rgba(colors.primary, 0.7) }}>
                    <span>{param.label}</span>
                    <span className="font-orbitron tracking-widest" style={{ color: param.color || colors.secondary }}>{param.val}</span>
                  </div>
                  <input type="range" min="0" max="100" value={param.pct} readOnly className="sci-fi-slider pointer-events-none" style={{ '--hud-color': param.color || colors.primary }} />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <section className="flex-grow flex flex-col items-center justify-between relative shrink-0 h-full py-2">
          

          {/* MASSIVE QUANTUM CORE */}
          <div className="relative w-[480px] h-[480px] flex items-center justify-center scale-100 my-auto">
            {/* PULSE RINGS */}
            {pulseRings.map(id => (
              <div key={id} className="pulse-ring" style={{ borderColor: rgba(colors.primary, 0.4) }} />
            ))}
            {/* Hologram glow - dynamic */}
            <div className="absolute w-[350px] h-[350px] rounded-full blur-3xl opacity-30 animate-pulse"
              style={{ background: `radial-gradient(circle, ${rgba(colors.primary, 0.2)} 0%, ${rgba(colors.accent, 0.05)} 70%, transparent 100%)` }} />

            {/* Rings - all dynamic */}
            <div className="absolute inset-0 border rounded-full animate-spin-slow" style={{ borderColor: rgba(colors.primary, 0.1) }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-1" style={{ backgroundColor: rgba(colors.primary, 0.4) }} />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-1" style={{ backgroundColor: rgba(colors.primary, 0.4) }} />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4" style={{ backgroundColor: rgba(colors.primary, 0.4) }} />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-4" style={{ backgroundColor: rgba(colors.primary, 0.4) }} />
            </div>
            <div className="absolute inset-6 border border-dashed rounded-full animate-spin-reverse-slow" style={{ borderColor: rgba(colors.primary, 0.2) }} />
            <div className="absolute inset-12 border-4 border-transparent rounded-full animate-spin-slow" style={{ borderTopColor: rgba(colors.primary, 0.4), borderBottomColor: rgba(colors.primary, 0.4) }} />
            <div className="absolute inset-16 border rounded-full" style={{ borderColor: rgba(colors.accent, 0.2) }} />

            {/* SVG orbits - dynamic */}
            <div className="absolute inset-0 pointer-events-none scale-110">
              <svg className="w-full h-full animate-spin-slow" viewBox="0 0 100 100">
                <circle cx="50" cy="50" fill="none" r="48" stroke={rgba(colors.primary, 0.3)} strokeDasharray="2 10" strokeWidth="0.5" />
                <circle cx="50" cy="50" fill="none" r="38" stroke={rgba(colors.accent, 0.4)} strokeDasharray="20 40" strokeWidth="1" />
                <path d="M 50 10 A 40 40 0 0 1 90 50" fill="none" stroke={rgba(colors.primary, 0.6)} strokeWidth="0.5" />
                <path d="M 50 90 A 40 40 0 0 1 10 50" fill="none" stroke={rgba(colors.primary, 0.6)} strokeWidth="0.5" />
              </svg>
            </div>

            {/* QUANTUM CORE - Massive 3D Structure */}
            <div className="relative z-20 w-52 h-52 flex items-center justify-center scale-125">
              <div className="quantum-core-container" style={{ transform: `scale(${blobScale})`, transition: 'transform 80ms linear' }}>
                <div className="core-center" style={{ '--hud-color': colors.primary }} />
                <div className="orbit-ring orbit-ring-1" style={{ '--hud-color': colors.primary }} />
                <div className="orbit-ring orbit-ring-2" style={{ '--hud-accent': colors.accent }} />
                <div className="orbit-ring orbit-ring-3" />
              </div>

              {/* Waveform - dynamic stroke */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 200 200">
                  <defs><filter id="glow"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
                  <path ref={wavePathRef} d="M 100 100 m -80 0 a 80 80 0 1 0 160 0 a 80 80 0 1 0 -160 0" fill="none" filter="url(#glow)" stroke={colors.secondary} strokeDasharray="4 8" strokeWidth="1" />
                </svg>
              </div>
            </div>

            <button className="absolute z-30 w-40 h-40 rounded-full cursor-pointer transition-colors group" onClick={toggleListening} style={{ background: 'transparent' }}>
              <div className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity font-orbitron text-[10px] tracking-[0.2em] whitespace-nowrap" style={{ color: colors.secondary }}>
                {listening ? "TERMINATE LINK" : "INITIATE INTERFACE"}
              </div>
            </button>
          </div>

          {/* TERMINAL */}
          <Terminal 
            colors={colors} 
            listening={listening} 
            transcriptLines={transcriptLines} 
            interimText={interimText}
            activeMicName={activeMicName}
            volume={volume}
          />
        </section>

        {/* RIGHT */}
        <aside className="flex-none w-72 h-full flex flex-col gap-3">
          <h3 className="font-orbitron text-xs tracking-widest pl-2" style={{ color: rgba(colors.primary, 0.7) }}>MODULE_CONTROLS</h3>

          {[
            { title: 'Text AI', sub: 'Linguistics Processor', color: 'primary', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { title: 'Image AI', sub: 'Visual Synthesis', color: 'accent', icon: 'M4 16l4.586-4.586a1 1 0 011.414 0L14 15m-4-4l1-1m5 5l1.414-1.414a1 1 0 011.414 0L21 16m-7-1l1-1m5 5l1-1m-10-5l1-1m0-5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
            { title: 'Resume Expert', sub: 'Career Architect', color: 'primary', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            { title: 'System Chat', sub: 'Direct Interface', color: 'primary', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
          ].map(card => {
            const c = card.color === 'accent' ? colors.accent : colors.primary;
            const tc = card.color === 'accent' ? colors.accent : colors.secondary;
            return (
              <div key={card.title} className="rounded-xl p-3 group cursor-pointer transition-all duration-300 tilt-card hud-corners"
                onMouseMove={handleTilt} onMouseLeave={handleTiltReset}
                style={{ '--hud-color': c, background: 'rgba(15,10,5,0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${rgba(c, 0.2)}`, boxShadow: `0 0 10px ${rgba(c, 0.13)}, inset 0 0 10px ${rgba(c, 0.03)}` }}>
                <div className="tilt-shine" />
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: rgba(c, 0.2), color: c }}>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d={card.icon} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs" style={{ color: tc }}>{card.title}</h4>
                    <p className="text-[9px]" style={{ color: rgba(c, 0.5) }}>{card.sub}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-auto rounded-xl p-3 text-[10px] font-orbitron leading-relaxed"
            style={{ background: 'rgba(15,10,5,0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${rgba(colors.primary, 0.13)}`, boxShadow: `0 0 10px ${rgba(colors.primary, 0.13)}`, color: rgba(colors.primary, 0.4) }}>
            <div className="flex justify-between mb-1">
              <span>SIGNAL STRENGTH</span>
              <span style={{ color: colors.primary }}>{signalPct}</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full" style={{ width: signalPct, backgroundColor: colors.primary }} />
            </div>
          </div>
        </aside>
      </main>

      {renderOverlay()}
    </div>
  );
};

export default App;
