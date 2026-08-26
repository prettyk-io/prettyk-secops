/**
 * PK-BL-7: Universal Drag & Drop Seed Zone — auto-detect, visual feedback, file preview.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, FileJson, X, Check } from 'lucide-react';

export type SeedFormat = 'wired' | 'playwright' | 'har' | 'openapi' | 'graphql' | 'csv' | null;

export interface DroppedSeed {
  name: string;
  format: SeedFormat;
  size: number;
  content: string;
}

function detectFormat(fileName: string): SeedFormat {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'har') return 'har';
  if (ext === 'json') return 'wired';
  if (ext === 'csv') return 'csv';
  if (ext === 'yaml' || ext === 'yml') return 'openapi';
  if (ext === 'graphql' || ext === 'gql') return 'graphql';
  return null;
}

function formatLabel(f: SeedFormat): string {
  const m: Record<string, string> = {
    wired: 'PrettyK Wired', playwright: 'Playwright Script', har: 'HAR Archive',
    openapi: 'OpenAPI Spec', graphql: 'GraphQL SDL', csv: 'CSV Dataset',
  };
  return m[f ?? ''] ?? 'Unknown';
}

function formatColor(f: SeedFormat): string {
  const m: Record<string, string> = {
    wired: 'from-cyan-500 to-blue-600', playwright: 'from-emerald-500 to-teal-600',
    har: 'from-amber-500 to-orange-600', openapi: 'from-violet-500 to-purple-600',
    graphql: 'from-pink-500 to-rose-600', csv: 'from-slate-500 to-slate-600',
  };
  return m[f ?? ''] ?? 'from-slate-500 to-slate-600';
}

export interface DragDropZoneProps {
  onDropSeed: (seed: DroppedSeed) => void;
  /** Уже добавленные seeds. */
  seeds?: DroppedSeed[];
  onRemoveSeed?: (index: number) => void;
}

export function DragDropZone({ onDropSeed, seeds = [], onRemoveSeed }: DragDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const processFile = useCallback((file: File) => {
    const format = detectFormat(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      onDropSeed({
        name: file.name,
        format,
        size: file.size,
        content: reader.result as string,
      });
      setPreview(null);
    };
    reader.readAsText(file);
  }, [onDropSeed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); dragCounter.current = 0;
    Array.from(e.dataTransfer.files).forEach(processFile);
  }, [processFile]);

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragEnter={() => { dragCounter.current++; setDragging(true); }}
        onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
          dragging
            ? 'border-cyan-400 bg-cyan-500/5 shadow-[0_0_24px_rgba(56,189,248,0.15)]'
            : 'border-slate-700 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        <div className={`size-10 rounded-full flex items-center justify-center mb-1 ${dragging ? 'bg-cyan-500/20' : 'bg-slate-700/50'}`}>
          <Upload className={`size-5 ${dragging ? 'text-cyan-400' : 'text-slate-400'}`} />
        </div>
        <p className="text-xs font-semibold text-slate-300">Drop seed files here</p>
        <p className="text-[10px] text-slate-500">Wired JSON · HAR · OpenAPI · GraphQL · CSV</p>
        <p className="text-[9px] text-slate-600 mt-0.5">or click to browse</p>
        <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => { Array.from(e.target.files ?? []).forEach(processFile); e.target.value = ''; }} accept=".json,.har,.csv,.yaml,.yml,.graphql,.gql" />
      </div>

      {/* Seed list */}
      {seeds.length > 0 && (
        <div className="space-y-1">
          {seeds.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 transition-colors hover:border-slate-600">
              <div className={`size-7 rounded bg-gradient-to-br ${formatColor(s.format)} flex items-center justify-center shrink-0`}>
                {s.format === 'wired' ? <FileJson className="size-3.5 text-white" />
                  : s.format === 'har' ? <FileJson className="size-3.5 text-white" />
                  : <FileText className="size-3.5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-200 truncate">{s.name}</p>
                <p className="text-[9px] text-slate-400">{formatLabel(s.format)} · {(s.size / 1024).toFixed(1)} KB</p>
              </div>
              <Check className="size-3.5 text-emerald-400 shrink-0" />
              {onRemoveSeed && (
                <button onClick={() => onRemoveSeed(i)} className="p-0.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}