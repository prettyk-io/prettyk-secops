import { Fragment, useCallback, useRef, useState } from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useLabSession, type AttackConfig, type AttackMode } from '../LabSessionProvider';
import { InterAttackTransfer, type InterAttackTransfer as IATransfer } from './InterAttackTransfer';

const { Text, Title } = Typography;

const MODE_LABELS: Record<AttackMode, string> = {
  sniper: '🎯 Sniper',
  battering_ram: '🔨 Battering Ram',
  pitchfork: '🍴 Pitchfork',
  cluster_bomb: '💣 Cluster Bomb',
};

function estimateRequests(attack: AttackConfig): number {
  const markerCount = attack.markers.length || (attack.rawHttp.match(/§[^§]*§/g)?.length || 1);
  const payloadSize = attack.payloadSets[0]?.customItems.length || 5;
  switch (attack.attackMode) {
    case 'sniper': return markerCount * payloadSize;
    case 'battering_ram': return payloadSize;
    case 'pitchfork': return Math.min(payloadSize, attack.payloadSets[1]?.customItems.length || payloadSize);
    case 'cluster_bomb': {
      let total = 1;
      for (let i = 0; i < markerCount; i++) {
        total *= attack.payloadSets[i]?.customItems.length || payloadSize;
      }
      return total;
    }
  }
}

function estimateSeconds(totalRequests: number): number {
  return Math.ceil(totalRequests / 5);
}

export interface SuiteBuilderProps {
  onBackToWizard: () => void;
  onRunSuite: () => void;
}

