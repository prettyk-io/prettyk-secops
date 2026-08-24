import { useCallback, useEffect, useMemo } from 'react';
import { Card, Col, Row, Tag, Typography } from 'antd';
import { AimOutlined, ApartmentOutlined, ForkOutlined, MergeCellsOutlined } from '@ant-design/icons';
import { useLabSession, type AttackMode } from '../LabSessionProvider';

const { Text } = Typography;

interface ModeCardDef {
  mode: AttackMode;
  icon: React.JSX.Element;
  title: string;
  description: string;
  positions: string;
}

const MODES: ModeCardDef[] = [
  {
    mode: 'sniper',
    icon: <AimOutlined style={{ fontSize: 28 }} />,
    title: 'Sniper',
    description: 'Использует один словарь. Пейлоады подставляются по очереди в каждую позицию',
    positions: 'N позиций × M пейлоадов = N×M запросов',
  },
  {
    mode: 'battering_ram',
    icon: <MergeCellsOutlined style={{ fontSize: 28 }} />,
    title: 'Battering Ram',
    description: 'Одинаковый пейлоад подставляется одновременно во все позиции',
    positions: 'M пейлоадов × 1 панель = M запросов',
  },
  {
    mode: 'pitchfork',
    icon: <ForkOutlined style={{ fontSize: 28 }} />,
    title: 'Pitchfork',
    description: 'Каждой позиции — свой словарь. Пейлоады идут синхронно (первый с первым, второй со вторым)',
    positions: 'По 1 панели на каждую позицию',
  },
  {
    mode: 'cluster_bomb',
    icon: <ApartmentOutlined style={{ fontSize: 28 }} />,
    title: 'Cluster Bomb',
    description: 'Каждой позиции — свой словарь. Все комбинации (декартово произведение)',
    positions: 'Позиция1 × Позиция2 × ... всех комбинаций',
  },
];

export interface Step3AttackModeProps {
  valid: boolean;
  onValidChange: (v: boolean) => void;
}

