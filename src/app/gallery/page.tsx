'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import ImageParticles from '@/components/ImageParticles';
import { getGallery, deleteRecord, ChatRecord } from '@/lib/gallery';
import * as THREE from 'three';

// 单个画廊项组件（3D 空间中的一张图片）
function GalleryItem({ 
  record, 
  offset,
  isSelected, 
  onClick 
}: { 
  record: ChatRecord; 
  offset: number; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const groupRef = React.useRef<THREE.Group>(null);
  const particlesRef = React.useRef<THREE.Points>(null);
  
  // 目标位置计算 (V字排列)
  // offset 0: [0, 0, 0]
  // offset +/-1: [+/-8, 0, -5]
  // offset +/-2: [+/-16, 0, -10]
  const targetX = offset * 8;
  const targetZ = -Math.abs(offset) * 5;
  const targetScale = isSelected ? 1.2 : 0.8;
  const targetOpacity = Math.abs(offset) > 2 ? 0 : 1; // 只显示 +/- 2 范围内的

  useFrame((state, delta) => {
    if (groupRef.current) {
      // 平滑插值位置
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, delta * 5);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, delta * 5);
      
      // 平滑插值缩放
      const s = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, delta * 5);
      groupRef.current.scale.set(s, s, s);
    }

    // 粒子透明度渐变
    if (particlesRef.current && particlesRef.current.material instanceof THREE.ShaderMaterial) {
       const currentOpacity = particlesRef.current.material.uniforms.uOpacity.value;
       const newOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, delta * 5);
       particlesRef.current.material.uniforms.uOpacity.value = newOpacity;
    }
  });

  // 优化：如果完全不可见，不渲染内容以节省性能
  if (Math.abs(offset) > 3) return null;

  return (
    <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* 图片粒子 */}
      {record.imageUrl ? (
        <ImageParticles 
          ref={particlesRef} 
          imageUrl={record.imageUrl} 
          audioLevel={0}
          defaultImageScale={0.6}
          defaultParticleSize={0.2}
          controlGroup="Gallery Settings"
          active={isSelected}
        />
      ) : (
        <Text fontSize={0.5} color="white">No Image</Text>
      )}
      
      {/* 底部标题和日期标签 */}
      <group position={[0, -3.8, 0]}>
        {record.title && (
          <Text 
            position={[0, 0.5, 0]}
            fontSize={0.35} 
            color="white"
            anchorX="center"
            anchorY="bottom"
            maxWidth={6}
            textAlign="center"
            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
          >
            {record.title}
          </Text>
        )}
        <Text 
          fontSize={0.25} 
          color={isSelected ? "white" : "gray"}
          anchorX="center"
          anchorY="top"
        >
          {new Date(record.ts).toLocaleDateString()}
        </Text>
      </group>
    </group>
  );
}

import Link from 'next/link';

export default function GalleryPage() {
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const loadRecords = async () => {
      const data = await getGallery();
      setRecords(data);
    };
    loadRecords();
  }, []);

  const handleDelete = async () => {
    if (records.length === 0) return;
    const currentId = records[index].id;
    if (confirm('Delete this conversation?')) {
      await deleteRecord(currentId);
      const nextRecords = await getGallery();
      setRecords(nextRecords);
      if (index >= nextRecords.length) {
        setIndex(Math.max(0, nextRecords.length - 1));
      }
    }
  };

  const current = records[index] || null;

  return (
    <main className="w-full h-screen bg-black relative overflow-hidden">
      <div className="absolute top-4 left-4 z-30 flex items-center gap-4">
        <Link href="/" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm backdrop-blur-md transition-colors flex items-center gap-2">
          <span>← Back</span>
        </Link>
        <div className="text-white/80">
          <div className="text-lg font-semibold leading-none">3D Carousel</div>
          <div className="text-xs opacity-60">
            {records.length > 0 ? `${index + 1} / ${records.length}` : 'No Records'}
          </div>
        </div>
      </div>

      {/* 3D 场景 */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 12], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <color attach="background" args={['#000']} />
          <ambientLight intensity={0.5} />
          
          {/* 渲染记录：V字队列 */}
          {records.map((rec, i) => (
            <GalleryItem 
              key={rec.id} 
              record={rec} 
              offset={i - index} // 计算相对偏移
              isSelected={i === index}
              onClick={() => setIndex(i)}
            />
          ))}

          {/* 允许用户围绕中心查看当前图片 */}
          <OrbitControls 
            enableZoom={true} 
            enablePan={false} 
            maxPolarAngle={Math.PI / 1.5} 
            minPolarAngle={Math.PI / 3}
            target={[0, 0, 0]} // 始终聚焦中心
          />
        </Canvas>
      </div>

      {/* 空状态提示 */}
      {records.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 pointer-events-none">
          No saved conversations yet.
        </div>
      )}

      {/* 底部控制栏 */}
      {records.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30">
          <button 
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
          >
            Prev
          </button>
          
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`px-4 py-2 rounded-full border border-white/20 transition-all ${showChat ? 'bg-white text-black' : 'bg-black/50 text-white hover:bg-white/10'}`}
          >
            {showChat ? 'Hide Chat' : 'Chat Info'}
          </button>

          <button 
            onClick={handleDelete}
            className="px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/30 transition-all"
          >
            Delete
          </button>

          <button 
            onClick={() => setIndex(i => Math.min(records.length - 1, i + 1))}
            disabled={index === records.length - 1}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
          >
            Next
          </button>
        </div>
      )}

      {/* 侧边聊天记录栏 */}
      {showChat && current && (
        <div className="absolute top-0 right-0 bottom-0 w-[360px] bg-black/70 backdrop-blur-xl border-l border-white/10 z-40 p-6 pt-20 overflow-y-auto animate-in slide-in-from-right duration-300">
           <h3 className="text-white font-medium mb-4 pb-2 border-b border-white/10">Conversation History</h3>
           <div className="space-y-4">
             {current.messages.map((m, i) => (
               <div key={i} className={`p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-blue-500/20 text-blue-100 ml-6' : 'bg-white/10 text-white mr-6'}`}>
                 <div className="text-[10px] opacity-50 mb-1 uppercase tracking-wider">{m.role === 'user' ? 'You' : 'AI'}</div>
                 {m.content}
               </div>
             ))}
           </div>
           <div className="mt-8 text-xs text-white/30 text-center">
             Saved on {new Date(current.ts).toLocaleString()}
           </div>
        </div>
      )}
    </main>
  );
}

