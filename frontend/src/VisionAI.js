import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { useVision } from './useVision';

const rgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const VisionAI = ({ colors, speak, userName }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isUserVisible, setIsUserVisible] = useState(false);
  const userVisibleRef = useRef(false); // USE REF TO AVOID STALE CLOSURES IN LOOP
  const reqFrameRef = useRef(null);
  
  const lastSeenRef = useRef(0);
  const lastSpokenRef = useRef(0);
  
  const { visionStatus, preloadModels, cocoModel, faceModel } = useVision();
  const [stats, setStats] = useState({ objects: 0, faces: 0 });

  useEffect(() => {
    preloadModels();
  }, [preloadModels]);

  useEffect(() => {
    let stream = null;

    const setupCamera = async () => {
      if (visionStatus !== 'READY') return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: 640, height: 480 } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play();
              setCameraActive(true);
            }
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    setupCamera();

    return () => {
      if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [visionStatus]);

  // Handle detection loop once both models and camera are ready
  useEffect(() => {
    if (cameraActive && visionStatus === 'READY' && cocoModel && faceModel) {
      detectFrame();
    }
  }, [cameraActive, visionStatus, cocoModel, faceModel]);

  const detectFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !cocoModel || !faceModel) return;

    const video = videoRef.current;
    if (video.readyState !== 4) {
      reqFrameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    const [objects, faces] = await Promise.all([
      cocoModel.detect(video),
      faceModel.estimateFaces(video, false)
    ]);

    setStats({ objects: objects.length, faces: faces.length });

    // --- SMART PRESENCE LOGIC ---
    const now = Date.now();
    const faceSeen = faces.length > 0;

    if (faceSeen) {
      lastSeenRef.current = now;
      if (!userVisibleRef.current) {
        userVisibleRef.current = true;
        setIsUserVisible(true);
        console.log("[Vision] USER_SYNC: LOGGED");

        // Trigger greeting if 5 seconds passed since last greeting
        if (now - lastSpokenRef.current > 5000) {
          const greetingName = userName ? `${userName} ` : "";
          const greetings = [
            `Welcome back ${greetingName}Boss! Aap camera me visible ho.`,
            `Detecting presence. Welcome back ${greetingName}Boss!`,
            `Sync complete. Hello ${greetingName}Boss!`
          ];
          const text = greetings[Math.floor(Math.random() * greetings.length)];
          if (speak) {
            console.log("[Vision] AI GREETING:", text);
            speak(text);
          }
          lastSpokenRef.current = now;
        }
      }
    } else {
      // If no face seen for 3 seconds, set visible to false
      if (userVisibleRef.current && now - lastSeenRef.current > 3000) {
        userVisibleRef.current = false;
        setIsUserVisible(false);
        console.log("[Vision] USER_SYNC: SEARCHING");
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Objects
    objects.forEach(obj => {
      const [x, y, width, height] = obj.bbox;
      drawSciFiBox(ctx, x, y, width, height, obj.class, Math.round(obj.score * 100) + '%', colors.primary);
    });

    // Draw Faces
    faces.forEach(face => {
      const start = face.topLeft;
      const end = face.bottomRight;
      const size = [end[0] - start[0], end[1] - start[1]];
      drawSciFiBox(ctx, start[0], start[1], size[0], size[1], 'HUMAN_ENTITY', 'V.E.D.A_SYNC', colors.accent);
    });

    reqFrameRef.current = requestAnimationFrame(detectFrame);
  };

  const drawSciFiBox = (ctx, x, y, w, h, label, subtext, color) => {
    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    // Outer faint box
    ctx.strokeRect(x, y, w, h);

    // Corner brackets
    ctx.lineWidth = 3;
    const cornerSize = 15;
    
    ctx.beginPath();
    // Top-Left
    ctx.moveTo(x, y + cornerSize); ctx.lineTo(x, y); ctx.lineTo(x + cornerSize, y);
    // Top-Right
    ctx.moveTo(x + w - cornerSize, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerSize);
    // Bottom-Left
    ctx.moveTo(x, y + h - cornerSize); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerSize, y + h);
    // Bottom-Right
    ctx.moveTo(x + w - cornerSize, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerSize);
    ctx.stroke();

    // Reset glow for text
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(10, 10, 10, 0.7)`;
    ctx.fillRect(x, y - 25, 120, 25);
    
    ctx.fillStyle = color;
    ctx.font = '10px "Orbitron", sans-serif';
    ctx.fillText(`${label.toUpperCase()}`, x + 5, y - 10);
    
    ctx.fillStyle = `rgba(255, 255, 255, 0.7)`;
    ctx.font = '8px monospace';
    ctx.fillText(subtext, x + 5, y + h + 12);

    // Add target cross-hair for faces
    if (label === 'HUMAN_ENTITY') {
      const cx = x + w/2;
      const cy = y + h/2;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
      ctx.stroke();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
      {visionStatus !== 'READY' ? (
        <div className="flex flex-col items-center text-center animate-pulse" style={{ color: colors.secondary }}>
          <div className="w-16 h-16 rounded-full border-2 border-transparent border-t-current animate-spin mb-4" />
          <p className="font-orbitron tracking-widest text-sm">INITIALIZING VISION CORE...</p>
          <p className="font-mono text-[10px] opacity-70 mt-2">
            {visionStatus === 'LOADING' ? 'Decrypting Neural Weights...' : 'Quantum Sync In Progress...'}
          </p>
        </div>
      ) : (
        <div className="relative w-full max-w-4xl border border-white/10 rounded-lg overflow-hidden group">
          <div className="absolute top-2 left-3 z-20 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#ef4444' }} />
              <span className="font-orbitron text-[10px] tracking-widest" style={{ color: '#ef4444' }}>REC // OPTICAL SENSORS ACTIVE</span>
            </div>
            <div className="flex gap-4 font-mono text-[9px] mt-1" style={{ color: rgba(colors.primary, 0.6) }}>
              <span>TARGETS: {stats.objects}</span>
              <span>ENTITIES: {stats.faces}</span>
              <span style={{ color: isUserVisible ? colors.secondary : undefined }}>
                USER_SYNC: {isUserVisible ? 'LOGGED' : 'SEARCHING'}
              </span>
            </div>
          </div>

          {/* Grid overlay for aesthetic */}
          <div className="absolute inset-0 z-10 pointer-events-none opacity-20 transition-opacity"
            style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          {/* The actual video element (mirrored) */}
          <video 
            ref={videoRef} 
            className="w-full h-auto object-cover opacity-80" 
            style={{ transform: 'scaleX(-1)' }} 
            playsInline 
            muted 
          />
          
          {/* Canvas drawn ON TOP (also mirrored to match) */}
          <canvas 
            ref={canvasRef} 
            className="absolute top-0 left-0 w-full h-full pointer-events-none" 
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      )}
    </div>
  );
};

export default VisionAI;
