/**
 * BLANK-PREV-1: Inline-превью бланка акта ИБ в Результатах.
 * Честный интерактивный inline-просмотр официального акта/бланка.
 * Подвал акта: Строка «Отпечаток проверки: <fnv1a-hash>» на базе wiredContentHash.
 * Кнопка «Печать в PDF» (window.print()) с CSS @media print.
 *
 * Стилистика: SecOps Lab Dark, скругления 5–6px, токены --pk-*, JetBrains Mono для хешей.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Modal, Space, Tag, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  FileDoneOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { downloadBlankHtml, renderBlankHtml } from './blankHtml';
import { buildBlankPayload } from './blankPayload';
import { wiredContentHash } from './blankLetterhead';
import type { BlankKind, BlankPayload, LiveMetaSnapshot, ResultsHooksSnapshot } from './types';
import { buildRunRecordFromLive } from './buildRunRecordFromLive';

export type BlankPanelProps = {
  kind?: BlankKind;
  formData: unknown;
  meta?: LiveMetaSnapshot | null;
  hooks?: ResultsHooksSnapshot | null;
  open?: boolean;
  onClose?: () => void;
};

export function BlankPanel({
  kind = 'act',
  formData,
  meta,
  hooks,
  open = true,
  onClose,
}: BlankPanelProps): React.JSX.Element | null {
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const payload: BlankPayload = useMemo(() => {
    const run = meta || hooks ? buildRunRecordFromLive({ meta, hooks }) : undefined;
    return buildBlankPayload({
      kind,
      formData,
      run,
    });
  }, [kind, formData, meta, hooks]);

  const html = useMemo(() => {
    return renderBlankHtml(payload);
  }, [payload]);

  const hash = useMemo(() => {
    return payload.wired_hash || wiredContentHash(payload.form_snapshot);
  }, [payload]);

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
  };

  const handleDownload = () => {
    downloadBlankHtml(payload, kind === 'act' ? 'act.html' : 'tz.html');
  };

  if (!open) return null;

  const content = (
    <div
      data-testid="blank-preview-container"
      className="pk-blank-preview-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: fullscreen ? 'calc(100vh - 120px)' : '680px',
        gap: 12,
      }}
    >
      {/* Тулбар действий превью */}
      <div
        className="pk-blank-preview-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          padding: '8px 12px',
          background: 'var(--pk-surface-muted, #1f2430)',
          borderRadius: 6,
          border: '1px solid var(--pk-border, #3a4150)',
        }}
      >
        <Space size={12} wrap align="center">
          <FileDoneOutlined style={{ color: 'var(--pk-accent, #109bdf)', fontSize: 16 }} />
          <Typography.Text strong style={{ fontSize: 13 }}>
            {kind === 'act' ? 'Официальный акт проверки ИБ' : 'Техническое задание'}
          </Typography.Text>
          <Tooltip title="32-битный FNV-1a хеш слепка манифеста без секретов">
            <Tag
              color="blue"
              data-testid="blank-hash-tag"
              style={{
                fontFamily: 'var(--pk-mono, "JetBrains Mono", monospace)',
                fontSize: 12,
                marginInlineEnd: 0,
              }}
            >
              Отпечаток: {hash}
            </Tag>
          </Tooltip>
        </Space>

        <Space size={8} wrap>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            type="primary"
            onClick={handlePrint}
            data-testid="blank-print-btn"
          >
            Печать в PDF
          </Button>

          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            data-testid="blank-download-btn"
          >
            Скачать HTML
          </Button>

          <Button
            size="small"
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setFullscreen((v) => !v)}
            data-testid="blank-fullscreen-btn"
          >
            {fullscreen ? 'Обычный вид' : 'Во весь экран'}
          </Button>
        </Space>
      </div>

      {/* Интерактивный iframe с изолированным белым листом А4 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: '#525659',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          padding: '16px 8px',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        <iframe
          ref={iframeRef}
          title="Превью акта"
          data-testid="blank-preview-iframe"
          style={{
            width: '100%',
            maxWidth: '880px',
            height: '100%',
            border: 'none',
            borderRadius: 4,
            background: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* Подвал с отпечатком и метаданными */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          fontSize: 11,
          opacity: 0.75,
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Отпечаток проверки:{' '}
          <span
            style={{
              fontFamily: 'var(--pk-mono, "JetBrains Mono", monospace)',
              fontWeight: 600,
            }}
          >
            {hash}
          </span>
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Сгенерировано: {new Date(payload.generated_at).toLocaleString('ru-RU')}
        </Typography.Text>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <Modal
        open={fullscreen}
        footer={null}
        onCancel={() => setFullscreen(false)}
        width="95vw"
        style={{ top: 20 }}
        styles={{ body: { padding: 12 } }}
        destroyOnClose
      >
        {content}
      </Modal>
    );
  }

  return (
    <Card
      size="small"
      title="Превью бланка"
      className="pk-results-blank-panel pk-admin-card"
      data-testid="results-blank-panel"
      extra={
        onClose ? (
          <Button size="small" type="text" onClick={onClose}>
            Скрыть
          </Button>
        ) : undefined
      }
      style={{ marginTop: 16 }}
    >
      {content}
    </Card>
  );
}
