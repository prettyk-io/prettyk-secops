/**
 * W2 Pre-flight Coach — amber warning strip перед кнопкой Run.
 *
 * Показывает warnings от Qwen3 (не блокирует запуск, advisory-only).
 * Орфановые ноды приглушаются (opacity 0.35, desaturate).
 */
import { useEffect, useState } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { LoadingOutlined, RobotOutlined, WarningOutlined } from '@ant-design/icons';
import { fetchAiEnabled, requestPreflight, type PreflightWarning } from '../admin/adminApi';

const { Text } = Typography;

const CODE_ICONS: Record<string, string> = {
  AUTH_NOT_APPLIED: '🔐',
  ORPHAN_FUZZER: '👻',
  ORPHAN_PAGE: '📄',
  TIMEOUT_SUGGESTION: '⏱',
  TARGET_MISMATCH: '🎯',
  PAGE_MODEL_UNUSED: '📘',
};

const CODE_COLORS: Record<string, string> = {
  AUTH_NOT_APPLIED: '#F59E0B',
  ORPHAN_FUZZER: '#A78BFA',
  ORPHAN_PAGE: '#A78BFA',
  TIMEOUT_SUGGESTION: '#38BDF8',
  TARGET_MISMATCH: '#EF4444',
  PAGE_MODEL_UNUSED: '#A78BFA',
};

export interface PreflightAdvisoryStripProps {
  wired: unknown;
  onIgnoreWarning?: (code: string, entityId?: string) => void;
}

export function PreflightAdvisoryStrip({ wired, onIgnoreWarning }: PreflightAdvisoryStripProps) {
  const [warnings, setWarnings] = useState<PreflightWarning[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAiEnabled().then(setAiEnabled);
  }, []);

  const runPreflight = async () => {
    setLoading(true);
    const result = await requestPreflight(wired);
    setLoading(false);
    if (result) {
      setWarnings(result.warnings);
      setSummary(result.summary);
    }
  };

  const visible = warnings.filter((w) => !dismissed.has(w.code + (w.entity_id || '')));

  if (!aiEnabled && !loading && warnings.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {!loading && warnings.length === 0 && aiEnabled && (
        <Button
          size="small"
          type="text"
          icon={<RobotOutlined />}
          onClick={runPreflight}
          style={{ color: '#A78BFA', fontSize: 11 }}
        >
          Pre-flight Check
        </Button>
      )}

      {loading && (
        <Space size={4}>
          <LoadingOutlined style={{ color: '#A78BFA' }} />
          <Text style={{ color: '#94A3B8', fontSize: 11 }}>Pre-flight check...</Text>
        </Space>
      )}

      {visible.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 8, padding: '8px 12px', marginTop: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: visible.length > 0 ? 4 : 0 }}>
            <Space size={4}>
              <WarningOutlined style={{ color: '#F59E0B', fontSize: 12 }} />
              <Text strong style={{ color: '#F59E0B', fontSize: 12 }}>Pre-flight Advisory</Text>
              <Tag color="#F59E0B" style={{ fontSize: 10, margin: 0 }}>{visible.length} warning(s)</Tag>
            </Space>
            <Button size="small" type="text" onClick={runPreflight} icon={<RobotOutlined />}
              style={{ color: '#A78BFA', fontSize: 10, padding: '0 4px' }}>Re-run</Button>
          </div>
          {summary && <Text style={{ color: '#CBD5E1', fontSize: 11, display: 'block', marginBottom: 6 }}>{summary}</Text>}
          <Space size={4} wrap>
            {visible.map((w, i) => {
              const key = w.code + (w.entity_id || '');
              const color = CODE_COLORS[w.code] || '#F59E0B';
              return (
                <Tag
                  key={key}
                  closable
                  onClose={() => {
                    setDismissed((prev) => new Set(prev).add(key));
                    onIgnoreWarning?.(w.code, w.entity_id);
                  }}
                  color={color}
                  style={{ fontSize: 10, margin: '1px 2px', cursor: 'default' }}
                >
                  {CODE_ICONS[w.code] || '⚠'} {w.text}
                </Tag>
              );
            })}
          </Space>
        </div>
      )}
    </div>
  );
}