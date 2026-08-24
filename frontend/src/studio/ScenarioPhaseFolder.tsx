/**
 * W2 Scenario Phase Folder — 32 строки конструктора → 3–5 макро-фаз.
 *
 * AST-анализ команд: group by semantic phase type.
 * Режимы: Macro Phases ↔ Micro Steps (toggle).
 */
import { useMemo, useState } from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, MergeCellsOutlined, UnorderedListOutlined } from '@ant-design/icons';

const { Text } = Typography;

const PHASE_KEYWORDS: Array<{ regex: RegExp; phase: string; color: string; label: string }> = [
  { regex: /(НовыйКонтекст|ВключитьВКонтекст|Авториз|ПрименитьAuth|ПрименитьКонтекст|залогин|login|Секрет)/i, phase: 'auth', color: '#8B5CF6', label: 'Auth & Session' },
  { regex: /(Открыть|ЖдатьURL|ЖдатьЭлемент|ЖдатьПростойСети|Пауза|Нажать css|ПроверитьНевидимость)/i, phase: 'recon', color: '#3B82F6', label: 'Reconnaissance' },
  { regex: /(Фаззинг|ФаззингВолна|ВставитьЗначение|Вставить|заполнить)/i, phase: 'inject', color: '#F59E0B', label: 'Injection Surface' },
  { regex: /(ПроверитьТекст|ЛогАтаки|Лог|ОбойтиСтраницы|Проверить)/i, phase: 'verify', color: '#10B981', label: 'Verification' },
  { regex: /(Скачать|сохранить|Завершить|Очистить)/i, phase: 'report', color: '#6B7280', label: 'Teardown & Report' },
];

export interface ScenarioPhaseFolderProps {
  constructorText: string;
  lineCount?: number;
}

interface PhaseLine { index: number; text: string; phase: string; color: string }

function classifyLines(text: string): PhaseLine[] {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    for (const kw of PHASE_KEYWORDS) {
      if (kw.regex.test(line)) return { index: idx, text: line, phase: kw.phase, color: kw.color };
    }
    return { index: idx, text: line, phase: 'unknown', color: '#475569' };
  });
}

function groupPhases(lines: PhaseLine[]): Array<{ key: string; label: string; color: string; lines: PhaseLine[] }> {
  const groups: Array<{ key: string; label: string; color: string; lines: PhaseLine[] }> = [];
  let current: (typeof groups)[number] | null = null;

  for (const line of lines) {
    if (!current || current.key !== line.phase) {
      const kw = PHASE_KEYWORDS.find((k) => k.phase === line.phase);
      current = { key: line.phase, label: kw?.label ?? line.phase, color: kw?.color ?? '#475569', lines: [] };
      groups.push(current);
    }
    current.lines.push(line);
  }
  return groups;
}

export function ScenarioPhaseFolder({ constructorText, lineCount = 32 }: ScenarioPhaseFolderProps) {
  const [macroMode, setMacroMode] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const phases = useMemo(() => {
    const lines = classifyLines(constructorText);
    return groupPhases(lines);
  }, [constructorText]);

  const total = constructorText.split('\n').filter((l) => l.trim()).length;

  return (
    <div style={{ background: '#0B0F17', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={6}>
          {macroMode ? <MergeCellsOutlined style={{ color: '#A78BFA' }} /> : <UnorderedListOutlined style={{ color: '#A78BFA' }} />}
          <Text strong style={{ color: '#F8FAFC', fontSize: 13 }}>
            {macroMode ? 'Macro Phases' : 'Micro Steps'}
          </Text>
          <Tag color="#9333EA" style={{ fontSize: 10, margin: 0 }}>{total}/{lineCount} строк</Tag>
        </Space>
        <Button
          size="small"
          type="text"
          onClick={() => { setMacroMode(!macroMode); setExpanded(new Set()); }}
          style={{ color: '#A78BFA', fontSize: 11 }}
        >
          {macroMode ? 'Micro Steps' : 'Macro Phases'}
        </Button>
      </div>

      {macroMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {phases.map((phase) => {
            const isExpanded = expanded.has(phase.key);
            return (
              <Card
                key={phase.key}
                size="small"
                onClick={() => {
                    setExpanded((prev) => { const s = new Set(prev); if (s.has(phase.key)) s.delete(phase.key); else s.add(phase.key); return s; });
                  }}
                style={{
                  background: `${phase.color}0D`, borderColor: `${phase.color}30`, borderRadius: 6, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space size={6}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color }} />
                    <Text strong style={{ color: '#F8FAFC', fontSize: 12 }}>{phase.label}</Text>
                    <Tag style={{ background: `${phase.color}20`, color: phase.color, border: 'none', fontSize: 10, margin: 0 }}>
                      {phase.lines.length} шагов
                    </Tag>
                  </Space>
                  {isExpanded ? <CaretDownOutlined style={{ color: '#64748B' }} /> : <CaretRightOutlined style={{ color: '#64748B' }} />}
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 6 }}>
                    {phase.lines.map((line) => (
                      <div key={line.index} style={{
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#94A3B8',
                        padding: '1px 4px', borderLeft: `2px solid ${phase.color}60`,
                        marginBottom: 2,
                      }}>
                        {line.text}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#E2E8F0', whiteSpace: 'pre-wrap', maxHeight: 560, overflowY: 'auto' }}>
          {constructorText.split('\n').map((line, i) => (
            <div key={`line-${i}-${line.slice(0, 8)}`} style={{ padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}