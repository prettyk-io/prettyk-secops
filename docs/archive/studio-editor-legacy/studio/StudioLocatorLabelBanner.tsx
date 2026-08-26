/**
 * DISC-2E: полоска над PrettyK — принять label→locator в canvas.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { LIVE_META_URL } from '../api/apiBase';
import {
  applyLocatorLabelToConstructor,
  labelProposalSummary,
  parseLocatorLabelLast,
  type LocatorLabelProposal,
} from './locatorLabelPropose';

const POLL_MS = 3_000;

type Props = {
  enabled: boolean;
  constructorText: string;
  onAccept: (nextText: string, proposal: LocatorLabelProposal) => void;
};

export function StudioLocatorLabelBanner({
  enabled,
  constructorText,
  onAccept,
}: Props): React.JSX.Element | null {
  const [proposal, setProposal] = useState<LocatorLabelProposal | null>(null);
  const [dismissedKey, setDismissedKey] = useState('');

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${LIVE_META_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok || cancelled) {
          return;
        }
        const meta = (await res.json()) as Record<string, unknown>;
        const next = parseLocatorLabelLast(meta.locator_label_last);
        if (!cancelled) {
          setProposal(next);
        }
      } catch {
        if (!cancelled) {
          setProposal(null);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled || !proposal || proposal.status !== 'ok') {
    return null;
  }
  const key = `${proposal.label}|${proposal.new_value}|${proposal.score ?? ''}`;
  if (key === dismissedKey) {
    return null;
  }
  if (
    proposal.label &&
    constructorText &&
    !constructorText.includes(`> ${proposal.label}`)
  ) {
    return null;
  }

  return (
    <Alert
      type="info"
      showIcon
      className="pk-studio-locator-label"
      data-testid="studio-locator-label"
      style={{ marginBottom: 8, borderRadius: 6 }}
      message={
        <Space size={8} wrap>
          <Typography.Text>LABEL · {labelProposalSummary(proposal)}</Typography.Text>
          <Button
            size="small"
            type="primary"
            data-testid="studio-locator-label-accept"
            onClick={() => {
              const { text, replaced } = applyLocatorLabelToConstructor(
                constructorText,
                proposal,
              );
              if (replaced <= 0) {
                // empty/miss в canvas — тихо, без toast и без SoT rewrite
                setDismissedKey(key);
                return;
              }
              onAccept(text, proposal);
              setDismissedKey(key);
            }}
          >
            Принять в конструктор
          </Button>
          <Button size="small" type="link" onClick={() => setDismissedKey(key)}>
            Скрыть
          </Button>
        </Space>
      }
    />
  );
}
