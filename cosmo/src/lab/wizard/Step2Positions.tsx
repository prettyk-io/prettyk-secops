import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useLabSession, type PositionMarker } from '../LabSessionProvider';

const { Text } = Typography;

const MARKER_COLORS = [
  { bg: 'rgba(147,51,234,0.25)', border: '#9333EA', pill: '#9333EA' },
  { bg: 'rgba(56,189,248,0.25)', border: '#38BDF8', pill: '#38BDF8' },
  { bg: 'rgba(34,197,94,0.25)', border: '#22C55E', pill: '#22C55E' },
  { bg: 'rgba(251,146,60,0.25)', border: '#FB923C', pill: '#FB923C' },
  { bg: 'rgba(244,114,182,0.25)', border: '#F472B6', pill: '#F472B6' },
  { bg: 'rgba(250,204,21,0.25)', border: '#FACC15', pill: '#FACC15' },
];

const AUTO_MARKER_NAMES = ['url_q', 'body_user', 'body_pass', 'cookie_sess', 'header_auth', 'csrf_token'];

interface AutoPosition {
  name: string;
  value: string;
  start: number;
  end: number;
}

function autoDetectPositions(raw: string): AutoPosition[] {
  const positions: AutoPosition[] = [];
  const lines = raw.split('\n');
  let bodyStart = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.trim() === '') { bodyStart = i + 1; break; }
  }

  const requestLine = lines[0];
  if (!requestLine) return positions;
  const urlMatch = requestLine.match(/(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)/);
  if (urlMatch && urlMatch[1]) {
    const url = urlMatch[1];
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const queryString = url.substring(qIdx + 1);
      const params = queryString.split('&');
      const urlStart = requestLine.indexOf(url) + qIdx + 1;
      for (const param of params) {
        const eqIdx = param.indexOf('=');
        if (eqIdx > 0) {
          const name = param.substring(0, eqIdx);
          const value = param.substring(eqIdx + 1);
          const valueIdx = queryString.indexOf(param);
          positions.push({ name: `query_${name}`, value, start: urlStart + valueIdx + eqIdx + 1, end: urlStart + valueIdx + param.length });
        }
      }
    }
  }

  const maxI = bodyStart >= 0 ? Math.min(bodyStart, lines.length) : lines.length;
  for (let i = 1; i < maxI; i++) {
    const line = lines[i];
    if (!line) continue;
    const ci = line.indexOf(':');
    if (ci > 0) {
      const headerName = line.substring(0, ci).trim().toLowerCase();
      const headerValue = line.substring(ci + 1).trim();
      if (headerName === 'cookie') {
        const cookies = headerValue.split(';').map((c) => c.trim());
        let offset = line.indexOf(headerValue);
        for (const cookie of cookies) {
          const eqIdx = cookie.indexOf('=');
          if (eqIdx > 0) {
            const val = cookie.substring(eqIdx + 1);
            const valStart = line.indexOf(val, offset);
            if (valStart >= 0) positions.push({ name: `cookie_${cookie.substring(0, eqIdx)}`, value: val, start: valStart, end: valStart + val.length });
          }
          offset = line.indexOf(cookie, offset) + cookie.length;
        }
      }
      if (headerName === 'authorization') {
        positions.push({ name: 'auth_header', value: headerValue, start: line.indexOf(headerValue), end: line.indexOf(headerValue) + headerValue.length });
      }
    }
  }

  if (bodyStart > 0) {
    const bodyLines = lines.slice(bodyStart);
    const bodyText = bodyLines.join('\n').trim();
    if (bodyText && (bodyText.startsWith('{') || bodyText.startsWith('['))) {
      try {
        const obj = JSON.parse(bodyText);
        const walkJson = (data: unknown, path: string): void => {
          if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
              const fullPath = path ? `${path}.${key}` : key;
              if (typeof value === 'string' && value.length > 0) {
                const valStart = raw.indexOf(`"${value}"`, raw.indexOf(bodyText));
                if (valStart >= 0) {
                  positions.push({ name: `body_${fullPath}`, value, start: valStart + 1, end: valStart + 1 + value.length });
                }
              } else if (typeof value === 'object' && value !== null) {
                walkJson(value, fullPath);
              }
            }
          }
        };
        walkJson(obj, '');
      } catch { /* ignore */ }
    } else if (bodyText) {
      const kvPairs = bodyText.split('&');
      let offset = raw.indexOf(bodyText);
      for (const pair of kvPairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
          const val = pair.substring(eqIdx + 1);
          const valStart = raw.indexOf(val, offset);
          if (valStart >= 0) positions.push({ name: `body_${pair.substring(0, eqIdx)}`, value: val, start: valStart, end: valStart + val.length });
        }
        offset += pair.length + 1;
      }
    }
  }

  return positions;
}

