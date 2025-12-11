'use client';

import React, { useMemo, useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useControls } from 'leva';

interface ImageParticlesProps {
  imageUrl: string;
  audioLevel?: number; // 0 to 1
  opacity?: number;
  defaultParticleSize?: number;
  defaultImageScale?: number;
  controlGroup?: string;
  active?: boolean;
}

// Simplex noise function
const noiseFunctions = `
// 3D Simplex Noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

const vertexShader = `
uniform float uTime;
uniform vec2 uMouse;
uniform float uSize;
uniform float uHover; 
uniform float uAudio; 
uniform float uDepthStrength;
uniform float uNoiseStrength;
uniform float uPortalStrength;
uniform float uPortalSpeed;
uniform float uContentRatio;
uniform float uHaloWidth;
uniform float uEdgeSizeScale;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uWaveRadial;
uniform float uWaveTangential;
uniform float uWorldRadius;
uniform float uOpacity; 
uniform float uActive; // Added active state uniform
uniform float uMouseRadius; // 用来控制鼠标影响范围
uniform float uMouseForce;  // 用来控制推力强度

attribute vec3 color;
attribute float random;
attribute float pIndex; 

varying vec3 vColor;
varying float vDistance;
varying vec3 vPos;
varying float vEdgeFactor;

${noiseFunctions}

void main() {
  vec3 pos = position;
  float time = uTime * uPortalSpeed;

  // 1. Luminance (kept for potential future use)
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));

  // 3. Circular Domain & Edge Detection
  float distFromCenter = length(pos.xy);
  float normalizedDist = distFromCenter / uWorldRadius;
  float edgeFactor = smoothstep(uContentRatio, uContentRatio + uHaloWidth, normalizedDist);
  vEdgeFactor = edgeFactor; // Pass to fragment for coloring

  // 4. Global Dynamics with Edge-Only Distortion
  
  // Audio affects Z height globally (Breathing effect)
  // float audio = uAudio * 2.0;
  // pos.z += audio * 1.5; 

  // Global "Gentle" Z-Axis Undulation (Breathing)
  // This applies to the WHOLE image, creating a unified heaving motion
  float globalBreath = sin(uTime * 0.5 + length(pos.xy) * 0.5);
  pos.z += globalBreath * 0.2;

  // --- Edge-Only Distortion Effects ---
  // We use edgeFactor to blend between "Safe Center" and "Wild Edge"
  
  // 1. Swirl/Portal Effect (Only affects edges)
  float angle = atan(pos.y, pos.x);
  float swirl = sin(time * 2.0 + angle * 6.0) * uPortalStrength * edgeFactor;
  float radius = length(pos.xy);
  float offsetR = swirl * 0.2;
  
  // Apply swirl only based on edgeFactor
  // Center remains strictly cartesian (no twist), edges twist
  pos.x = pos.x + (cos(angle) * offsetR - pos.x * 0.0) * edgeFactor; 
  pos.y = pos.y + (sin(angle) * offsetR - pos.y * 0.0) * edgeFactor;

  // 2. Wave Effect (Only affects edges)
  float wavePhase = angle * uWaveFrequency + uTime * uWaveSpeed + normalizedDist * 5.0;
  float wave = sin(wavePhase);
  vec2 radialVec = normalize(pos.xy);
  vec2 tangentVec = vec2(-radialVec.y, radialVec.x);
  
  // Apply waves scaled by edgeFactor
  pos.xy += radialVec * wave * uWaveRadial * edgeFactor;
  pos.xy += tangentVec * wave * uWaveTangential * edgeFactor;

  // 3. Noise/Chaos (Z-axis displacement, stronger at edges)
  float chaos = snoise(vec3(pos.xy * 0.8, time * 1.6));
  // Center gets gentle noise, Edges get strong noise
  float centerNoise = chaos * 0.05; 
  float edgeNoise = chaos * uDepthStrength;
  pos.z += mix(centerNoise, edgeNoise, edgeFactor);

  // 7. Mouse Interaction
  vec3 mousePos = vec3(uMouse.x, uMouse.y, 0.0); // Z=0 match plane
  float mouseDist = distance(pos, mousePos);
  float mouseRadius = uMouseRadius;
  
  // Only apply mouse interaction if this instance is hovered (based on uHover uniform)
  if (mouseDist < mouseRadius && uActive > 0.5) {
      vec3 dir = normalize(pos - mousePos);
      
      // 计算归一化距离
      float normDist = mouseDist / mouseRadius;
      
      // 1. 创建平滑的隆起曲线
      float bulgeShape = 1.0 - smoothstep(0.0, 1.0, normDist);
      
      // 2. 施加 XY平面 推力
      float force = bulgeShape; 
      
      // =========== 【修复了这里】 ===========
      // 把 dir 改成了 dir.xy，这样两边都是 vec2，就不会报错了
      pos.xy += dir.xy * force * uMouseForce * uHover; 
      // ====================================

      // 3. 施加 Z轴 隆起 (制造凹凸感)
      pos.z += bulgeShape * uMouseForce * 2.0 * uHover; 

      // 4. 假高光
      float highlight = bulgeShape * 0.3 * uHover; 
      vColor += vec3(highlight); 
    }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  gl_PointSize = uSize * mix(1.0, uEdgeSizeScale, edgeFactor) * (200.0 / -mvPosition.z);
  
  vDistance = -mvPosition.z;
  vColor = color;
  vPos = pos;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying vec3 vColor;
