import { useState, useEffect, useRef, useCallback } from 'react';

export const useAudioInput = () => {
  const [isListening, setIsListening] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 64; // Low resolution is enough for visual "thumping"
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      setIsListening(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    setIsListening(false);
  }, []);

  const getFrequency = useCallback(() => {
    if (analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      // Average frequency
      const average = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
      return average / 255; // Normalize 0-1
    }
    return 0;
  }, []);

  return { isListening, startListening, stopListening, getFrequency };
};