export function Step3AttackMode({ valid: _valid, onValidChange }: Step3AttackModeProps) {
  const { session, updateAttack } = useLabSession();
  const { attackMode, markers } = session.singleAttack;

  useEffect(() => {
    onValidChange(Boolean(attackMode) && markers.length > 0);
  }, [attackMode, markers.length, onValidChange]);

  const handleSelect = useCallback((mode: AttackMode) => {
    updateAttack({ attackMode: mode });
    onValidChange(true);
  }, [updateAttack, onValidChange]);

  const estimate = useMemo(() => {
    const m = markers.length;
    if (m === 0) return { requests: 0, seconds: 0 };
    const payloadsPerSet = 10;
    switch (attackMode) {
      case 'sniper': return { requests: m * payloadsPerSet, seconds: Math.round(m * payloadsPerSet / 5) };
      case 'battering_ram': return { requests: payloadsPerSet, seconds: Math.round(payloadsPerSet / 5) };
      case 'pitchfork': return { requests: payloadsPerSet, seconds: Math.round(payloadsPerSet / 5) };
      case 'cluster_bomb': return { requests: Math.pow(payloadsPerSet, Math.min(m, 3)), seconds: Math.round(Math.pow(payloadsPerSet, Math.min(m, 3)) / 5) };
      default: return { requests: 0, seconds: 0 };
    }
  }, [attackMode, markers.length]);

  const svgDiagram = useMemo(() => {
    const colors = ['#9333EA', '#38BDF8', '#22C55E', '#FB923C', '#F472B6', '#FACC15'];
    const posCount = Math.max(2, markers.length || 2);
    const payloads = ['admin', 'test', '1234'];
    const w = 320; const h = 100;

    if (attackMode === 'sniper') {
      const rows = posCount * payloads.length;
      const cellW = w / (posCount + 1); const cellH = Math.min(16, h / (rows + 1));
      const items: React.JSX.Element[] = [];
      for (let ri = 0; ri < rows; ri++) {
        const pi = ri % posCount;
        items.push(
          <rect key={ri} x={pi * cellW + cellW * 0.1} y={ri * cellH + cellH * 0.1}
            width={cellW * 0.8} height={cellH * 0.8} rx={2}
            fill={colors[ri % colors.length]} opacity={0.7} />
        );
      }
      return <svg width={w} height={Math.max(h, rows * cellH + 8)}>{items}</svg>;
    }

    if (attackMode === 'battering_ram') {
      const items: React.JSX.Element[] = [];
      const cellH = Math.min(18, h / (payloads.length + 1));
      const cellW = w / (posCount + 1);
      for (let ri = 0; ri < payloads.length; ri++) {
        for (let ci = 0; ci < posCount; ci++) {
          items.push(
            <rect key={`${ri}-${ci}`} x={ci * cellW + 4} y={ri * cellH + 4}
              width={cellW - 8} height={cellH - 8} rx={2}
              fill={colors[ri % colors.length]} opacity={0.6} />
          );
        }
      }
      return <svg width={w} height={h}>{items}</svg>;
    }

    if (attackMode === 'pitchfork') {
      const items: React.JSX.Element[] = [];
      const cellH = Math.min(18, h / (payloads.length + 1));
      const cellW = w / posCount;
      for (let ri = 0; ri < payloads.length; ri++) {
        for (let ci = 0; ci < posCount; ci++) {
          items.push(
            <rect key={`${ri}-${ci}`} x={ci * cellW + 4} y={ri * cellH + 4}
              width={cellW - 8} height={cellH - 8} rx={2}
              fill={colors[ci % colors.length]} opacity={0.6} />
          );
        }
      }
      return <svg width={w} height={h}>{items}</svg>;
    }

    if (attackMode === 'cluster_bomb') {
      const items: React.JSX.Element[] = [];
      const cols = Math.min(posCount, 4);
      const rows = Math.min(payloads.length, 3);
      const cellW = w / cols; const cellH = h / rows;
      for (let ri = 0; ri < rows; ri++) {
        for (let ci = 0; ci < cols; ci++) {
          const hue = (ci * 60 + ri * 30) % 360;
          items.push(
            <rect key={`${ri}-${ci}`} x={ci * cellW + 4} y={ri * cellH + 4}
              width={cellW - 8} height={cellH - 8} rx={2}
              fill={`hsl(${hue}, 70%, 50%)`} opacity={0.7} />
          );
        }
      }
      return <svg width={w} height={h}>{items}</svg>;
    }

    return null;
  }, [attackMode, markers.length]);

  return (
    <div>
      <Row gutter={[10, 10]}>
        {MODES.map((mode) => {
          const selected = attackMode === mode.mode;
          return (
            <Col span={12} key={mode.mode}>
              <Card
                size="small"
                hoverable
                onClick={() => handleSelect(mode.mode)}
                style={{
                  cursor: 'pointer', borderRadius: 8,
                  border: selected ? '2px solid transparent' : '1px solid rgba(255,255,255,0.08)',
                  background: selected
                    ? 'linear-gradient(135deg, rgba(147,51,234,0.2) 0%, rgba(56,189,248,0.2) 100%) padding-box, linear-gradient(135deg, #9333EA 0%, #38BDF8 100%) border-box'
                    : '#111827',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    color: selected ? '#F8FAFC' : '#64748B',
                    transition: 'color 0.2s',
                  }}>
                    {mode.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{
                      color: selected ? '#F8FAFC' : '#94A3B8',
                      fontSize: 14, display: 'block',
                    }}>
                      {mode.title}
                    </Text>
                    <Text style={{
                      color: selected ? '#CBD5E1' : '#64748B',
                      fontSize: 11, display: 'block', marginTop: 2,
                    }}>
                      {mode.description}
                    </Text>
                    <Text style={{
                      color: selected ? '#38BDF8' : '#475569',
                      fontSize: 10, display: 'block', marginTop: 4,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      {mode.positions}
                    </Text>
                  </div>
                  {selected && (
                    <Tag color="#22C55E" style={{ margin: 0, fontSize: 10 }}>Выбрано</Tag>
                  )}
                </div>
                {selected && svgDiagram && (
                  <div style={{
                    marginTop: 8, padding: 6,
                    background: 'rgba(11,15,23,0.6)', borderRadius: 6,
                    display: 'flex', justifyContent: 'center',
                  }}>
                    {svgDiagram}
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <div style={{
        marginTop: 14, padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(147,51,234,0.1) 0%, rgba(56,189,248,0.1) 100%)',
        border: '1px solid rgba(147,51,234,0.2)', borderRadius: 8,
      }}>
        <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600 }}>
          Будет отправлено {estimate.requests.toLocaleString()} запросов
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 12, display: 'block' }}>
          ~{estimate.seconds} сек при 5 потоках
        </Text>
      </div>
    </div>
  );
}
