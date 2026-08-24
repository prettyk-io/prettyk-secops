/**
 * Header check title (S3776 / App).
 */
import type { ReactNode } from 'react';
import { Typography } from 'antd';

export function renderBrandTitle(
  headerTitle: string | undefined,
  onRequestClose: (() => void) | undefined,
): ReactNode {
  if (!headerTitle) {
    return null;
  }
  if (onRequestClose) {
    return (
      <button
        type="button"
        className="pk-brand-title pk-brand-title--clickable"
        onClick={onRequestClose}
        data-testid="workspace-close-check"
      >
        {headerTitle}
      </button>
    );
  }
  return <Typography.Text className="pk-brand-title">{headerTitle}</Typography.Text>;
}
