/**
 * Fuzzer table expanded row body editor (S6478).
 */
import { Button, Typography } from 'antd';
import { DeferredTextArea } from './fuzzerDeferredInputs';
import type { FuzzTargetFields } from './studioFuzzers';

type Props = {
  record: FuzzTargetFields;
  idx: number;
  onBody: (idx: number, next: string) => void;
};

export function FuzzerTargetBodyExpand({
  record,
  idx,
  onBody,
}: Props): React.JSX.Element {
  return (
    <div style={{ padding: '4px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {`Тело запроса (${record.method}) — вставьте JSON / Form с масками {MASK} или {MASK_1}, {MASK_2}`}
        </Typography.Text>
        <Button
          size="small"
          type="dashed"
          onClick={() => {
            const current =
              record.body || '{\n  "email": "{MASK_1}",\n  "password": "{MASK_2}"\n}';
            const next = current.includes('{MASK')
              ? current
              : `${current}\n"{MASK_1}"`;
            onBody(idx, next);
          }}
        >
          + Вставить маску {'{MASK_1}'}
        </Button>
      </div>
      <DeferredTextArea
        rows={4}
        value={record.body || ''}
        placeholder={`{\n  "email": "{MASK_1}",\n  "password": "{MASK_2}"\n}`}
        onCommit={(next) => onBody(idx, next)}
      />
    </div>
  );
}
