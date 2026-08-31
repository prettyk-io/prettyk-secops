/**
 * PERS-B2 / ADM-WIRE-2: Evidence Panel — MUI (Paper/Box/Typography only).
 */
import { useState, useEffect } from 'react';
import { Paper, Typography, CircularProgress, Button } from '@mui/material';
import { VerifiedUser } from '@mui/icons-material';

export type EvidenceKind = 'video' | 'screenshot' | 'har' | 'report' | 'other';

export interface EvidenceRecord {
  id: string; runId: string; kind: EvidenceKind; label: string;
  sha256: string; sizeBytes: number; createdAt: string;
  presignedUrl: string; localPath?: string;
}

export interface EvidencePanelProps { runId: string | null; }

const KIND_EMOJI: Record<EvidenceKind, string> = { video: '🎬', screenshot: '📸', har: '📄', report: '📊', other: '📎' };

function fmt(n: number): string { return n < 1024 ? `${n} B` : n < 1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/(1024*1024)).toFixed(1)} MB`; }

async function fetchEvidence(runId: string): Promise<EvidenceRecord[]> {
  try { const r = await fetch(`/api/runs/${runId}/evidence`); if (!r.ok) return []; const data = await r.json(); return (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])) as EvidenceRecord[]; } catch { return []; }
}

function tag(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${bg};color:${color};border:1px solid ${color}40">${text}</span>`;
}

export function EvidencePanel({ runId }: EvidencePanelProps) {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!runId) { setRecords([]); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetchEvidence(runId).then((data) => { if (cancelled) return; setRecords(data); setLoading(false); }).catch(() => { if (cancelled) return; setError('Не удалось загрузить evidence'); setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  useEffect(() => { if (copied) { const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); } }, [copied]);

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><CircularProgress size={24} /></div>;
  if (error) return <Typography color="error" textAlign="center" p={2}>{error}</Typography>;
  if (records.length === 0 && runId) return <Typography color="text.secondary" textAlign="center" p={2}>Нет evidence</Typography>;
  if (!runId) return <Typography color="text.secondary" textAlign="center" p={2}>Выберите прогон</Typography>;

  const totalSize = records.reduce((sum, r) => sum + r.sizeBytes, 0);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <VerifiedUser sx={{ color: '#22D3EE' }} />
        <Typography variant="body1" fontWeight={600} color="#E2E8F0" style={{ flex: 1 }}>Evidence</Typography>
        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600 }}>{records.length} файлов</span>
        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: '#1E293B', color: '#94A3B8' }}>{fmt(totalSize)}</span>
      </div>
      {records.map((r) => (
        <Paper key={r.id} sx={{ p: 1.5, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 2, mb: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{KIND_EMOJI[r.kind]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} color="#E2E8F0" noWrap>{r.label}</Typography>
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }} dangerouslySetInnerHTML={{ __html: tag(r.kind, 'rgba(56,189,248,0.1)', '#38bdf8') + tag(fmt(r.sizeBytes), '#1E293B', '#64748B') + `<span title="${r.sha256}" onclick="navigator.clipboard.writeText('${r.sha256}')" style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;background:#1E293B;color:#475569;cursor:pointer;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.sha256.slice(0,12)}…</span>` }} />
            </div>
            {r.presignedUrl && <Button size="small" href={r.presignedUrl} target="_blank" rel="noreferrer" sx={{ color: '#38BDF8', fontSize: 11, minWidth: 'auto', textTransform: 'none' }}>Открыть</Button>}
          </div>
        </Paper>
      ))}
      {copied && <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '6px 16px', background: '#22c55e', color: '#fff', borderRadius: 6, fontSize: 12, zIndex: 9999 }}>SHA256 скопирован</div>}
    </div>
  );
}