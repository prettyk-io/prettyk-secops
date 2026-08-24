import { useEffect, useMemo } from 'react';
import { Tag, Typography } from 'antd';
import { useLabSession, type AttackMode, type PositionMarker, type PayloadSetConfig } from '../LabSessionProvider';
import { PayloadSetPanel } from '../components/PayloadSetPanel';
import { GrepPanel } from '../components/GrepPanel';

const { Text } = Typography;

export interface Step4PayloadsProps {
  payloadSets: PayloadSetConfig[];
  markers: PositionMarker[];
  attackMode: AttackMode;
  onValidChange: (valid: boolean) => void;
}

export function Step4Payloads({ payloadSets, markers, attackMode, onValidChange }: Step4PayloadsProps) {
  const { updateAttack, session } = useLabSession();
  const { grepMatchPattern, grepExtractPattern } = session.singleAttack;

  const valid = useMemo(() => {
    const minSets = attackMode === 'sniper' || attackMode === 'battering_ram' ? 1 : Math.max(1, markers.length);
    if (payloadSets.length < minSets) return false;
    return payloadSets.every((ps) => {
      const customCount = ps.customItems.length;
      const hasNumbers = ps.numberStop > ps.numberStart;
      const hasBrute = ps.bruteCharset.length > 0 && ps.bruteMinLen > 0;
      return customCount > 0 || hasNumbers || hasBrute || (ps.kind === 'preset' && !!ps.presetKey);
    });
  }, [payloadSets, markers.length, attackMode]);

  useEffect(() => {
    onValidChange(valid);
  }, [onValidChange, valid]);

  const handlePayloadChange = (idx: number, patch: Partial<PayloadSetConfig>) => {
    const next = [...payloadSets];
    const current = next[idx];
    if (current) {
      next[idx] = { ...current, ...patch };
    }
    updateAttack({ payloadSets: next });
  };

  const handleGrepChange = (patch: { grepMatchPattern?: string; grepExtractPattern?: string }) => {
    updateAttack(patch);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Text style={{ color: '#94A3B8', fontSize: 13, display: 'block' }}>
        Настройте словари для {payloadSets.length === 1
          ? 'единственной позиции'
          : `${payloadSets.length} позиций`}. Режим:{' '}
        <Tag color="#9333EA" style={{ fontSize: 11 }}>{attackMode.toUpperCase()}</Tag>
      </Text>

      {payloadSets.length === 0 && (
        <Text style={{ color: '#64748B', fontSize: 13 }}>
          Нет маркеров для настройки словарей. Вернитесь на шаг «Позиции».
        </Text>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {payloadSets.map((ps, idx) => (
          <PayloadSetPanel
            key={ps.positionId}
            payloadSet={ps}
            onChange={(updated) => handlePayloadChange(idx, updated)}
          />
        ))}
      </div>

      <GrepPanel
        grepMatchPattern={grepMatchPattern}
        grepExtractPattern={grepExtractPattern}
        onChange={handleGrepChange}
      />
    </div>
  );
}
