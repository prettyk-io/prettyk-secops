import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Layout } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { PrettyKMark } from '../components/PrettyKMark';
import { login } from './auth';
import { useLocale } from '../locales';
import { LoginEasterEggOverlay, hasVeraEggShown } from './LoginEasterEggOverlay';

export type LoginPageProps = {
  onSuccess: () => void;
};

export function LoginPage({ onSuccess }: LoginPageProps): React.JSX.Element {
  const { locale, dict } = useLocale();
  const L = dict.login;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ssoRedirecting, setSsoRedirecting] = useState(false);
  const [isVeraEgg, setVeraEgg] = useState(false);
  const ssoTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(ssoTimerRef.current);
    };
  }, []);

  const handleSubmit = () => {
    if (username.trim().toLowerCase() === 'vaera@prettyk.io' && !hasVeraEggShown()) {
      setError(null);
      setVeraEgg(true);
      return;
    }
    const result = login(username, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onSuccess();
  };

  const handleSso = () => {
    if (ssoRedirecting) {
      return;
    }
    setSsoRedirecting(true);
    window.clearTimeout(ssoTimerRef.current);
    ssoTimerRef.current = window.setTimeout(() => {
      setSsoRedirecting(false);
      ssoTimerRef.current = undefined;
    }, 3000);
  };

  return (
    <Layout className="pk-layout pk-shell-layout pk-login-page">
      <Layout.Content className="pk-shell-center pk-login-center">
        <div className="pk-shell-glass-wrap">
          <div className="pk-shell-panel pk-shell-glass-panel">
            <div className="pk-login-brand">
              <PrettyKMark variant="secops" />
            </div>
            <Form
              layout="vertical"
              className="pk-shell-form"
              requiredMark={false}
              onFinish={handleSubmit}
            >
              <Form.Item label={L.login} required>
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="login-username"
                />
              </Form.Item>
              <Form.Item label={L.password} required>
                <Input.Password
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                />
              </Form.Item>
              {error ? (
                <Alert type="error" showIcon message={error} className="pk-shell-login-error" />
              ) : null}
              <Button type="primary" htmlType="submit" block data-testid="login-submit">
                {L.signIn}
              </Button>
              <Button
                block
                className={
                  ssoRedirecting ? 'pk-shell-sso-btn pk-shell-sso-btn--ok' : 'pk-shell-sso-btn'
                }
                data-testid="login-sso"
                onClick={handleSso}
                icon={ssoRedirecting ? <CheckCircleFilled /> : undefined}
              >
                {ssoRedirecting ? L.ssoRedirect : L.sso}
              </Button>
            </Form>
          </div>
        </div>
      </Layout.Content>
        {isVeraEgg && (
          <LoginEasterEggOverlay
            username={username}
            password={password}
            onComplete={onSuccess}
          />
        )}
      </Layout>
  );
}