export function SuiteBuilder({ onBackToWizard, onRunSuite }: SuiteBuilderProps) {
  const {
    session,
    addToSuite,
    removeFromSuite,
    reorderSuite,
    clearSuite,
  } = useLabSession();

  const { suiteAttacks } = session;

  const [transfers, setTransfers] = useState<IATransfer[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragIndexRef.current = idx;
    setDragIndex(idx);
  }, []);

  const handleDrop = useCallback((idx: number) => {
    const from = dragIndexRef.current;
    if (from !== null && from !== idx) reorderSuite(from, idx);
    dragIndexRef.current = null;
    setDragIndex(null);
  }, [reorderSuite]);

  const handleMoveUp = useCallback((idx: number) => {
    if (idx > 0) reorderSuite(idx, idx - 1);
  }, [reorderSuite]);

  const handleMoveDown = useCallback((idx: number) => {
    if (idx < suiteAttacks.length - 1) reorderSuite(idx, idx + 1);
  }, [reorderSuite, suiteAttacks.length]);

  const totalRequests = suiteAttacks.reduce((sum, a) => sum + estimateRequests(a), 0);
  const totalSeconds = suiteAttacks.reduce((sum, a) => sum + estimateSeconds(estimateRequests(a)), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <Title level={5} style={{ color: '#F8FAFC', margin: 0 }}>Suite Builder</Title>
          <Text style={{ color: '#94A3B8', fontSize: 13 }}>
            Сборка цепочки атак с передачей данных между ними
          </Text>
        </div>
        <Space>
          <Button icon={<ThunderboltOutlined />} onClick={onBackToWizard}
            style={{ borderRadius: 5 }}>
            Новая атака
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={suiteAttacks.length === 0}
            onClick={onRunSuite}
            style={{
              borderRadius: 5,
              background: suiteAttacks.length > 0
                ? 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)'
                : undefined,
              border: suiteAttacks.length > 0 ? 'none' : undefined,
              fontWeight: 600,
            }}
          >
            Запустить Suite
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
        {suiteAttacks.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60, color: '#64748B',
            border: '2px dashed rgba(255,255,255,0.08)', borderRadius: 8,
          }}>
            <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
            <Text style={{ color: '#64748B', fontSize: 14 }}>
              Цепочка пуста. Настройте атаку в Single Attack и нажмите «Добавить в Suite».
            </Text>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suiteAttacks.map((attack, idx) => {
              const markerCount = attack.markers.length || (attack.rawHttp.match(/§[^§]*§/g)?.length || 0);
              const reqs = estimateRequests(attack);
              const secs = estimateSeconds(reqs);
              const targetUrl = attack.parsedTarget?.url || '(URL не распознан)';
              const method = attack.parsedTarget?.method || 'GET';

              return (
                <Fragment key={attack.attackId}>
                  <Card
                    size="small"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    style={{
                      background: '#111827',
                      borderColor: dragIndex === idx ? 'rgba(147,51,234,0.6)' : 'rgba(255,255,255,0.08)',
                      borderRadius: 6,
                      opacity: dragIndex === idx ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Drag handle area */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 2,
                        paddingTop: 2, alignItems: 'center',
                      }}>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(idx));
                            e.dataTransfer.effectAllowed = 'move';
                            handleDragStart(idx);
                          }}
                          onDragEnd={() => { dragIndexRef.current = null; setDragIndex(null); }}
                          style={{ cursor: 'grab', color: '#64748B', lineHeight: 1, padding: '2px 4px' }}
                          title="Перетащить для изменения порядка"
                          data-testid={`suite-drag-handle-${idx}`}
                        >
                          <HolderOutlined style={{ fontSize: 14 }} />
                        </div>
                        <Button
                          size="small" type="text"
                          icon={<ArrowUpOutlined />}
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                          style={{ color: '#94A3B8', padding: '0 4px', height: 20 }}
                        />
                        <Button
                          size="small" type="text"
                          icon={<ArrowDownOutlined />}
                          disabled={idx === suiteAttacks.length - 1}
                          onClick={() => handleMoveDown(idx)}
                          style={{ color: '#94A3B8', padding: '0 4px', height: 20 }}
                        />
                      </div>

                      {/* Step number + connector line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 28 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'rgba(147,51,234,0.2)',
                          color: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {idx + 1}
                        </div>
                        {idx < suiteAttacks.length - 1 && (
                          <div style={{
                            width: 2, flex: 1, minHeight: 20,
                            background: 'rgba(147,51,234,0.3)',
                            margin: '4px 0',
                          }} />
                        )}
                      </div>

                      {/* Attack info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Tag color="#9333EA" style={{ margin: 0 }}>
                            {MODE_LABELS[attack.attackMode] || attack.attackMode}
                          </Tag>
                          <Tag style={{
                            background: 'rgba(56,189,248,0.1)',
                            color: '#38BDF8', border: 'none', margin: 0,
                            fontFamily: 'JetBrains Mono', fontSize: 11,
                          }}>
                            {method} {targetUrl.length > 40 ? `${targetUrl.substring(0, 40)}...` : targetUrl}
                          </Tag>
                        </div>
                        <Space size={6} wrap>
                          <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                            {markerCount} марк.
                          </Text>
                          <Text style={{ color: '#64748B', fontSize: 11 }}>·</Text>
                          <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                            {attack.payloadSets[0]?.customItems.length || 0} пейл. в Наборе 1
                          </Text>
                          <Text style={{ color: '#64748B', fontSize: 11 }}>·</Text>
                          <Text style={{ color: '#38BDF8', fontSize: 11 }}>
                            ~{reqs} запросов (~{secs}с)
                          </Text>
                        </Space>
                      </div>

                      {/* Remove */}
                      <Button
                        size="small" type="text" danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeFromSuite(idx)}
                        style={{ padding: '0 4px' }}
                      />
                    </div>
                  </Card>

                  {/* Transfer between attacks */}
                  {idx < suiteAttacks.length - 1 && (
                    <InterAttackTransfer
                      index={idx}
                      suiteAttacks={suiteAttacks}
                      transfers={transfers}
                      onChange={setTransfers}
                    />
                  )}
                </Fragment>
              );
            })}

            {/* Connection line from last attack to summary */}
            {suiteAttacks.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <div style={{
                  width: 2, height: 16,
                  background: 'rgba(147,51,234,0.3)',
                }} />
              </div>
            )}

            {/* Total summary */}
            <div style={{
              background: 'rgba(147,51,234,0.08)',
              borderRadius: 6, padding: '10px 16px',
              border: '1px solid rgba(147,51,234,0.15)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 600 }}>
                Всего по {suiteAttacks.length} атакам
              </Text>
              <Space size={12}>
                <Text style={{ color: '#38BDF8', fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                  ~{totalRequests} запросов
                </Text>
                <Text style={{ color: '#64748B', fontSize: 11 }}>·</Text>
                <Text style={{ color: '#A78BFA', fontSize: 13 }}>
                  ~{totalSeconds} сек
                </Text>
              </Space>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
