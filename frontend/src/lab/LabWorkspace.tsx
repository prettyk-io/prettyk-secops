import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App as AntdApp,
  Button,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  PauseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  fetchLabDetail,
  fetchLabResults,
  type LabDetailItem,
  stopLabIntruder,
} from './labApi';
import { Wordmark } from '../shell/Wordmark';
import { LabSessionProvider, useLabSession, type AttackMode, type PayloadSetConfig } from './LabSessionProvider';
import { WizardShell, type WizardStepDef } from './wizard/WizardShell';
import { Step1Target } from './wizard/Step1Target';
import { Step2Positions } from './wizard/Step2Positions';
import { Step3AttackMode } from './wizard/Step3AttackMode';
import { Step4Payloads } from './wizard/Step4Payloads';
import { Step5Execute } from './wizard/Step5Execute';
import { SuiteBuilder } from './suite/SuiteBuilder';
import { SnakeView } from './suite/SnakeView';

const { Text } = Typography;

type LabMode = 'wizard' | 'suite' | 'snake';

export interface LabWorkspaceProps {
  onBackHome: () => void;
  onLogout?: () => void;
}

function makePayloadSet(pos: { id: string; name: string }, idx: number): PayloadSetConfig {
  return {
    positionId: pos.id,
    positionName: pos.name,
    kind: 'preset',
    presetKey: 'sqli',
    customItems: [],
    numberStart: 0,
    numberStop: 10,
    numberStep: 1,
    bruteCharset: 'abc123',
    bruteMinLen: 1,
    bruteMaxLen: 3,
    encoders: [],
    prefix: '',
    suffix: '',
  };
}

function makePayloadSets(markers: { id: string; name: string }[], mode: AttackMode): PayloadSetConfig[] {
  if ((mode === 'sniper' || mode === 'battering_ram') && markers.length > 0) {
    return [makePayloadSet(markers[0]!, 0)];
  }
  return markers.map((m, i) => makePayloadSet(m, i));
}