varying vec3 vPos;
varying float vEdgeFactor;
uniform float uBrightness;
uniform float uEdgeGlow;
uniform float uEdgeBrightness;
uniform float uEdgeTint;
uniform float uOpacity;

void main() {
  // Soft circular particle
  float dist = distance(gl_PointCoord, vec2(0.5));
  if (dist > 0.5) discard;
  
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

  // Color Mixing
  vec3 finalColor = vColor;
  
  if (vEdgeFactor > 0.0) {
    float glowStrength = smoothstep(0.0, 1.0, vEdgeFactor);
    vec3 tintColor = mix(vColor, vec3(1.0), uEdgeTint);
    finalColor = mix(finalColor, tintColor, glowStrength * uEdgeGlow);
    finalColor *= (1.0 + glowStrength * uEdgeGlow);
    finalColor *= mix(1.0, uEdgeBrightness, glowStrength);
  }

  // Global Brightness
  finalColor *= uBrightness;

  gl_FragColor = vec4(finalColor, alpha * uOpacity);
}
`;

const ImageParticles = forwardRef<THREE.Points, ImageParticlesProps>(({ 
  imageUrl, 
  audioLevel = 0,
  opacity = 1.0,
  defaultParticleSize = 0.1,
  defaultImageScale = 1.10,
  controlGroup = 'Image Settings',
  active = true
}, ref) => {
  const meshRef = useRef<THREE.Points>(null);
  useImperativeHandle(ref, () => meshRef.current!);
  const { viewport } = useThree();
  
  // Leva Controls
  const [{ 
    mouseRadius, // <--- 新增
    mouseForce,  // <--- 新增
    particleSize, 
    particleSpeed, 
    particleDensity, 
    depthStrength, 
    noiseStrength,
    brightness,
    portalStrength,
    portalSpeed,
    contentRatio,
    haloWidth,
    edgeGlow,
    edgeSizeScale,
    edgeBrightness,
    haloMultiplier,
    haloJitter,
    edgeTint,
    imageScale,
    edgeWaveFrequency,
    edgeWaveSpeed,
    edgeWaveRadial,
    edgeWaveTangential
  }, set] = useControls(controlGroup, () => ({
    mouseRadius: { value: 0.7, min: 0.5, max: 5.0, step: 0.1, label: 'Mouse Radius' },
    mouseForce: { value: 0.2, min: 0.1, max: 3.0, step: 0.1, label: 'Mouse Force' },
    particleSize: { value: defaultParticleSize, min: 0.1, max: 10.0, step: 0.1 },
    particleSpeed: { value: 0.5, min: 0.0, max: 2.0, step: 0.1 },
    particleDensity: { value: 1, min: 1, max: 10, step: 1, label: 'Skip Pixels (Refresh)' },
    depthStrength: { value: 1.0, min: 0.0, max: 5.0, step: 0.1 },
    noiseStrength: { value: 0.20, min: 0.0, max: 1.0, step: 0.01 },
    brightness: { value: 0.8, min: 0.1, max: 3.0, step: 0.1 },
    portalStrength: { value: 1.0, min: 0.0, max: 2.0, step: 0.1, label: 'Portal Effect' },
    portalSpeed: { value: 0.2, min: 0.0, max: 2.0, step: 0.1, label: 'Portal Speed' },
    contentRatio: { value: 0.90, min: 0.5, max: 0.98, step: 0.01, label: 'Content Coverage' },
    haloWidth: { value: 0.20, min: 0.02, max: 0.4, step: 0.01, label: 'Edge Band' },
    edgeGlow: { value: 0.70, min: 0.0, max: 1.5, step: 0.05, label: 'Edge Glow' },
    edgeSizeScale: { value: 0.10, min: 0.1, max: 1.0, step: 0.05, label: 'Edge Size Scale' },
    edgeBrightness: { value: 1.0, min: 0.2, max: 4.0, step: 0.1, label: 'Edge Brightness' },
    haloMultiplier: { value: 4, min: 0, max: 20, step: 1, label: 'Edge Density' },
    haloJitter: { value: 0.20, min: 0.0, max: 1.0, step: 0.01, label: 'Edge Jitter' },
    edgeTint: { value: 0.20, min: 0.0, max: 1.0, step: 0.05, label: 'Edge Tint White' },
    imageScale: { value: defaultImageScale, min: 0.5, max: 2.0, step: 0.05, label: 'Image Scale' },
    edgeWaveFrequency: { value: 1.0, min: 1.0, max: 32.0, step: 1, label: 'Edge Wave Freq' },
    edgeWaveSpeed: { value: 1.0, min: 0.0, max: 5.0, step: 0.1, label: 'Edge Wave Speed' },
    edgeWaveRadial: { value: 0.0, min: 0.0, max: 1.0, step: 0.01, label: 'Edge Wave Radial' },
    edgeWaveTangential: { value: 0.40, min: 0.0, max: 1.0, step: 0.01, label: 'Edge Wave Tangential' }
  }), [defaultParticleSize, defaultImageScale, controlGroup]);

  // Force update Leva controls when defaults change
  useEffect(() => {
    set({
      particleSize: defaultParticleSize,
      imageScale: defaultImageScale
    });
  }, [defaultParticleSize, defaultImageScale, set]);

  const [particles, setParticles] = useState<{
    positions: Float32Array;
    colors: Float32Array;
    randoms: Float32Array;
    indices: Float32Array;
  } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const maxSize = 400; 
      let width = img.width;
      let height = img.height;
      
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const positions: number[] = [];
      const colors: number[] = [];
      const randoms: number[] = [];
      const indices: number[] = [];

      let particleCount = 0;
      
      const centerX = width / 2;
      const centerY = height / 2;
      // Calculate max radius to crop circle
      const radius = Math.min(width, height) / 2;

      const worldRadius = Math.min(viewport.width, viewport.height) * 0.4 * imageScale;
      for (let y = 0; y < height; y += particleDensity) {
        for (let x = 0; x < width; x += particleDensity) {
          // Circular Mask Check
          const dx = x - centerX;
          const dy = y - centerY;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          
          if (distFromCenter > radius) continue;

          const i = (y * width + x) * 4;
          const a = data[i + 3] / 255;

          if (a > 0.1) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            
            // Normalize coordinates to -5 to 5 range
            // We use the same scale for both axes to keep aspect ratio, but since we forced a circle crop,
            // we should probably normalize based on the radius to keep it perfectly round in 3D space
            
            // Map x from [centerX - radius, centerX + radius] to world radius
            const pX = (dx / radius) * worldRadius;
            const pY = -(dy / radius) * worldRadius; 
            const pZ = 0;

            positions.push(pX, pY, pZ);
            colors.push(r, g, b);
            randoms.push(Math.random());
            indices.push(particleCount);
            particleCount++;

            // Edge band densification (galaxy-style ring)
            const radialNorm = distFromCenter / radius;
            if (radialNorm > contentRatio && radialNorm <= contentRatio + haloWidth) {
              for (let h = 0; h < haloMultiplier; h++) {
                const jitterX = (Math.random() - 0.5) * 2 * haloJitter;
                const jitterY = (Math.random() - 0.5) * 2 * haloJitter;
                const outward = Math.random() * 0.15; // slight outward spread
                const jPX = ((dx / radius) * (worldRadius + outward * worldRadius * 0.03)) + jitterX;
                const jPY = (-(dy / radius) * (worldRadius + outward * worldRadius * 0.03)) + jitterY;
                positions.push(jPX, jPY, 0);
                colors.push(r, g, b);
                randoms.push(Math.random());
                indices.push(particleCount);
                particleCount++;
              }
            }
          }
        }
      }

      setParticles({
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        randoms: new Float32Array(randoms),
        indices: new Float32Array(indices)
      });
    };
  }, [imageUrl, particleDensity, contentRatio, haloWidth, haloMultiplier, haloJitter, viewport.width, viewport.height, imageScale]);

  const uniforms = useMemo(() => ({
    uMouseRadius: { value: 0.7 }, // <--- 初始化
    uMouseForce: { value: 0.2 },  // <--- 初始化
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(9999, 9999) },
    uSize: { value: particleSize },
    uHover: { value: 1.0 },
    uAudio: { value: 0.0 },
    uDepthStrength: { value: depthStrength },
    uNoiseStrength: { value: noiseStrength },
    uBrightness: { value: brightness },
    uPortalStrength: { value: portalStrength },
    uPortalSpeed: { value: portalSpeed },
    uContentRatio: { value: contentRatio },
    uHaloWidth: { value: haloWidth },
    uEdgeGlow: { value: edgeGlow },
    uEdgeSizeScale: { value: edgeSizeScale },
    uEdgeBrightness: { value: edgeBrightness },
    uEdgeTint: { value: edgeTint },
    uWaveFrequency: { value: edgeWaveFrequency },
    uWaveSpeed: { value: edgeWaveSpeed },
    uWaveRadial: { value: edgeWaveRadial },
    uWaveTangential: { value: edgeWaveTangential },
      uWorldRadius: { value: Math.min(viewport.width, viewport.height) * 0.4 * imageScale },
      uOpacity: { value: 1.0 },
      uActive: { value: 1.0 }
    }), []);

  useFrame((state) => {
    if (meshRef.current && meshRef.current.material instanceof THREE.ShaderMaterial) {
      meshRef.current.material.uniforms.uMouseRadius.value = mouseRadius;
      meshRef.current.material.uniforms.uMouseForce.value = mouseForce;
      meshRef.current.material.uniforms.uTime.value = state.clock.getElapsedTime();
      meshRef.current.material.uniforms.uSize.value = particleSize;
      meshRef.current.material.uniforms.uDepthStrength.value = depthStrength;
      meshRef.current.material.uniforms.uNoiseStrength.value = noiseStrength;
      meshRef.current.material.uniforms.uBrightness.value = brightness;
      meshRef.current.material.uniforms.uPortalStrength.value = portalStrength;
      meshRef.current.material.uniforms.uPortalSpeed.value = portalSpeed;
      meshRef.current.material.uniforms.uContentRatio.value = contentRatio;
      meshRef.current.material.uniforms.uHaloWidth.value = haloWidth;
      meshRef.current.material.uniforms.uEdgeGlow.value = edgeGlow;
      meshRef.current.material.uniforms.uEdgeSizeScale.value = edgeSizeScale;
      meshRef.current.material.uniforms.uEdgeBrightness.value = edgeBrightness;
      meshRef.current.material.uniforms.uEdgeTint.value = edgeTint;
      meshRef.current.material.uniforms.uWaveFrequency.value = edgeWaveFrequency;
      meshRef.current.material.uniforms.uWaveSpeed.value = edgeWaveSpeed;
      meshRef.current.material.uniforms.uWaveRadial.value = edgeWaveRadial;
      meshRef.current.material.uniforms.uWaveTangential.value = edgeWaveTangential;
      meshRef.current.material.uniforms.uWorldRadius.value = Math.min(viewport.width, viewport.height) * 0.4 * imageScale;
      meshRef.current.material.uniforms.uOpacity.value = opacity;
      meshRef.current.material.uniforms.uActive.value = active ? 1.0 : 0.0;
      
      meshRef.current.material.uniforms.uAudio.value = THREE.MathUtils.lerp(
        meshRef.current.material.uniforms.uAudio.value,
        audioLevel,
        0.2 
      );
      
      // Calculate Mouse Position in World Space (Z=0 plane)
      const worldMouseX = state.mouse.x * state.viewport.width / 2;
      const worldMouseY = state.mouse.y * state.viewport.height / 2;
      const worldMouse = new THREE.Vector3(worldMouseX, worldMouseY, 0);

      // Convert World Mouse to Local Space of the mesh
      // This handles the gallery offset and scale automatically
      meshRef.current.worldToLocal(worldMouse);

      meshRef.current.material.uniforms.uMouse.value.lerp(
        new THREE.Vector2(worldMouse.x, worldMouse.y), 
        0.1
      );
    }
  });

  if (!particles) return null;

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[particles.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[particles.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-random"
          args={[particles.randoms, 1]}
        />
        <bufferAttribute
          attach="attributes-pIndex"
          args={[particles.indices, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </points>
  );
});

export default ImageParticles;
