'use client';

import React, { useEffect, useState } from 'react';

export default function SubtitleOverlay({ text, duration = 4000 }: { text: string; duration?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!text) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [text, duration]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-40">
      <div
        className={`max-w-[60%] text-center px-6 py-4 rounded-2xl bg-black/40 backdrop-blur-md text-white transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="text-base leading-relaxed">{text}</div>
      </div>
    </div>
  );
}

