/**
 * PK-BL-6: Drop & Strike Modal Shell — Tailwind, target URL, preflight chip, run button.
 */
import { useState } from 'react';
import { Play, X, Shield, Globe, CheckCircle } from 'lucide-react';

export interface StrikeModalProps {
  open: boolean;
  onClose: () => void;
  onRun: (url: string) => void;
  defaultUrl?: string;
  preflightPassed?: boolean;
}

export function StrikeModal({ open, onClose, onRun, defaultUrl = 'http://juice-shop:3000', preflightPassed = true }: StrikeModalProps) {
  const [url, setUrl] = useState(defaultUrl);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[440px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-7 rounded bg-gradient-to-br from-cyan-500 to-violet-600">
              <Shield className="size-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-100">Drop & Strike</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-slate-400"><X className="size-4" /></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Target URL</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">
              <Globe className="size-3.5 text-slate-500 shrink-0" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-transparent text-xs text-slate-200 outline-none font-mono"
                placeholder="http://juice-shop:3000"
              />
            </div>
          </div>
          {preflightPassed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="size-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-emerald-300">Preflight passed — scope & policy verified</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-700 bg-slate-800/50">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-[11px] text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => { onRun(url); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold text-slate-900 bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 transition-all"
          >
            <Play className="size-3.5" /> Strike
          </button>
        </div>
      </div>
    </div>
  );
}