export interface Step2PositionsProps {
  valid: boolean;
  onValidChange: (v: boolean) => void;
}

export function Step2Positions({ valid: _valid, onValidChange }: Step2PositionsProps) {
  const { session, updateAttack } = useLabSession();
  const { rawHttp, markers } = session.singleAttack;
  const [editingMarker, setEditingMarker] = useState<PositionMarker | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    onValidChange(markers.length > 0);
  }, [markers.length, onValidChange]);

  const sortedMarkers = useMemo(() => [...markers].sort((a, b) => a.start - b.start), [markers]);

  const handleMarkerClick = useCallback((marker: PositionMarker) => {
    setEditingMarker(marker);
    setEditingName(marker.name);
    setEditModalOpen(true);
  }, []);

  const markedDisplay = useMemo(() => {
    if (!rawHttp) return <Text style={{ color: '#64748B' }}>Вставьте RAW HTTP на шаге 1</Text>;
    const parts: { text: string; marker?: PositionMarker; colorIdx?: number }[] = [];
    let lastEnd = 0;
    for (let i = 0; i < sortedMarkers.length; i++) {
      const m = sortedMarkers[i]!;
      if (m.start > lastEnd) parts.push({ text: rawHttp.substring(lastEnd, m.start) });
      parts.push({ text: rawHttp.substring(m.start, m.end), marker: m, colorIdx: i % MARKER_COLORS.length });
      lastEnd = m.end;
    }
    if (lastEnd < rawHttp.length) parts.push({ text: rawHttp.substring(lastEnd) });

    return (
      <pre style={{
        background: '#0B0F17', color: '#E2E8F0', padding: 12, borderRadius: 6,
        maxHeight: 280, minHeight: 120, overflowY: 'auto',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        border: '1px solid rgba(255,255,255,0.12)',
        lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        cursor: 'text',
      }}>
        {parts.map((p, i) => {
          if (p.marker) {
            const c = MARKER_COLORS[p.colorIdx ?? 0]!;
            return (
              <span
                key={i}
                onClick={() => handleMarkerClick(p.marker!)}
                title={`${p.marker!.name} = ${p.marker!.value}`}
                style={{
                  background: c.bg, borderBottom: `2px solid ${c.border}`,
                  cursor: 'pointer', padding: '1px 0', borderRadius: 2,
                  transition: 'background 0.15s',
                }}
              >
                {p.text}
              </span>
            );
          }
          return <span key={i}>{p.text}</span>;
        })}
      </pre>
    );
  }, [rawHttp, sortedMarkers, handleMarkerClick]);

  const handleSaveMarkerName = useCallback(() => {
    if (!editingMarker) return;
    const updated = markers.map((m) =>
      m.id === editingMarker.id ? { ...m, name: editingName || m.name } : m
    );
    updateAttack({ markers: updated });
    setEditModalOpen(false);
    setEditingMarker(null);
  }, [editingMarker, editingName, markers, updateAttack]);

  const handleDeleteMarker = useCallback(() => {
    if (!editingMarker) return;
    const updated = markers.filter((m) => m.id !== editingMarker.id);
    updateAttack({ markers: updated });
    onValidChange(updated.length >= 1);
    setEditModalOpen(false);
    setEditingMarker(null);
  }, [editingMarker, markers, updateAttack, onValidChange]);

  const handleAutoPlace = useCallback(() => {
    const existingValues = new Set(markers.map((m) => m.value));
    const auto = autoDetectPositions(rawHttp).filter((a) => !existingValues.has(a.value));
    if (auto.length === 0) return;
    // The backend consumes §...§ markers from raw_http, not the UI-only ranges.
    // Insert from right to left so source offsets remain valid while building RAW.
    const sortedAuto = [...auto].sort((a, b) => a.start - b.start);
    let markedRaw = rawHttp;
    for (let i = sortedAuto.length - 1; i >= 0; i--) {
      const position = sortedAuto[i]!;
      markedRaw = `${markedRaw.slice(0, position.start)}§${position.value}§${markedRaw.slice(position.end)}`;
    }
    let offset = 0;
    const newMarkers: PositionMarker[] = sortedAuto.map((a, i) => {
      const start = a.start + offset + 1;
      offset += 2;
      return {
        id: `marker_${Date.now()}_${i}`,
        name: a.name || AUTO_MARKER_NAMES[i % AUTO_MARKER_NAMES.length]!,
        value: a.value,
        start,
        end: start + a.value.length,
      };
    });
    const updated = [...markers, ...newMarkers];
    updateAttack({ rawHttp: markedRaw, markers: updated });
    onValidChange(updated.length >= 1);
  }, [rawHttp, markers, updateAttack, onValidChange]);

  const tagColor = (pill: string): string => {
    if (pill === '#9333EA') return 'purple';
    if (pill === '#38BDF8') return 'blue';
    if (pill === '#22C55E') return 'green';
    if (pill === '#FB923C') return 'orange';
    if (pill === '#F472B6') return 'magenta';
    return 'gold';
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Space size="small">
          <Tag color="#9333EA" style={{ fontWeight: 600 }}>{markers.length} позиций отмечено</Tag>
          {markers.length === 0 && (
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>
              Кликните по параметру в запросе для отметки или нажмите «Авто-расстановка»
            </Text>
          )}
        </Space>
        <Button
          size="small"
          icon={<ThunderboltOutlined />}
          onClick={handleAutoPlace}
          disabled={!rawHttp}
          style={{
            borderRadius: 4, background: 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)',
            border: 'none', color: '#fff', fontWeight: 600,
          }}
        >
          Авто-расстановка
        </Button>
      </div>

      {markedDisplay}

      {sortedMarkers.length > 0 && (
        <Space size={4} wrap style={{ marginTop: 10 }}>
          {sortedMarkers.map((m, i) => {
            const c = MARKER_COLORS[i % MARKER_COLORS.length]!;
            return (
              <Tag
                key={m.id}
                color={tagColor(c.pill)}
                closable
                onClose={() => {
                  const updated = markers.filter((mk) => mk.id !== m.id);
                  updateAttack({ markers: updated });
                  onValidChange(updated.length >= 1);
                }}
                style={{ cursor: 'pointer', fontSize: 11 }}
                onClick={() => handleMarkerClick(m)}
              >
                §{m.name}§
              </Tag>
            );
          })}
        </Space>
      )}

      <Modal
        title="Редактировать маркер"
        open={editModalOpen}
        onOk={handleSaveMarkerName}
        onCancel={() => { setEditModalOpen(false); setEditingMarker(null); }}
        okText="Сохранить"
        cancelText="Отмена"
        styles={{ content: { background: '#111827' }, header: { background: '#111827', color: '#F8FAFC' } }}
      >
        {editingMarker && (
          <div>
            <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 2 }}>Значение</Text>
            <Text style={{ fontFamily: 'JetBrains Mono', color: '#38BDF8', fontSize: 13, display: 'block', marginBottom: 12 }}>
              {editingMarker.value}
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 4 }}>Имя маркера</Text>
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              style={{
                fontFamily: 'JetBrains Mono, monospace', background: '#0B0F17',
                color: '#E2E8F0', borderColor: 'rgba(255,255,255,0.12)', marginBottom: 12,
              }}
            />
            <Button danger size="small" icon={<DeleteOutlined />} onClick={handleDeleteMarker}>
              Удалить маркер
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
