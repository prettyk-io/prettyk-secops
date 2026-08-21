/**
 * LABEL thin (Results): last label resolve из Live meta.
 * Принять в PrettyK — кнопка в Studio над canvas; здесь только копирование.
 */
import { Button, Space, Typography } from 'antd';
import {
  labelProposalSummary,
  parseLocatorLabelLast,
  type LocatorLabelProposal,
} from '../studio/locatorLabelPropose';

type Props = {
  meta: Record<string, unknown> | null | undefined;
  onCopy?: (text: string) => void;
};

const stripStyle: React.CSSProperties = {
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  lineHeight: 1.35,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
};

function proposalCopyText(p: LocatorLabelProposal): string {
  if (p.status === 'ok' && p.new_type && p.new_value) {
    return `${p.new_type} ${p.new_value}`;
  }
  return labelProposalSummary(p);
}

function tone(status: string): React.CSSProperties {
  if (status === 'ok') {
    return { ...stripStyle, borderColor: 'rgba(24,144,255,0.35)' };
  }
  if (status === 'miss' || status === 'ambiguous' || status === 'disabled') {
    return { ...stripStyle, borderColor: 'rgba(250,173,20,0.4)' };
  }
  return stripStyle;
}

/** Field UX: empty placeholder only when meta already carries a label payload key. */
export function shouldShowLabelEmpty(meta: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(meta, 'locator_label_last');
}

export function LocatorLabelStrip({ meta, onCopy }: Props): React.JSX.Element | null {
  if (meta == null) {
    return null;
  }
  const proposal = parseLocatorLabelLast(meta.locator_label_last);
  if (!proposal) {
    if (!shouldShowLabelEmpty(meta)) {
      return null;
    }
    return (
      <div
        className="pk-results-locator-label pk-results-locator-empty"
        data-testid="results-locator-label-empty"
        style={{ ...stripStyle, opacity: 0.55 }}
      >
        LABEL · нет предложения
      </div>
    );
  }
  const ok = proposal.status === 'ok';
  return (
    <div
      className="pk-results-locator-label"
      data-testid="results-locator-label"
      style={tone(proposal.status)}
    >
      <Space size={6} wrap>
        <Typography.Text style={{ fontSize: 12 }}>
          LABEL · {labelProposalSummary(proposal)}
        </Typography.Text>
        {ok ? (
          <>
            <Button
              size="small"
              type="link"
              style={{ paddingInline: 0, height: 'auto', fontSize: 12 }}
              onClick={() => {
                const text = proposalCopyText(proposal);
                void navigator.clipboard?.writeText?.(text);
                onCopy?.(text);
              }}
            >
              Копировать
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.7 }}>
              в Studio — принять в конструктор
            </Typography.Text>
          </>
        ) : null}
      </Space>
    </div>
  );
}
