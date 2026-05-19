"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LightProps,
  MaterialProps,
  MaterialPreset,
  MATERIAL_PRESETS,
  SelectionInfo,
  TransformData,
  kelvinToHex,
} from "./RoomScene";

// ---------------------------------------------------------------------------
// DragInput — Unity-style scrub input
// ---------------------------------------------------------------------------

interface DragInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
  locked?: boolean;
  lockedTooltip?: string;
}

function DragInput({ label, value, onChange, step = 0.01, min = -Infinity, max = Infinity, suffix = "", decimals = 3, locked = false, lockedTooltip }: DragInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startVal: number; dragging: boolean }>({ startX: 0, startVal: 0, dragging: false });

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (editing || locked) return;
    dragRef.current = { startX: e.clientX, startVal: value, dragging: false };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - dragRef.current.startX;
      if (Math.abs(delta) > 2) dragRef.current.dragging = true;
      if (dragRef.current.dragging) {
        const next = clamp(+(dragRef.current.startVal + delta * step).toFixed(decimals));
        onChange(next);
      }
    };

    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }, [editing, locked, value, onChange, step, min, max, decimals]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDoubleClick = () => {
    if (locked) return;
    setDraft(value.toFixed(decimals));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) onChange(clamp(+parsed.toFixed(decimals)));
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400 w-16 shrink-0 select-none">{label}</span>
      {locked ? (
        <div className="flex-1 flex items-center gap-1.5">
          <div className="flex-1 bg-zinc-800 text-zinc-500 text-xs px-1 py-0.5 rounded select-none">
            {value.toFixed(decimals)}{suffix}
          </div>
          <div className="relative group/lock">
            <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 6V4.5a3 3 0 0 0-6 0V6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1ZM6 4.5a2 2 0 1 1 4 0V6H6V4.5Z"/>
            </svg>
            {lockedTooltip && (
              <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover/lock:block z-50">
                <div className="rounded-lg bg-zinc-900 border border-zinc-700 text-white text-[10px] px-2 py-1 whitespace-nowrap shadow-lg text-center leading-snug">
                  {lockedTooltip}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : editing ? (
        <input
          ref={inputRef}
          className="flex-1 bg-zinc-700 text-white text-xs px-1 py-0.5 rounded outline-none focus:ring-1 focus:ring-blue-400"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        />
      ) : (
        <div
          className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-1 py-0.5 rounded cursor-ew-resize select-none"
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          {value.toFixed(decimals)}{suffix}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kelvin presets
// ---------------------------------------------------------------------------

const KELVIN_PRESETS = [
  { k: 1800, label: "Candle",  sub: "1800K" },
  { k: 2700, label: "Warm",    sub: "2700K" },
  { k: 3000, label: "Halogen", sub: "3000K" },
  { k: 4000, label: "Neutral", sub: "4000K" },
  { k: 5500, label: "Daylight",sub: "5500K" },
  { k: 6500, label: "Cool",    sub: "6500K" },
];

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mt-3 mb-1">{children}</div>;
}

// ---------------------------------------------------------------------------
// Material section (floor / wall only)
// ---------------------------------------------------------------------------

interface MaterialSectionProps {
  material: MaterialProps;
  showPresets?: boolean;
  onChange: (props: Partial<MaterialProps>) => void;
}

function MaterialSection({ material, showPresets = false, onChange }: MaterialSectionProps) {
  return (
    <>
      {showPresets && (
        <>
          <SectionHeading>Presets</SectionHeading>
          <div className="grid grid-cols-4 gap-1">
            {MATERIAL_PRESETS.map((p: MaterialPreset) => (
              <button
                key={p.label}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded bg-zinc-700 hover:bg-zinc-600 text-xs text-white"
                onClick={() => onChange({ color: p.color, roughness: p.roughness, metalness: p.metalness, opacity: p.opacity, transparent: p.transparent })}
              >
                <span className="w-5 h-5 rounded-sm border border-zinc-500" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      <SectionHeading>Color</SectionHeading>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
          value={material.color}
          onChange={e => onChange({ color: e.target.value })}
        />
        <span className="text-xs text-zinc-300 font-mono">{material.color.toUpperCase()}</span>
      </div>
      <SectionHeading>Surface</SectionHeading>
      <DragInput label="Roughness" value={material.roughness} min={0} max={1} step={0.005} decimals={3} onChange={v => onChange({ roughness: v })} />
      <div className="mt-1" />
      <DragInput label="Metalness" value={material.metalness} min={0} max={1} step={0.005} decimals={3} onChange={v => onChange({ metalness: v })} />
      {material.transparent && (
        <>
          <div className="mt-1" />
          <DragInput label="Opacity" value={material.opacity} min={0} max={1} step={0.005} decimals={3} onChange={v => onChange({ opacity: v })} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inspector — draggable floating window
// ---------------------------------------------------------------------------

export interface InspectorProps {
  info: SelectionInfo | null;
  updateMaterialRef:  React.MutableRefObject<((props: Partial<MaterialProps>) => void) | null>;
  updateLightRef:     React.MutableRefObject<((props: Partial<LightProps>) => void) | null>;
  updateTransformRef: React.MutableRefObject<((props: Partial<TransformData>) => void) | null>;
  onClose: () => void;
  /** Initial position relative to the viewport (px). Defaults to {x:16, y:64} */
  initialPos?: { x: number; y: number };
}

export function Inspector({ info, updateMaterialRef, updateLightRef, updateTransformRef, onClose, initialPos = { x: 16, y: 64 } }: InspectorProps) {
  const [pos, setPos] = useState(initialPos);
  const dragState = useRef<{ dragging: boolean; startMX: number; startMY: number; startPX: number; startPY: number }>({
    dragging: false, startMX: 0, startMY: 0, startPX: 0, startPY: 0,
  });

  const onTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't start drag on the close button
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { dragging: true, startMX: e.clientX, startMY: e.clientY, startPX: pos.x, startPY: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startMX;
    const dy = e.clientY - dragState.current.startMY;
    setPos({ x: dragState.current.startPX + dx, y: dragState.current.startPY + dy });
  };

  const onPointerUp = () => { dragState.current.dragging = false; };

  if (!info) return null;

  const applyMaterial  = (props: Partial<MaterialProps>)  => updateMaterialRef.current?.(props);
  const applyLight     = (props: Partial<LightProps>)      => updateLightRef.current?.(props);
  const applyTransform = (props: Partial<TransformData>)   => updateTransformRef.current?.(props);

  let title = "";
  if (info.type === "floor")     title = "Floor";
  else if (info.type === "wall") title = `Wall: ${info.subType ?? ""}`;
  else if (info.type === "furniture") title = info.subType ? info.subType.charAt(0).toUpperCase() + info.subType.slice(1) : "Object";
  else if (info.type === "light") title = info.light?.type === "spotLight" ? "Spot Light" : "Point Light";

  return (
    <div
      className="fixed z-20 w-72 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Title bar — drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onTitlePointerDown}
      >
        <div className="flex items-center gap-2">
          {/* Drag grip dots */}
          <svg className="w-3 h-3 text-zinc-500 shrink-0" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="3" r="1.1"/><circle cx="9" cy="3" r="1.1"/>
            <circle cx="3" cy="6" r="1.1"/><circle cx="9" cy="6" r="1.1"/>
            <circle cx="3" cy="9" r="1.1"/><circle cx="9" cy="9" r="1.1"/>
          </svg>
          <span className="text-xs font-semibold text-white/90 capitalize">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto max-h-[calc(100vh-8rem)] px-3 pb-3">
        {/* ---- Floor / Wall --- */}
        {(info.type === "floor" || info.type === "wall") && info.material && (
          <MaterialSection material={info.material} showPresets={true} onChange={applyMaterial} />
        )}

        {/* ---- Furniture ----- */}
        {info.type === "furniture" && info.transform && (
          <>
            <SectionHeading>Position</SectionHeading>
            <DragInput label="X" value={info.transform.position.x} step={0.01} decimals={3} suffix=" m"
              onChange={v => applyTransform({ position: { ...info.transform!.position, x: v } })} />
            <div className="mt-1" />
            <DragInput
              label="Y"
              value={info.transform.position.y}
              step={0.01} decimals={3} suffix=" m"
              locked={true}
              lockedTooltip={"Y axis is auto-managed — furniture rests on the floor automatically"}
              onChange={() => {}}
            />
            <div className="mt-1" />
            <DragInput label="Z" value={info.transform.position.z} step={0.01} decimals={3} suffix=" m"
              onChange={v => applyTransform({ position: { ...info.transform!.position, z: v } })} />

            <SectionHeading>Rotation</SectionHeading>
            <DragInput label="X" value={info.transform.rotation.x} step={1} min={-180} max={180} decimals={1} suffix="°"
              onChange={v => applyTransform({ rotation: { ...info.transform!.rotation, x: v } })} />
            <div className="mt-1" />
            <DragInput label="Y" value={info.transform.rotation.y} step={1} min={-180} max={180} decimals={1} suffix="°"
              onChange={v => applyTransform({ rotation: { ...info.transform!.rotation, y: v } })} />
            <div className="mt-1" />
            <DragInput label="Z" value={info.transform.rotation.z} step={1} min={-180} max={180} decimals={1} suffix="°"
              onChange={v => applyTransform({ rotation: { ...info.transform!.rotation, z: v } })} />
          </>
        )}

        {/* ---- Light ---------- */}
        {info.type === "light" && info.light && (
          <LightSection light={info.light} onChange={applyLight} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Light section
// ---------------------------------------------------------------------------

function LightSection({ light, onChange }: { light: LightProps; onChange: (p: Partial<LightProps>) => void }) {
  const [kelvinInput, setKelvinInput] = useState(light.colorTemp.toString());

  useEffect(() => setKelvinInput(light.colorTemp.toString()), [light.colorTemp]);

  const commitKelvin = () => {
    const v = parseInt(kelvinInput, 10);
    if (!isNaN(v)) onChange({ colorTemp: Math.min(40000, Math.max(1000, v)) });
  };

  const previewHex = kelvinToHex(light.colorTemp);

  return (
    <>
      <SectionHeading>Color Temperature</SectionHeading>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {KELVIN_PRESETS.map(p => (
          <button
            key={p.k}
            className={`flex flex-col items-center py-1.5 px-1 rounded text-xs transition-colors ${light.colorTemp === p.k ? "bg-blue-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-white"}`}
            onClick={() => onChange({ colorTemp: p.k })}
          >
            <span className="w-4 h-4 rounded-full mb-0.5 border border-zinc-400" style={{ background: kelvinToHex(p.k) }} />
            <span className="leading-none">{p.label}</span>
            <span className="leading-none text-zinc-400" style={{ fontSize: "0.6rem" }}>{p.sub}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <input
          type="range" min={1000} max={10000} step={100}
          value={light.colorTemp}
          className="flex-1 accent-blue-400"
          onChange={e => onChange({ colorTemp: parseInt(e.target.value, 10) })}
        />
        <input
          className="w-16 bg-zinc-700 text-white text-xs px-1 py-0.5 rounded outline-none focus:ring-1 focus:ring-blue-400 text-right"
          value={kelvinInput}
          onChange={e => setKelvinInput(e.target.value)}
          onBlur={commitKelvin}
          onKeyDown={e => { if (e.key === "Enter") commitKelvin(); }}
        />
        <span className="text-xs text-zinc-400">K</span>
        <span className="w-4 h-4 rounded-sm border border-zinc-500 shrink-0" style={{ background: previewHex }} />
      </div>

      <SectionHeading>Intensity</SectionHeading>
      <DragInput label="Intensity" value={light.intensity} min={0} max={100} step={0.1} decimals={1}
        onChange={v => onChange({ intensity: v })} />
      <div className="mt-1" />
      <DragInput label="Distance" value={light.distance} min={0} max={50} step={0.1} decimals={1} suffix=" m"
        onChange={v => onChange({ distance: v })} />

      {light.type === "spotLight" && (
        <>
          <SectionHeading>Spot</SectionHeading>
          <DragInput label="Angle" value={(light.angle ?? 0.5) * (180 / Math.PI)} min={1} max={90} step={1} decimals={1} suffix="°"
            onChange={v => onChange({ angle: v * (Math.PI / 180) })} />
          <div className="mt-1" />
          <DragInput label="Penumbra" value={light.penumbra ?? 0.1} min={0} max={1} step={0.01} decimals={2}
            onChange={v => onChange({ penumbra: v })} />
        </>
      )}

      <SectionHeading>Shadow</SectionHeading>
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          className="relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: light.castShadow ? "#3b82f6" : "#52525b" }}
          onClick={() => onChange({ castShadow: !light.castShadow })}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
            style={{ left: light.castShadow ? "auto" : "0.125rem", right: light.castShadow ? "0.125rem" : "auto" }}
          />
        </div>
        <span className="text-xs text-zinc-300">Cast Shadows</span>
      </label>
    </>
  );
}
