'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };

import { addRecord } from '@/lib/gallery';
import { sessionState } from '@/lib/store';

export default function ChatOverlay({ imageUrl, onAssistant }: { imageUrl?: string; onAssistant?: (t: string)=>void }) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>(() => sessionState.messages);
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);
  
  const [base64Img, setBase64Img] = useState<string | null>(null);
  const [isImageReady, setIsImageReady] = useState(false);

  // Sync messages to session state
  useEffect(() => {
    sessionState.messages = msgs;
  }, [msgs]);
  
  // Pre-process image when it changes
  useEffect(() => {
    if (!imageUrl) {
      setBase64Img(null);
      setIsImageReady(false);
      return;
    }
    
    let isMounted = true;
    setIsImageReady(false); // Reset readiness
    
    const processImage = async () => {
      let finalUrl = imageUrl;
      if (imageUrl.startsWith('blob:')) {
        try {
          const resp = await fetch(imageUrl);
          const blob = await resp.blob();
          finalUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error('Failed to convert blob', e);
        }
      }
      if (isMounted) {
        setBase64Img(finalUrl);
        setIsImageReady(true);
      }
    };
    
    processImage();
    
    return () => { isMounted = false; };
  }, [imageUrl]);

  const handleSave = useCallback(async () => {
    // 允许无图保存，或至少有对话记录
    if (msgs.length === 0) return;
    
    setSaved(true); // Optimistic UI
    const savedImageUrl = base64Img || imageUrl || '';

    // Generate title using AI
    let title = "Untitled Dream";
    try {
      const titlePrompt = [
        ...msgs.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] })),
        { role: 'user', content: [{ type: 'text', text: 'Based on our conversation and the image, generate a very short, poetic title (max 5 words) for this artwork. Output ONLY the title, no quotes or explanation.' }] }
      ];
      
      // Reuse image if available
      if (savedImageUrl) {
         const lastUserMsg = titlePrompt[titlePrompt.length - 1];
         (lastUserMsg.content as any[]).push({ type: 'image_url', image_url: { url: savedImageUrl } });
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: titlePrompt }),
      });
      const data = await res.json();
      if (data?.content) {
        title = data.content.trim().replace(/^["']|["']$/g, '');
      }
    } catch (e) {
      console.error('Failed to generate title', e);
    }

    addRecord({
      id: Date.now().toString(),
      ts: Date.now(),
      imageUrl: savedImageUrl, 
      title: title,
      messages: msgs
    });
    
    setTimeout(() => setSaved(false), 2000);
  }, [imageUrl, base64Img, msgs]);

  const send = useCallback(async (text: string) => {
    const nextMsgs = [...msgs, { role: 'user', content: text }];
    setMsgs(nextMsgs);
    setInput('');
    try {
      const doubaoMsgs = nextMsgs.map(m => ({
        role: m.role,
        content: [{ type: 'text', text: m.content }]
      }));
      
      // Use the pre-processed base64 image if available
      if (base64Img) {
        doubaoMsgs.push({ role: 'user', content: [{ type: 'image_url', image_url: { url: base64Img } }] });
      } else if (imageUrl) {
        // Handle Blob URLs by converting to Base64 (fallback)
        let finalImageUrl = imageUrl;
        if (imageUrl.startsWith('blob:')) {
          try {
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            finalImageUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error('Failed to convert blob to base64 for API', e);
          }
        }
        doubaoMsgs.push({ role: 'user', content: [{ type: 'image_url', image_url: { url: finalImageUrl } }] });
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: doubaoMsgs }),
      });
      const data = await res.json();
      const reply = (data?.content && String(data.content).trim().length > 0)
        ? data.content
        : (data?.error || 'Message received.');
      setMsgs((m) => [...m, { role: 'assistant', content: reply }]);
      // speak(reply); // Disabled TTS as requested
      onAssistant && onAssistant(reply);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Service unavailable, please try again later.' }]);
    }
  }, [msgs]);

  return (
    <div className="absolute bottom-6 right-6 z-30 font-sans">
      {open && (
        <div className="w-[420px] max-h-[56vh] overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/15 text-white shadow-2xl">
          <div className="px-4 pt-3 flex items-center justify-between">
            <div className="text-sm tracking-wide uppercase text-white/80 flex items-center gap-2">
              AI Chat
              {imageUrl && (
                <span 
                  className={`w-2 h-2 rounded-full ${isImageReady ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-yellow-500 animate-pulse'}`} 
                  title={isImageReady ? "Image analyzed and ready" : "Analyzing image..."}
                />
              )}
            </div>
            <div className="flex gap-2 items-center">
                <button 
                  onClick={handleSave} 
                  disabled={saved}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${saved ? 'bg-green-500/80 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
                >
                  {saved ? 'Saved' : 'Save'}
                </button>
            </div>
          </div>
          <div className="p-4 h-[36vh] overflow-y-auto space-y-2">
            {msgs.length === 0 && (
              <div className="text-xs text-white/60">Start chatting with AI.</div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] px-3 py-2 rounded-xl ${m.role === 'user' ? 'bg-blue-500/20 text-blue-100 ml-auto' : 'bg-white/10 text-white mr-auto'}`}>
                <span className="text-[12px] opacity-70 mr-2">{m.role === 'user' ? 'You' : 'AI'}</span>
                <span className="text-[13px]">{m.content}</span>
              </div>
            ))}
          </div>
          <div className="p-3 flex items-center gap-2 border-t border-white/15">
              <>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) send(input.trim()); }}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-md bg-white/10 text-white outline-none placeholder-white/40"
                />
                <button
                  onClick={() => input.trim() && send(input.trim())}
                  className="px-4 py-2 rounded-md bg-white/20 hover:bg-white/30 text-sm"
                >Send</button>
              </>
          </div>
        </div>
      )}
    </div>
  );
}
