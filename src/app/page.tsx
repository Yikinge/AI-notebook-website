'use client';

import React, { Suspense, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ImageParticles from '@/components/ImageParticles';
import UploadOverlay from '@/components/UploadOverlay';
import ChatOverlay from '@/components/ChatOverlay';
import SubtitleOverlay from '@/components/SubtitleOverlay';
import { useAudioInput } from '@/hooks/useAudioInput';
import { sessionState } from '@/lib/store';

// Simple ambient music generator
function useAmbientMusic() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const startTimeRef = React.useRef<number>(0);

  const toggleMusic = useCallback(() => {
    if (isPlaying) {
      // Stop
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlaying(false);
    } else {
      // Start Radio - Using a more reliable HTTPS stream from SomaFM
      // Drone Zone: Atmospheric ambient space music.
      // Removed crossOrigin='anonymous' to allow playback from non-CORS compliant streams.
      // This is fine because we use simulated visualizer (getLevel) instead of real analysis.
      
      const streams = [
        'https://ice2.somafm.com/dronezone-128-mp3',
        'https://ice4.somafm.com/dronezone-128-mp3',
        'https://ice6.somafm.com/dronezone-128-mp3',
        'https://stream.zeno.fm/f3wvbbqmdg8uv' // Backup: Zen FM Ambient
      ];
      
      const playStream = (index: number) => {
        if (index >= streams.length) {
          console.error("All streams failed, falling back to local synthesis");
          // Fallback to local synthesis if all streams fail
          // This ensures music ALWAYS works
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = 110; // A2
            gain.gain.value = 0.1;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            
            // Store cleanup function in audioRef as a mock object
            (audioRef.current as any) = { 
              pause: () => { 
                osc.stop(); 
                ctx.close(); 
              } 
            };
            startTimeRef.current = Date.now();
            setIsPlaying(true);
          } else {
             setIsPlaying(false);
          }
          return;
        }
        
        const audio = new Audio(streams[index]);
        // audio.crossOrigin = 'anonymous'; // REMOVED to fix playback
        audio.loop = true;
        audio.volume = 0.6;
        
        audio.play()
          .then(() => {
            console.log("Playing stream:", streams[index]);
            audioRef.current = audio;
            startTimeRef.current = Date.now();
            setIsPlaying(true);
          })
          .catch(e => {
            console.warn(`Stream ${index} failed, trying next...`, e);
            playStream(index + 1);
          });
      };

      playStream(0);
    }
  }, [isPlaying]);

  // Simulated audio level based on Perlin-like noise
  const getLevel = useCallback(() => {
    if (!isPlaying) return 0;
    const time = (Date.now() - startTimeRef.current) / 1000;
    // Create a smooth, breathing fluctuation
    // Base slow breath (0.1Hz) + Faster ripple (0.5Hz) + Random flutter
    const base = Math.sin(time * 0.6) * 0.5 + 0.5; // 0-1
    const ripple = Math.sin(time * 2.5) * 0.2;
    const noise = Math.random() * 0.1;
    
    return (base * 0.7 + ripple + noise) * 0.5; // Scale to 0-0.6 range approx
  }, [isPlaying]);

  return { isPlaying, toggleMusic, getLevel };
}

function AudioVisualizer({ getLevel, setAudioLevel }: { getLevel: () => number, setAudioLevel: (v: number) => void }) {
  useFrame(() => {
    const lvl = getLevel();
    setAudioLevel(lvl * 3); // Boost for visual effect
  });
  return null;
}

import Link from 'next/link';

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(() => sessionState.imageUrl);
  const [audioLevel, setAudioLevel] = useState(0);
  const { isPlaying, toggleMusic, getLevel } = useAmbientMusic();
  const [subtitle, setSubtitle] = useState('');

  // Update session state when imageUrl changes
  useEffect(() => {
    sessionState.imageUrl = imageUrl;
  }, [imageUrl]);

  const handleUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
  }, []);

  // Auto-start listening on image upload (needs user interaction first usually)
  // We'll add a button for it.

  return (
    <main className="w-full h-screen bg-black relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 text-white/50 pointer-events-none">
        <h1 className="text-2xl font-bold">DreamCanvas</h1>
        <p className="text-sm">
          {imageUrl ? 'Interactive Mode' : 'Upload an image to start'}
        </p>
      </div>

      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
           <UploadOverlay onUpload={handleUpload} />
        </div>
      )}

      {/* Action Buttons - Moved to Top Left (under title) to avoid overlapping with Leva */}
      <div className="absolute top-20 left-4 z-20 flex flex-col gap-3 items-start">
        <button 
          onClick={toggleMusic}
          className={`px-4 py-2 text-white text-sm rounded-full backdrop-blur-md transition-all flex items-center gap-2 ${isPlaying ? 'bg-emerald-500/50 hover:bg-emerald-500/70 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/10 hover:bg-white/20'}`}
        >
          {isPlaying ? '♫ Stop Dream Radio' : '♫ Play Dream Radio'}
        </button>

        {imageUrl && (
          <button 
            onClick={() => {
              setImageUrl(null);
              sessionState.messages = []; // Reset chat history
            }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-full backdrop-blur-md transition-colors"
          >
            New Image
          </button>
        )}

        <Link href="/gallery" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm backdrop-blur-md transition-colors">
          View Gallery
        </Link>
      </div>

      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 2]} 
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#000000']} />
        
        {/* {isPlaying && <AudioVisualizer getLevel={getLevel} setAudioLevel={setAudioLevel} />} */}

        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          {imageUrl && (
            <ImageParticles 
              key={imageUrl} 
              imageUrl={imageUrl}
              audioLevel={audioLevel}
              defaultParticleSize={0.1}
              defaultImageScale={1.10}
            />
          )}
        </Suspense>
        
        <OrbitControls enableZoom={true} enablePan={true} />
      </Canvas>

      <ChatOverlay 
        key={imageUrl || 'no-image'} 
        imageUrl={imageUrl || undefined} 
        onAssistant={(t)=> setSubtitle(t)} 
      />
      {subtitle && <SubtitleOverlay text={subtitle} />}


      {imageUrl && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-xs pointer-events-none text-center">
          <p>Move mouse to interact • Scroll to zoom</p>
          {!isPlaying && <p className="mt-1 opacity-50">Click 'Play Dream Radio' to activate particles</p>}
        </div>
      )}
    </main>
  );
}
