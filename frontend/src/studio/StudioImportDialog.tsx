import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Modal, Radio, Space, Typography } from 'antd';
import { getActiveCheckId, listChecks } from '../checks/checksStore';
import {
  ALL_BLOCKS_SELECTED,
  countBlocks,
  extractEditorBlocks,
  selectBlocks,
  type BlockSelection,
  type ImportBlocksPayload,
} from './studioTransfer';
import { normalizeImport } from './studioResources';

interface StudioImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (payload: ImportBlocksPayload) => void;
}

const BLOCK_LABELS: Record<keyof BlockSelection, string> = {
  pages: 'Страницы',
  scenarios: 'Сценарии',
  modules: 'Модули',
  fuzzers: 'Фаззеры',
  resources: 'Ресурсы',
};

const BLOCK_KEYS: (keyof BlockSelection)[] = ['pages', 'scenarios', 'modules', 'fuzzers', 'resources'];

const BLOCK_PLURALS: Record<keyof BlockSelection, [string, string, string]> = {
  pages: ['страница', 'страницы', 'страниц'],
  scenarios: ['сценарий', 'сценария', 'сценариев'],
  modules: ['модуль', 'модуля', 'модулей'],
  fuzzers: ['фаззер', 'фаззера', 'фаззеров'],
  resources: ['ресурс', 'ресурса', 'ресурсов'],
};

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function formatCounts(counts: Record<keyof BlockSelection, number>): string {
  const parts = BLOCK_KEYS.filter((k) => counts[k] > 0).map(
    (k) => `${counts[k]} ${plural(counts[k], BLOCK_PLURALS[k])}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'нет блоков';
}

export const StudioImportDialog: React.FC<StudioImportDialogProps> = ({
  open,
  onClose,
  onImport,
}) => {
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [selection, setSelection] = useState<BlockSelection>({ ...ALL_BLOCKS_SELECTED });

  const currentCheckId = getActiveCheckId();

  const checks = useMemo(() => {
    return listChecks().filter((c) => c.check_id !== currentCheckId);
  }, [currentCheckId]);

  useEffect(() => {
    if (open) {
      setSelectedCheckId(null);
      setSelection({ ...ALL_BLOCKS_SELECTED });
    }
  }, [open]);

  const selectedCheck = useMemo(() => {
    return checks.find((c) => c.check_id === selectedCheckId) ?? null;
  }, [checks, selectedCheckId]);

  const handleImport = () => {
    if (!selectedCheck) return;
    const blocks = extractEditorBlocks(selectedCheck.wired);
    const filtered = selectBlocks(blocks, selection);

    const resourceContents: Record<string, string> = {};
    if (selection.resources && selectedCheck.resource_contents) {
      for (const resource of filtered.resources) {
        const as = normalizeImport(resource).as;
        if (as && as in selectedCheck.resource_contents) {
          resourceContents[as] = selectedCheck.resource_contents[as] ?? '';
        }
      }
    }

    onImport({ blocks: filtered, resourceContents });
  };

  const footer = (
    <Space>
      <Button onClick={onClose}>Отмена</Button>
      <Button
        type="primary"
        disabled={!selectedCheckId}
        onClick={handleImport}
      >
        Импортировать
      </Button>
    </Space>
  );

  return (
    <Modal
      title="Импорт из проверки"
      open={open}
      onCancel={onClose}
      footer={footer}
      width={560}
      destroyOnHidden
      centered
    >
      {checks.length === 0 ? (
        <Empty description="Нет других проверок для импорта" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Typography.Text strong>Выберите проверку-источник:</Typography.Text>
            <Radio.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxHeight: 260, overflowY: 'auto' }}
              value={selectedCheckId}
              onChange={(e) => setSelectedCheckId(e.target.value)}
            >
              {checks.map((check) => {
                const counts = countBlocks(extractEditorBlocks(check.wired));
                const label = (
                  <span>
                    <Typography.Text strong>{check.title}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatCounts(counts)}
                    </Typography.Text>
                  </span>
                );
                return (
                  <Radio key={check.check_id} value={check.check_id}>
                    {label}
                  </Radio>
                );
              })}
            </Radio.Group>
          </div>

          <div>
            <Typography.Text strong>Типы блоков для импорта:</Typography.Text>
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}
              value={BLOCK_KEYS.filter((k) => selection[k])}
              onChange={(values) => {
                const next: BlockSelection = { ...selection };
                for (const k of BLOCK_KEYS) {
                  next[k] = (values as string[]).includes(k);
                }
                setSelection(next);
              }}
              options={BLOCK_KEYS.map((k) => ({
                label: BLOCK_LABELS[k],
                value: k,
              }))}
            />
          </div>
        </div>
      )}
    </Modal>
  );
};
