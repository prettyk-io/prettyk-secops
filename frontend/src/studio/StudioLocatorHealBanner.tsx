/**
 * HEAL-D2: полоска над PrettyK — принять heal в canvas (оператор жмёт).
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { LIVE_META_URL } from '../api/apiBase';
import {
  applyLocatorHealToConstructor,
  healProposalSummary,
  parseLocatorHealLast,
  type LocatorHealProposal,
} from './locatorHealPropose';

const POLL_MS = 3_000;

type Props = {
  enabled: boolean;
  constructorText: string;
  onAccept: (nextText: string, proposal: LocatorHealProposal) => void;
};

export function StudioLocatorHealBanner({
  enabled,
  constructorText,
  onAccept,
}: Props): React.JSX.Element | null {
  const [proposal, setProposal] = useState<LocatorHealProposal | null>(null);
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
        const next = parseLocatorHealLast(meta.locator_heal_last);
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
  const key = `${proposal.old_value}|${proposal.new_value}|${proposal.score ?? ''}`;
  if (key === dismissedKey) {
    return null;
  }
  if (
    proposal.old_value &&
    constructorText &&
    !constructorText.includes(proposal.old_value)
  ) {
    return null;
  }

  return (
    <Alert
      type="success"
      showIcon
      className="pk-studio-locator-heal"
      data-testid="studio-locator-heal"
      style={{ marginBottom: 8, borderRadius: 6 }}
      message={
        <Space size={8} wrap>
          <Typography.Text>HEAL · {healProposalSummary(proposal)}</Typography.Text>
          <Button
            size="small"
            type="primary"
            data-testid="studio-locator-heal-accept"
            onClick={() => {
              const { text, replaced } = applyLocatorHealToConstructor(
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