function LabWorkspaceInner({ onBackHome, onLogout }: LabWorkspaceProps) {
  const { message } = AntdApp.useApp();
  const {
    session,
    updateAttack,
    setRunning,
    setProgress,
    setResults,
    addToSuite,
  } = useLabSession();

  const { singleAttack, isRunning, attackId } = session;

  const [labMode, setLabMode] = useState<LabMode>('wizard');
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<LabDetailItem | null>(null);

  useEffect(() => {
    if (!attackId || !isRunning) return;
    const interval = setInterval(async () => {
      const data = await fetchLabResults(attackId, 0, 500);
      if (data.ok) {
        setResults(data.results);
        setProgress({ completed: data.completed, total: data.total });
        if (!data.is_running && data.completed >= data.total && data.total > 0) {
          setRunning(false);
        }
      }
    }, 600);
    return () => clearInterval(interval);
  }, [attackId, isRunning, setResults, setProgress, setRunning]);

  const handleSelectResult = useCallback(async (id: number) => {
    setSelectedResultId(id);
    if (!attackId) return;
    const res = await fetchLabDetail(attackId, id);
    if (res.ok && res.detail) setSelectedDetail(res.detail);
  }, [attackId]);

  const handleStopAttack = useCallback(async () => {
    if (!attackId) return;
    await stopLabIntruder(attackId);
    setRunning(false);
    message.info('Атака остановлена');
  }, [attackId, setRunning, message]);

  const [step1Valid, setStep1Valid] = useState(false);
  const [step2Valid, setStep2Valid] = useState(false);
  const [step3Valid, setStep3Valid] = useState(false);
  const [step4Valid, setStep4Valid] = useState(false);

  const syncedPayloadSets = useMemo(() => {
    const needed = makePayloadSets(singleAttack.markers, singleAttack.attackMode);
    if (singleAttack.payloadSets.length === 0) return needed;
    if (singleAttack.payloadSets.length !== needed.length) return needed;
    const nameMatch = needed.every((n, i) => n.positionName === singleAttack.payloadSets[i]?.positionName);
    return nameMatch ? singleAttack.payloadSets : needed;
  }, [singleAttack.markers, singleAttack.attackMode, singleAttack.payloadSets]);

  useEffect(() => {
    if (syncedPayloadSets.length === 0) return;
    const isCurrent = syncedPayloadSets.length === singleAttack.payloadSets.length
      && syncedPayloadSets.every((set, index) => set.positionName === singleAttack.payloadSets[index]?.positionName);
    if (!isCurrent) updateAttack({ payloadSets: syncedPayloadSets });
  }, [singleAttack.payloadSets, syncedPayloadSets, updateAttack]);

  const markerCount = useMemo(() => {
    const matches = singleAttack.rawHttp.match(/§[^§]*§/g);
    return matches ? matches.length : 0;
  }, [singleAttack.rawHttp]);

  const wizardSteps = useMemo<WizardStepDef[]>(() => [
    {
      key: 'target',
      title: 'Цель',
      valid: step1Valid,
      content: <Step1Target valid={step1Valid} onValidChange={setStep1Valid} />,
    },
    {
      key: 'positions',
      title: 'Позиции',
      valid: step2Valid,
      content: <Step2Positions valid={step2Valid} onValidChange={setStep2Valid} />,
    },
    {
      key: 'mode',
      title: 'Режим',
      valid: step3Valid,
      content: <Step3AttackMode valid={step3Valid} onValidChange={setStep3Valid} />,
    },
    {
      key: 'payloads',
      title: 'Словари',
      valid: step4Valid,
      content: (
        <Step4Payloads
          payloadSets={syncedPayloadSets}
          markers={singleAttack.markers}
          attackMode={singleAttack.attackMode}
          onValidChange={setStep4Valid}
        />
      ),
    },
    {
      key: 'execute',
      title: 'Выполнение',
      valid: true,
      content: <Step5Execute valid onValidChange={() => {}} />,
    },
  ], [step1Valid, step2Valid, step3Valid, step4Valid, syncedPayloadSets, singleAttack, addToSuite, message]);

  const handleWizardFinish = useCallback(() => {
    message.info('Атака запущена — обрабатывается на Шаге 5');
  }, [message]);

  const isSuiteTab = labMode === 'suite' || labMode === 'snake';
  const isSnake = labMode === 'snake';

  return (
    <div className="pk-lab-container" style={{ background: '#0B0F17', minHeight: '100vh', color: '#F8FAFC' }}>
      {/* Header */}
      <div className="pk-lab-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0D131F',
      }}>
        <Space size="middle">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBackHome} style={{ color: '#94A3B8' }}>
            На главную
          </Button>
          <Wordmark />
          <Tag color="#9333EA" style={{ borderRadius: 4, fontWeight: 600, border: 'none' }}>
            BURP KILLER / LAB
          </Tag>
          <Text style={{ color: '#94A3B8', fontSize: 13 }}>
            Станция активного тестирования и атак
          </Text>
        </Space>

        <Space size="middle">
          {isRunning ? (
            <Button danger type="primary" icon={<PauseOutlined />} onClick={handleStopAttack}
              style={{ borderRadius: 5 }}>
              Остановить атаку
            </Button>
          ) : (
            <Button type="primary" icon={<ThunderboltOutlined />}
              style={{
                borderRadius: 5, background: 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)',
                border: 'none', fontWeight: 600,
              }} onClick={() => setLabMode('wizard')}>
              Атака ({markerCount} марк.)
            </Button>
          )}
          {onLogout && (
            <Button type="text" onClick={onLogout} style={{ color: '#64748B' }}>Выход</Button>
          )}
        </Space>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 57px)' }}>
        {/* Sidebar */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)',
          background: '#0D131F', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <Button type="text" block
            onClick={() => setLabMode('wizard')}
            style={{
              color: labMode === 'wizard' ? '#F8FAFC' : '#94A3B8',
              textAlign: 'left',
              fontWeight: labMode === 'wizard' ? 600 : 400,
              background: labMode === 'wizard' ? 'rgba(147,51,234,0.15)' : undefined,
            }}>
            ⚡ Атака
          </Button>
          <Button type="text" block
            onClick={() => setLabMode('suite')}
            style={{
              color: isSuiteTab ? '#F8FAFC' : '#94A3B8',
              textAlign: 'left',
              fontWeight: isSuiteTab ? 600 : 400,
              background: isSuiteTab ? 'rgba(147,51,234,0.15)' : undefined,
            }}>
            🔗 Suite Builder
          </Button>
          <div style={{ flex: 1 }} />
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <Button type="text" block disabled style={{ color: '#475569', textAlign: 'left', fontSize: 12 }}>
              📋 История <Tag style={{ marginLeft: 4, fontSize: 9 }} color="default">to evolve</Tag>
            </Button>
            <Button type="text" block disabled style={{ color: '#475569', textAlign: 'left', fontSize: 12 }}>
              📄 Шаблоны <Tag style={{ marginLeft: 4, fontSize: 9 }} color="default">to evolve</Tag>
            </Button>
            <Button type="text" block disabled style={{ color: '#475569', textAlign: 'left', fontSize: 12 }}>
              ⚙ Настройки <Tag style={{ marginLeft: 4, fontSize: 9 }} color="default">to evolve</Tag>
            </Button>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '0 16px', gap: 0, background: '#0D131F',
          }}>
            <button
              onClick={() => setLabMode('wizard')}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: labMode === 'wizard' ? '2px solid #9333EA' : '2px solid transparent',
                color: labMode === 'wizard' ? '#F8FAFC' : '#94A3B8',
                padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                fontWeight: labMode === 'wizard' ? 600 : 400,
              }}>
              Single Attack
            </button>
            <button
              onClick={() => setLabMode('suite')}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: isSuiteTab ? '2px solid #9333EA' : '2px solid transparent',
                color: isSuiteTab ? '#F8FAFC' : '#94A3B8',
                padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                fontWeight: isSuiteTab ? 600 : 400,
              }}>
              Suite Builder
            </button>
          </div>

          {/* Content */}
          {labMode === 'wizard' && (
            <WizardShell steps={wizardSteps} onFinish={handleWizardFinish} />
          )}
          {(labMode === 'suite') && (
            <SuiteBuilder
              onBackToWizard={() => setLabMode('wizard')}
              onRunSuite={() => setLabMode('snake')}
            />
          )}
          {labMode === 'snake' && (
            <SnakeView
              onDone={() => {}}
              onStop={() => setLabMode('suite')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function LabWorkspace(props: LabWorkspaceProps): React.JSX.Element {
  return (
    <LabSessionProvider>
      <LabWorkspaceInner {...props} />
    </LabSessionProvider>
  );
}
