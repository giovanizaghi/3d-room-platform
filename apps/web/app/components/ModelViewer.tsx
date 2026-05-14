"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type ViewerState = "loading" | "ready" | "error";

interface ModelViewerProps {
  glbUrl: string;
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-6 w-6 text-accent/60" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function ModelViewer({ glbUrl }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Renderer --------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // ---- Scene + Camera --------------------------------------------------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.01,
      1000,
    );
    camera.position.set(0, 0.8, 4);
    camera.lookAt(0, 0, 0);

    // ---- Lighting --------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(5, 10, 7.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8090ff, 0.8);
    fill.position.set(-5, 2, -5);
    scene.add(fill);

    // ---- Pivot for rotation ---------------------------------------------
    const pivot = new THREE.Group();
    scene.add(pivot);

    // ---- Load GLB -------------------------------------------------------
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;

        // Center + fit to a 2-unit bounding box
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        pivot.add(model);
        setState("ready");
      },
      undefined,
      () => setState("error"),
    );

    // ---- Animation loop -------------------------------------------------
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      pivot.rotation.y += 0.004;
      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize observer ------------------------------------------------
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [glbUrl]);

  return (
    <div className="relative w-full h-72 rounded-xl overflow-hidden bg-black/40">
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 backdrop-blur-[2px]">
          <SpinnerIcon />
          <p className="text-xs text-text-muted">Loading 3D model…</p>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <svg className="h-8 w-8 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-xs text-text-muted">Could not load 3D preview</p>
        </div>
      )}

      {/* Subtle label when ready */}
      {state === "ready" && (
        <div className="absolute bottom-2 right-3 pointer-events-none">
          <p className="text-[10px] text-white/30 font-mono">3D preview · auto-rotating</p>
        </div>
      )}
    </div>
  );
}
