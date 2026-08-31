/**
 * VN-FBR-1 / ADM-WIRE-2: EvidencePanel — MUI (Paper/Box/Typography only to avoid TS2769).
 */
import { useEffect, useState } from 'react';
import { Paper, Typography } from '@mui/material';
import { fetchEvidence, type EvidenceCard } from './adminApi';
import { LocatorHealthPanel } from './LocatorHealthPanel';
import { LogAnomalyStrip } from './LogAnomalyStrip';

function chip(s: string, bg: string, color: string) {
  return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${bg};color:${color};border:1px solid ${color}40">${s}</span>`;
}

function sevChip(v?: string): string {
  const sv = (v || '').toLowerCase();
  const m: Record<string, [string,string]> = { critical: ['rgba(239,68,68,0.15)','#ef4444'], high: ['rgba(249,115,22,0.15)','#f97316'], medium: ['rgba(245,158,11,0.15)','#f59e0b'], low: ['rgba(34,197,94,0.15)','#22c55e'] };
  const [bg,c] = m[sv] ?? ['rgba(148,163,184,0.1)','#94a3b8'];
  return chip(v||'—', bg, c);
}

export function EvidencePanel(): React.JSX.Element {
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [down, setDown] = useState(true);
  useEffect(() => { let c=false; fetchEvidence().then(res => { if(c)return; setCards(res.items); setDown(!res.ok); }); return () => {c=true}; }, []);

  if (down && cards.length === 0) return <Typography variant="body2" color="text.secondary">Нет данных</Typography>;

  return (
    <div data-testid="evidence-panel">
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
        {cards.map((c,i) =>
          <Paper key={c.check_id??i} sx={{p:1.5,background:'#0F172A',border:'1px solid #1E293B',borderRadius:2}}>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <Typography variant="caption" fontFamily="monospace" color="text.secondary">pack: {c.check_id??'—'}</Typography>
              <div style={{display:'flex',gap:4}} dangerouslySetInnerHTML={{__html: (c.severity?sevChip(c.severity):'') + (c.finding_type?chip(c.finding_type,'rgba(56,189,248,0.1)','#38bdf8'):'') }} />
              {c.screenshot ? <img src={c.screenshot} alt="" style={{width:'100%',borderRadius:4,border:'1px solid #334155'}} onError={e => { (e.currentTarget as HTMLElement).style.display='none' }} /> : null}
              <Typography variant="caption" color="text.secondary">{c.source||'source: —'}</Typography>
            </div>
          </Paper>
        )}
      </div>
      <div style={{marginTop:24,display:'flex',flexDirection:'column',gap:16}}>
        <LocatorHealthPanel locators={[]} />
        <LogAnomalyStrip anomalies={[]} />
      </div>
    </div>
  );
}