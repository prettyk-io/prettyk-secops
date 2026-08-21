import { type ReactNode, useCallback, useState } from 'react';
import { Button, Space, Steps, Typography } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface WizardStepDef {
  key: string;
  title: string;
  content: ReactNode;
  valid: boolean;
}

export interface WizardShellProps {
  steps: WizardStepDef[];
  onFinish: () => void;
}

export function WizardShell({ steps, onFinish }: WizardShellProps) {
  const [current, setCurrent] = useState(0);
  const isLast = current === steps.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      onFinish();
    } else {
      setCurrent((c) => Math.min(c + 1, steps.length - 1));
    }
  }, [isLast, onFinish]);

  const handlePrev = useCallback(() => {
    setCurrent((c) => Math.max(c - 1, 0));
  }, []);

  const activeStep = steps[current];
  if (!activeStep) return null;

  const stepItems = steps.map((s, i) => ({
    title: s.title,
    status: i < current ? ('finish' as const) : i === current ? ('process' as const) : ('wait' as const),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '16px 24px 0' }}>
        <Steps
          current={current}
          size="small"
          items={stepItems}
          style={{ marginBottom: 16 }}
        />
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 24px 16px',
        minHeight: 0,
      }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: '#F8FAFC', fontSize: 16 }}>
            {activeStep.title}
          </Text>
        </div>
        {activeStep.content}
      </div>

      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <Button
          size="middle"
          disabled={current === 0}
          onClick={handlePrev}
          icon={<ArrowLeftOutlined />}
          style={{ borderRadius: 5 }}
        >
          Назад
        </Button>

        <Space>
          {current > 0 && (
            <Text style={{ color: '#64748B', fontSize: 12 }}>
              Шаг {current + 1} из {steps.length}
            </Text>
          )}
          <Button
            size="middle"
            type="primary"
            disabled={!activeStep.valid}
            onClick={handleNext}
            icon={isLast ? undefined : <ArrowRightOutlined />}
            style={{
              borderRadius: 5,
              background: activeStep.valid
                ? 'linear-gradient(135deg, #9333EA 0%, #38BDF8 100%)'
                : undefined,
              border: activeStep.valid ? 'none' : undefined,
              fontWeight: 600,
            }}
          >
            {isLast ? 'Запустить атаку' : 'Далее'}
          </Button>
        </Space>
      </div>
    </div>
  );
}