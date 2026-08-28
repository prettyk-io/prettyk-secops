/**
 * PERS-B2: Evidence Panel — MinIO evidence card browser.
 *
 * Читает evidence[] из /api/runs/:id/evidence (PERS-B1 API).
 * presigned_url — временная ссылка на объект в MinIO.
 * Pure Box: локальный fallback на reports/.
 */
import { useState, useEffect } from 'react';
import { Card, Tag, Typography, Spin, Empty, Button, Tooltip, message } from 'antd';
import {
  VideoCameraOutlined, CameraOutlined, FileTextOutlined,
  LinkOutlined, CopyOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';

export type EvidenceKind = 'video' | 'screenshot' | 'har' | 'report' | 'other';

export interface EvidenceRecord {
  id: string; runId: string; kind: EvidenceKind; label: string;
  sha256: string; sizeBytes: number; createdAt: string;
  presignedUrl: string; localPath?: string;
}

export interface EvidencePanelProps { runId: string | null; }

const KIND_ICONS: Record<EvidenceKind, React.ReactNode> = {
  video: <VideoCameraOutlined style={{ color: '#a855f7' }} />,
  screenshot: <CameraOutlined style={{ color: '#22d3ee' }} />,
  har: <FileTextOutlined style={{ color: '#f59e0b' }} />,
  report: <FileTextOutlined style={{ color: '#ef4444' }} />,
  other: <FileTextOutlined style={{ color: '#94a3b8' }} />,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchEvidence(runId: string): Promise<EvidenceRecord[]> {
  try {
    const r = await fetch(`/api/runs/${runId}/evidence`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as EvidenceRecord[];
  } catch { return []; }
}

function EvidenceCard({ record }: { record: EvidenceRecord }) {
  const handleCopySha = () => {
    navigator.clipboard.writeText(record.sha256).then(
      () => message.success('SHA256 скопирован'),
      () => message.error('Не удалось скопировать'),
    );
  };

  return (
    <Card size="small" style={{ background: '#0F172A', borderColor: '#1E293B', marginBottom: 8 }} bodyStyle={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {KIND_ICONS[record.kind]}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text strong style={{ color: '#E2E8F0', fontSize: 13 }}>{record.label}</Typography.Text>
          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
            <Tag color="cyan" style={{ fontSize: 10 }}>{record.kind}</Tag>
            <Tag style={{ fontSize: 10, background: '#1E293B', color: '#64748B', border: 'none' }}>{formatBytes(record.sizeBytes)}</Tag>
            <Tooltip title={record.sha256}>
              <Tag onClick={handleCopySha} style={{ fontSize: 9, background: '#1E293B', color: '#475569', border: 'none', cursor: 'pointer', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {record.sha256.slice(0, 12)}…<CopyOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </Tag>
            </Tooltip>
          </div>
        </div>
        <Button size="small" icon={<LinkOutlined />} href={record.presignedUrl} target="_blank" rel="noreferrer" type="link" style={{ color: '#38BDF8' }}>Открыть</Button>
      </div>
    </Card>
  );
}

export function EvidencePanel({ runId }: EvidencePanelProps) {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) { setRecords([]); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetchEvidence(runId).then((data: EvidenceRecord[]) => {
      if (cancelled) return;
      setRecords(data); setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Не удалось загрузить evidence'); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>;
  if (error) return <div style={{ textAlign: 'center', padding: 24, color: '#EF4444', fontSize: 13 }}>{error}</div>;
  if (records.length === 0 && runId) return <Empty description="Нет evidence для этого прогона" />;
  if (!runId) return <Empty description="Выберите прогон" />;

  const totalSize = records.reduce((sum, r) => sum + r.sizeBytes, 0);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SafetyCertificateOutlined style={{ color: '#22D3EE' }} />
        <Typography.Text strong style={{ color: '#E2E8F0', fontSize: 14, flex: 1 }}>Evidence</Typography.Text>
        <Tag color="blue">{records.length} файлов</Tag>
        <Tag style={{ background: '#1E293B', color: '#94A3B8', border: 'none' }}>{formatBytes(totalSize)}</Tag>
      </div>
      {records.map((r) => <EvidenceCard key={r.id} record={r} />)}
    </div>
  );
}