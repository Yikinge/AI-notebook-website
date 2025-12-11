'use client';

import React, { useCallback } from 'react';

interface UploadOverlayProps {
  onUpload: (file: File) => void;
}

const UploadOverlay: React.FC<UploadOverlayProps> = ({ onUpload }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onUpload(e.dataTransfer.files[0]);
      }
    },
    [onUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onUpload(e.target.files[0]);
      }
    },
    [onUpload]
  );

  return (
    <div 
      className="pointer-events-auto p-8 border-2 border-dashed border-white/20 rounded-2xl text-center max-w-md w-full mx-4 hover:border-white/40 transition-colors bg-black/60 backdrop-blur-md"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="mb-4 text-4xl">✨</div>
      <h2 className="text-2xl font-bold text-white mb-2">Upload Image</h2>
      <p className="text-gray-400 mb-6">Drag & drop to visualize and chat</p>
      
      <label className="inline-block">
        <input
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleChange}
        />
        <span className="px-6 py-3 bg-white text-black rounded-full font-medium cursor-pointer hover:bg-gray-200 transition-colors">
          Select Image
        </span>
      </label>
    </div>
  );
};

export default UploadOverlay;
