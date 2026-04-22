import { useRef, useEffect, useState } from 'react';

const rgba = (hex, alpha) => {
  const [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
  return `rgba(${r},${g},${b},${alpha})`;
};

// Typing animation hook
const useTypingEffect = (text, speed = 25) => {
  const [displayed, setDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    setIsTyping(true);
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setIsTyping(false);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayed, isTyping };
};

// Individual typing line component
const TypingLine = ({ line, colors }) => {
  const { displayed, isTyping } = useTypingEffect(
    line.type === 'assistant' ? line.text : null,
    20
  );

  if (line.type === 'user') {
    return (
      <div className="flex gap-2 leading-relaxed">
        <span style={{ color: rgba(colors.primary, 0.35) }}>[{line.time}]</span>
        <span style={{ color: colors.secondary }}>YOU ›</span>
        <span style={{ color: '#f1f5f9' }}>{line.text}</span>
      </div>
    );
  }

  if (line.type === 'assistant') {
    return (
      <div className="flex gap-2 leading-relaxed">
        <span style={{ color: rgba(colors.primary, 0.35) }}>[{line.time}]</span>
        <span style={{ color: colors.primary }}>V.E.D.A ›</span>
        <span style={{ color: colors.primary, opacity: 0.9 }}>
          {displayed}
          {isTyping && <span className="typing-cursor" />}
        </span>
      </div>
    );
  }

  if (line.type === 'system') {
    return <span style={{ color: rgba(colors.primary, 0.4) }}>{line.text}</span>;
  }

  if (line.type === 'error') {
    return <span style={{ color: '#ef4444' }}>{line.text}</span>;
  }

  return null;
};

const Terminal = ({ colors, listening, transcriptLines, interimText, activeMicName, volume = 0 }) => {
  const scrollContainerRef = useRef(null);

  // Auto-scroll terminal to bottom without shifting the whole page
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [transcriptLines, interimText]);

  // Generate audio visualizer bars
  const barCount = 16;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const base = listening ? (volume * 100) : 0;
    const randomFactor = Math.sin(Date.now() / 200 + i * 1.5) * 0.5 + 0.5;
    return Math.max(2, base * randomFactor * (0.5 + Math.random() * 0.5));
  });

  return (
    <div className="mt-6 w-full max-w-2xl rounded-xl overflow-hidden crt-terminal hud-corners panel-breathe" 
      style={{ 
        '--hud-color': colors.primary,
        border: `1px solid ${rgba(colors.primary, 0.2)}`, 
        background: 'rgba(5,5,5,0.85)', 
        backdropFilter: 'blur(8px)', 
        boxShadow: `0 0 20px ${rgba(colors.primary, 0.08)}` 
      }}>
      
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2 font-orbitron text-[9px] tracking-widest" 
        style={{ borderBottom: `1px solid ${rgba(colors.primary, 0.13)}`, color: rgba(colors.primary, 0.5) }}>
        <div className="w-2 h-2 rounded-full animate-pulse" 
          style={{ 
            backgroundColor: listening ? '#22c55e' : rgba(colors.primary, 0.4), 
            boxShadow: listening ? '0 0 6px #22c55e' : 'none' 
          }} 
        />
        <span>V.E.D.A :: VOICE TERMINAL</span>

        {/* AUDIO VISUALIZER BARS */}
        <div className="audio-bars ml-3">
          {bars.map((h, i) => {
            // Calculate a color spectrum from blue to red (hue 240 to 0)
            const hue = 240 - ((i / barCount) * 240);
            const barColor = listening ? `hsl(${hue}, 100%, 65%)` : rgba(colors.primary, 0.2);
            return (
              <div key={i} className="audio-bar" 
                style={{ 
                  height: `${h}%`, 
                  backgroundColor: barColor,
                  boxShadow: listening ? `0 0 4px ${barColor}` : 'none'
                }} 
              />
            );
          })}
        </div>

        <span className="ml-auto flex items-center gap-3">
          <span style={{ color: rgba(colors.primary, 0.25), fontSize: '8px' }}>[{activeMicName}]</span>
          <span>{listening ? 'REC ●' : 'STANDBY'}</span>
        </span>
      </div>

      {/* Terminal body with CRT flicker */}
      <div ref={scrollContainerRef} className="h-40 overflow-y-auto px-4 py-3 space-y-1 font-mono text-[11px] custom-scrollbar crt-flicker" 
        style={{ color: rgba(colors.primary, 0.7) }}>
        
        {transcriptLines.map(line => (
          <TypingLine key={line.id} line={line} colors={colors} />
        ))}

        {interimText && (
          <div className="flex gap-2 leading-relaxed opacity-70">
            <span style={{ color: rgba(colors.primary, 0.35) }}>[LIVE]</span>
            <span style={{ color: colors.secondary }}>YOU ›</span>
            <span style={{ color: colors.secondary }}>{interimText}...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Terminal;
