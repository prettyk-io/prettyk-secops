/**
 * Ловит падения React (Monaco/RJSF) — портал не остаётся белым экраном.
 */
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import type { ReactNode } from 'react';
import { Button, Result } from 'antd';

function Fallback({
  error,
  resetErrorBoundary,
}: FallbackProps): React.JSX.Element {
  const message =
    error instanceof Error ? error.message : 'Неожиданная ошибка интерфейса';
  return (
    <div className="pk-error-boundary">
      <Result
        status="error"
        title="Редактор остановился"
        subTitle={message}
        extra={
          <Button type="primary" onClick={resetErrorBoundary}>
            Перезагрузить экран
          </Button>
        }
      />
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <ErrorBoundary
      FallbackComponent={Fallback}
      onReset={() => {
        window.location.hash = '#/home';
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
