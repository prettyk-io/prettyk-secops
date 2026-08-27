import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Key, Shield } from "lucide-react";

export interface AuthDeckNodeData {
  title: string;
  method: "bearer" | "basic" | "cookie" | "form";
  description: string;
}

const METHOD_COLORS: Record<string, string> = {
  bearer: "#a855f7",
  basic: "#f59e0b",
  cookie: "#38bdf8",
  form: "#22c55e",
};

const METHOD_LABELS: Record<string, string> = {
  bearer: "Bearer Token",
  basic: "HTTP Basic",
  cookie: "Session Cookie",
  form: "Form Login",
};

export function AuthDeckNode({ data }: NodeProps) {
  const d = data as unknown as AuthDeckNodeData;
  const accent = METHOD_COLORS[d.method] ?? "#a855f7";

  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${accent}33`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 8,
        minWidth: 280,
        maxWidth: 380,
        fontFamily: "Golos UI, sans-serif",
        color: "#e2e8f0",
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: accent, width: 8, height: 8 }} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div
          className="flex items-center justify-center rounded size-6 shrink-0"
          style={{ background: `${accent}22` }}
        >
          <Key className="size-3.5" style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{d.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${accent}18`, color: accent }}
            >
              {METHOD_LABELS[d.method] ?? d.method}
            </span>
            {d.description && (
              <span className="text-[10px] truncate" style={{ color: "#64748b" }}>
                {d.description}
              </span>
            )}
          </div>
        </div>
        <Shield className="size-3.5 shrink-0" style={{ color: "#334155" }} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: accent, width: 8, height: 8 }} />
    </div>
  );
}