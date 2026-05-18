import type { ObjectType } from "./RoomScene";

interface ObjectPanelProps {
  onAdd: (type: ObjectType) => void;
}

const OBJECTS: { type: ObjectType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    type: "cube",
    label: "Cube",
    desc: "0.6 × 0.6 m",
    icon: (
      // Simple isometric box icon
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <polygon points="20,4 36,13 36,27 20,36 4,27 4,13" fill="#7b9e87" fillOpacity={0.25} stroke="#7b9e87" strokeWidth={1.5}/>
        <polyline points="20,4 20,18 4,27" stroke="#7b9e87" strokeWidth={1.5} fill="none"/>
        <line x1="20" y1="18" x2="36" y2="27" stroke="#7b9e87" strokeWidth={1.5}/>
        <line x1="20" y1="18" x2="20" y2="36" stroke="#7b9e87" strokeWidth={1.5}/>
      </svg>
    ),
  },
  {
    type: "sphere",
    label: "Sphere",
    desc: "ø 0.7 m",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <circle cx="20" cy="20" r="15" fill="#b07b9e" fillOpacity={0.25} stroke="#b07b9e" strokeWidth={1.5}/>
        <ellipse cx="20" cy="20" rx="15" ry="6" stroke="#b07b9e" strokeWidth={1} strokeDasharray="3 2"/>
        <line x1="20" y1="5" x2="20" y2="35" stroke="#b07b9e" strokeWidth={1} strokeDasharray="3 2"/>
      </svg>
    ),
  },
  {
    type: "cylinder",
    label: "Cylinder",
    desc: "ø 0.6 × 0.8 m",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <ellipse cx="20" cy="10" rx="14" ry="5" fill="#7b8fb0" fillOpacity={0.35} stroke="#7b8fb0" strokeWidth={1.5}/>
        <rect x="6" y="10" width="28" height="20" fill="#7b8fb0" fillOpacity={0.15}/>
        <line x1="6" y1="10" x2="6" y2="30" stroke="#7b8fb0" strokeWidth={1.5}/>
        <line x1="34" y1="10" x2="34" y2="30" stroke="#7b8fb0" strokeWidth={1.5}/>
        <ellipse cx="20" cy="30" rx="14" ry="5" fill="#7b8fb0" fillOpacity={0.25} stroke="#7b8fb0" strokeWidth={1.5}/>
      </svg>
    ),
  },
];

export function ObjectPanel({ onAdd }: ObjectPanelProps) {
  return (
    <div className="flex flex-col gap-2 h-full rounded-2xl border border-border bg-bg-card p-3 overflow-y-auto">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider px-1 pb-1">
        Objects
      </p>

      {OBJECTS.map(({ type, label, desc, icon }) => (
        <button
          key={type}
          onClick={() => onAdd(type)}
          className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-bg-primary hover:border-accent/50 hover:bg-bg-card-hover active:scale-95 transition-all duration-150 p-3 text-center"
          title={`Add ${label}`}
        >
          <div className="group-hover:scale-110 transition-transform duration-150">
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium text-text-primary">{label}</p>
            <p className="text-[10px] text-text-muted font-mono mt-0.5">{desc}</p>
          </div>
        </button>
      ))}

      <div className="mt-auto pt-2 border-t border-border">
        <p className="text-[10px] text-text-muted text-center leading-relaxed">
          Click a shape to add it at room center
        </p>
      </div>
    </div>
  );
}
