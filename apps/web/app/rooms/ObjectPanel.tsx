import type { ObjectType, WallId } from "./RoomScene";

interface ObjectPanelProps {
  onAdd: (type: ObjectType) => void;
  selectedWall: WallId | null;
}

const FLOOR_OBJECTS: { type: ObjectType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    type: "cube",
    label: "Cube",
    desc: "0.6 × 0.6 m",
    icon: (
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

const WALL_OBJECTS: { type: ObjectType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    type: "frame",
    label: "Frame",
    desc: "0.5 × 0.6 m",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="8" y="6" width="24" height="28" rx="2" fill="#a67c52" fillOpacity={0.2} stroke="#a67c52" strokeWidth={2}/>
        <rect x="12" y="10" width="16" height="20" rx="1" fill="#a67c52" fillOpacity={0.15} stroke="#a67c52" strokeWidth={1} strokeDasharray="3 2"/>
      </svg>
    ),
  },
  {
    type: "window",
    label: "Window",
    desc: "1.0 × 1.2 m",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="6" y="8" width="28" height="24" rx="2" fill="#8ecae6" fillOpacity={0.2} stroke="#8ecae6" strokeWidth={2}/>
        {/* window panes cross */}
        <line x1="20" y1="8" x2="20" y2="32" stroke="#8ecae6" strokeWidth={1.5}/>
        <line x1="6" y1="20" x2="34" y2="20" stroke="#8ecae6" strokeWidth={1.5}/>
      </svg>
    ),
  },
  {
    type: "door",
    label: "Door",
    desc: "0.9 × 2.1 m",
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
        <rect x="10" y="4" width="20" height="32" rx="2" fill="#6b4c35" fillOpacity={0.2} stroke="#6b4c35" strokeWidth={2}/>
        {/* door handle */}
        <circle cx="26" cy="20" r="2" fill="#6b4c35" fillOpacity={0.8}/>
        {/* arch hint at top */}
        <path d="M10 10 Q20 4 30 10" stroke="#6b4c35" strokeWidth={1} fill="none" strokeDasharray="3 2"/>
      </svg>
    ),
  },
];

function ObjectGroup({
  title,
  objects,
  onAdd,
  hint,
  disabled,
  disabledTooltip,
}: {
  title: string;
  objects: typeof FLOOR_OBJECTS;
  onAdd: (type: ObjectType) => void;
  hint: string;
  disabled?: boolean;
  disabledTooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1">
        {title}
      </p>
      {objects.map(({ type, label, desc, icon }) => (
        <div key={type} className="relative group/btn">
          <button
            onClick={() => !disabled && onAdd(type)}
            disabled={disabled}
            className={`w-full flex flex-col items-center gap-1.5 rounded-xl border bg-bg-primary p-2.5 text-center transition-all duration-150
              ${
                disabled
                  ? "border-border opacity-40 cursor-not-allowed"
                  : "border-border hover:border-accent/50 hover:bg-bg-card-hover active:scale-95 cursor-pointer"
              }`}
            title={disabled ? disabledTooltip : `Add ${label}`}
          >
            <div className={disabled ? "" : "group-hover/btn:scale-110 transition-transform duration-150"}>
              {icon}
            </div>
            <div>
              <p className="text-xs font-medium text-text-primary">{label}</p>
              <p className="text-[10px] text-text-muted font-mono mt-0.5">{desc}</p>
            </div>
          </button>
          {/* Tooltip on hover when disabled */}
          {disabled && disabledTooltip && (
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 z-10 hidden group-hover/btn:flex items-center">
              <div className="rounded-lg bg-gray-900 text-white text-[10px] px-2.5 py-1.5 whitespace-nowrap shadow-lg border border-white/10">
                {disabledTooltip}
              </div>
            </div>
          )}
        </div>
      ))}
      <p className="text-[10px] text-text-muted text-center leading-relaxed px-1 pb-1">
        {hint}
      </p>
    </div>
  );
}

export function ObjectPanel({ onAdd, selectedWall }: ObjectPanelProps) {
  return (
    <div className="flex flex-col gap-3 h-full rounded-2xl border border-border bg-bg-card p-3 overflow-y-auto">
      <ObjectGroup
        title="Floor"
        objects={FLOOR_OBJECTS}
        onAdd={onAdd}
        hint="Placed at room center"
      />
      <div className="border-t border-border" />
      <ObjectGroup
        title="Wall"
        objects={WALL_OBJECTS}
        onAdd={onAdd}
        hint={selectedWall ? `On: ${selectedWall} wall` : "Select a wall first"}
        disabled={!selectedWall}
        disabledTooltip="Select a wall first"
      />
    </div>
  );
}
