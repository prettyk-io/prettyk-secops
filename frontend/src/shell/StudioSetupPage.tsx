import { useState, useCallback, useMemo } from 'react';
import { Layout, Form, Input, Button, Card, Typography, Alert } from 'antd';
import { ShellChrome } from './ShellChrome';
import { WiredForm } from '../wired/WiredForm';
import { parseWired, mergeRegulationToLegacy } from '../wired/parse';
import type { Wired } from '../wired/types';
import { validateWiredFields, type FieldError } from '../wired/validateWiredFields';
import { defaultWired } from '../wired/defaultWired';
import { capsForUser, readSession } from './auth';
import { clampFormDataForRoleCaps } from '../utils/applyRoleCaps';

const { Title, Text } = Typography;

export interface StudioSetupPageProps {
  onBackHome: () => void;
  onProceedToStudio: (wired: unknown, title: string) => void;
  onLogout?: () => void;
  roleLabel?: string | null;
  initialTitle?: string;
  initialManifest?: unknown;
}

export function StudioSetupPage({
  onBackHome,
  onProceedToStudio,
  onLogout,
  roleLabel = null,
  initialTitle = '',
  initialManifest,
}: StudioSetupPageProps): React.JSX.Element {
  const [checkTitle, setCheckTitle] = useState(initialTitle);
  const roleCaps = useMemo(() => capsForUser(readSession()), []);

  const [rawFormData, setRawFormData] = useState<unknown>(() => {
    const base = initialManifest ?? defaultWired();
    return clampFormDataForRoleCaps(base, roleCaps);
  });

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const parsedWired = useMemo<Wired | null>(() => {
    const result = parseWired(rawFormData);
    return result.ok ? result.wired : null;
  }, [rawFormData]);

  const handleWiredChange = useCallback(
    (next: Wired) => {
      setRawFormData((prev: unknown) => {
        const merged = mergeRegulationToLegacy(next, prev);
        return clampFormDataForRoleCaps(merged, roleCaps);
      });
    },
    [roleCaps],
  );

  const handleSubmit = () => {
    const errors = validateWiredFields(rawFormData);
    setFieldErrors(errors);
    if (errors.length > 0) {
      return;
    }
    const finalTitle = checkTitle.trim() || 'Новая проверка';
    onProceedToStudio(rawFormData, finalTitle);
  };

  return (
    <Layout className="pk-layout pk-shell-layout pk-setup-page">
      <ShellChrome
        roleLabel={roleLabel}
        onLogout={onLogout}
        showThemeToggle={false}
      />
      <Layout.Content className="pk-setup-body" style={{ overflowY: 'auto', padding: '24px 16px' }}>
        <div className="pk-shell-glass-wrap" style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="pk-shell-panel pk-shell-glass-panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>
                  Инициализация проверки
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Укажите название и настройте регламент перед переходом в Студию
                </Text>
              </div>
              <Button onClick={onBackHome} className="pk-home-back">
                Назад
              </Button>
            </div>

            <Form layout="vertical" requiredMark={false} style={{ marginBottom: 24 }}>
              <Form.Item label="Название проверки" required>
                <Input
                  autoFocus
                  placeholder="Введите название проверки..."
                  value={checkTitle}
                  onChange={(e) => setCheckTitle(e.target.value)}
                  onPressEnter={handleSubmit}
                  style={{ height: 40, fontSize: 15 }}
                  data-testid="studio-setup-title"
                />
              </Form.Item>
            </Form>

            {parsedWired ? (
              <WiredForm
                wired={parsedWired}
                onChange={handleWiredChange}
                fieldErrors={fieldErrors}
              />
            ) : (
              <Alert type="error" message="Не удалось разобрать манифест" />
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button onClick={onBackHome} style={{ height: 40, minWidth: 100 }}>
                Отмена
              </Button>
              <Button
                type="primary"
                onClick={handleSubmit}
                style={{ height: 40, minWidth: 160 }}
                data-testid="studio-setup-proceed"
              >
                Перейти в Студию →
              </Button>
            </div>
          </div>
        </div>
      </Layout.Content>
    </Layout>
  );
}
