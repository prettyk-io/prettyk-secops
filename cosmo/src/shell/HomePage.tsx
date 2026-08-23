import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { Button, Form, Input, Layout, Modal, Select } from 'antd';
import homeHistoryIcon from '../assets/icons/home-history-icon.png';
import homeNewCheckIcon from '../assets/icons/home-new-check-icon.png';
import homeImportIcon from '../assets/icons/home-import-icon.png';
import homeSettingsIcon from '../assets/icons/home-settings-icon.png';
import homeLabIcon from '../assets/icons/home-lab-icon.png';
import { fitFontSizeToWidth, titleTargetWidth } from './homeTitleFit';
import { ShellChrome } from './ShellChrome';
import { importWiredErrorMessage, importWiredJson } from '../utils/importWired';
import { auditAndClampFormDataForRoleCaps, formatRoleCapsThreat, writeRoleCapsThreat } from '../utils/applyRoleCaps';
import { capsForUser, readSession } from './auth';
import { useLocale } from '../locales';

const BROWSER_OPTIONS = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'chrome-headless', label: 'Chrome (headless)' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'firefox-headless', label: 'Firefox (headless)' },
];

export type HomePageProps = {
  onOpenHistory?: () => void;
  onOpenAdmin: () => void;
  onOpenLab?: () => void;
  onStartFresh?: (title: string, url: string, browserType: string) => void;
  onStartSetup?: () => void;
  onStartImported?: (formData: unknown, title: string) => void;
  /** Болванка из реестра деплоев (ADM-BLANK-1). */
  onStartFromDeploy?: (deployId: string, title: string) => void;
  onLogout?: () => void;
  /** One-shot entrance after login→home (AppShell). */
  playEnter?: boolean;
  onEnterPlayed?: () => void;
  /** Cosmo lab: expert_ib — без кнопки Admin. */
  canAccessAdmin?: boolean;
  /** ADM-IMPORT-WALL: JSON только admin_ib / nshr. */
  canimportWired?: boolean;
  /** Метка роли в хедере (только «Администратор ИБ» — справа; остальные роли не показываются). */
  roleLabel?: string | null;
};

const HOME_TITLE = 'Динамическое тестирование безопасности';
const INITIATE_TITLE = 'Новая конфигурация проверки';

function HomeEntryIcon({ src }: { src: string }): React.JSX.Element {
  return (
    <span className="pk-home-entry-icon" aria-hidden>
      <img src={src} width={48} height={48} alt="" />
    </span>
  );
}

export function HomePage({
  onOpenHistory,
  onOpenAdmin,
  onOpenLab,
  onStartFresh,
  onStartSetup,
  onStartImported,
  onLogout,
  playEnter = false,
  onEnterPlayed,
  canAccessAdmin = true,
  canimportWired = true,
  roleLabel = null,
}: HomePageProps): React.JSX.Element {
  const { dict } = useLocale();
  const [step, setStep] = useState<'menu' | 'initiate'>('menu');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm<{ title: string; url: string; browser: string }>();
  const [entering, setEntering] = useState(playEnter);
  const enterActiveRef = useRef(playEnter);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [checkTitleInput, setCheckTitleInput] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateFreshSubmit = () => {
    setCreateModalOpen(true);
    form.resetFields();
    form.setFieldsValue({ title: '', url: 'http://', browser: 'chrome-headless' });
  };

  const handleCreateFreshConfirm = () => {
    form.validateFields().then((values) => {
      setCreateModalOpen(false);
      if (onStartFresh) {
        onStartFresh(values.title.trim() || 'Новая проверка', values.url.trim(), values.browser);
      }
    }).catch(() => {});
  };

  const handleImportFile = (file: File, customTitle?: string) => {
    void file
      .text()
      .then((text) => {
        const result = importWiredJson(text);
        if (!result.ok) {
          alert(importWiredErrorMessage(file.name, result));
          return;
        }
        const caps = capsForUser(readSession());
        const { formData, violations } = auditAndClampFormDataForRoleCaps(result.formData, caps);
        if (violations.length > 0) {
          const threat = formatRoleCapsThreat(violations, caps);
          writeRoleCapsThreat(threat);
        }
        setCheckTitleInput('');
        setPendingFile(null);
        if (onStartImported) {
          onStartImported(formData, customTitle || file.name.replace(/\.[^/.]+$/, ''));
        }
      })
      .catch(() => {
        alert(`${file.name}: не удалось прочитать файл`);
      });
  };

  useEffect(() => {
    if (!playEnter) {
      return;
    }
    enterActiveRef.current = true;
    setEntering(true);
  }, [playEnter]);

  useEffect(() => {
    if (!entering) {
      return;
    }
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq?.matches) {
      return;
    }
    enterActiveRef.current = false;
    setEntering(false);
    onEnterPlayed?.();
  }, [entering, onEnterPlayed]);

  useLayoutEffect(() => {
    if (!titleRef.current || !panelRef.current) {
      return;
    }
  }, [step]);

  const finishEnter = () => {
    if (!enterActiveRef.current) {
      return;
    }
    enterActiveRef.current = false;
    setEntering(false);
    onEnterPlayed?.();
  };

  return (
    <Layout className="pk-layout pk-shell-layout pk-home-page">
      <ShellChrome
        roleLabel={roleLabel}
        onLogout={onLogout}
        showThemeToggle={false}
      />
      <Layout.Content className="pk-home-body">
        <div
          className={entering ? 'pk-home-stage pk-home-stage--enter' : 'pk-home-stage'}
          data-testid="home-stage"
          onAnimationEnd={finishEnter}
        >
          <div className="pk-shell-glass-wrap pk-home-glass-wrap">
            <div
              ref={panelRef}
              className="pk-shell-panel pk-shell-glass-panel pk-home-panel"
              data-testid="home-panel"
            >
              {step === 'menu' ? (
                <div className="pk-home-entry-list">
                  <button
                    type="button"
                    className="pk-home-entry"
                    data-testid="home-initiate"
                    onClick={() => setStep('initiate')}
                  >
                    <span className="pk-home-entry-main">
                      <span className="pk-home-entry-product-lockup" aria-hidden>
                        <img src="/brand/secops-studio-lockup.png" alt="SecOps Studio" height={32} />
                      </span>
                    </span>
                    <span className="pk-home-entry-chevron" aria-hidden>
                      →
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pk-home-entry"
                    data-testid="home-lab"
                    onClick={() => {
                      if (onOpenLab) {
                        onOpenLab();
                      } else {
                        window.location.hash = '#/lab';
                      }
                    }}
                  >
                    <span className="pk-home-entry-main">
                      <span className="pk-home-entry-product-lockup" aria-hidden>
                        <img src="/brand/secops-lab-lockup.png" alt="SecOps Lab" height={32} />
                      </span>
                    </span>
                    <span className="pk-home-entry-chevron" aria-hidden>
                      →
                    </span>
                  </button>
                  {canAccessAdmin ? (
                    <button
                      type="button"
                      className="pk-home-entry"
                      data-testid="home-policies"
                      onClick={onOpenAdmin}
                    >
                      <span className="pk-home-entry-main">
                        <HomeEntryIcon src={homeSettingsIcon} />
                        <span className="pk-home-entry-label">
                          {dict.homeMenu.policiesSettings}
                        </span>
                      </span>
                      <span className="pk-home-entry-chevron" aria-hidden>
                        →
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="pk-home-entry"
                    data-testid="home-design-playground"
                    onClick={() => { window.location.hash = '#/design-playground'; }}
                  >
                    <span className="pk-home-entry-main">
                      <span className="pk-home-entry-label">Design Playground</span>
                    </span>
                    <span className="pk-home-entry-chevron" aria-hidden>
                      →
                    </span>
                  </button>
                </div>
              ) : (
                <div className="pk-home-initiate" data-testid="home-initiate-view">
                  <div className="pk-home-initiate-actions">
                    <button
                      type="button"
                      className="pk-home-entry"
                      data-testid="studio-modal-fresh"
                      onClick={handleCreateFreshSubmit}
                    >
                      <span className="pk-home-entry-main">
                        <HomeEntryIcon src={homeNewCheckIcon} />
                        <span className="pk-home-entry-label">{dict.homeMenu.newCheck}</span>
                      </span>
                      <span className="pk-home-entry-chevron" aria-hidden>
                        →
                      </span>
                    </button>

                    {onOpenHistory ? (
                      <button
                        type="button"
                        className="pk-home-entry"
                        data-testid="studio-modal-history"
                        onClick={onOpenHistory}
                      >
                        <span className="pk-home-entry-main">
                          <HomeEntryIcon src={homeHistoryIcon} />
                          <span className="pk-home-entry-label">{dict.homeMenu.checkHistory}</span>
                        </span>
                        <span className="pk-home-entry-chevron" aria-hidden>
                          →
                        </span>
                      </button>
                    ) : null}

                    {canimportWired ? (
                      <button
                        type="button"
                        className="pk-home-entry"
                        data-testid="studio-modal-import"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span className="pk-home-entry-main">
                          <HomeEntryIcon src={homeImportIcon} />
                          <span className="pk-home-entry-label">
                            {pendingFile ? (
                              <span className="pk-home-pending-file">{pendingFile.name}</span>
                            ) : (
                              dict.homeMenu.importCheck
                            )}
                          </span>
                        </span>
                        <span className="pk-home-entry-chevron" aria-hidden>
                          →
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <div className="pk-home-initiate-footer">
                    <button
                      type="button"
                      className="pk-home-back-btn"
                      onClick={() => {
                        setStep('menu');
                        setPendingFile(null);
                      }}
                    >
                      <span className="pk-home-back-chevron" aria-hidden>
                        ←
                      </span>
                      <span>{dict.homeMenu.back}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout.Content>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setPendingFile(file);
            handleImportFile(file, checkTitleInput.trim() || undefined);
          }
          e.target.value = '';
        }}
      />

      <Modal
        title={dict.homeMenu.freshCheckTitle}
        open={createModalOpen}
        onOk={handleCreateFreshConfirm}
        onCancel={() => setCreateModalOpen(false)}
        okText={dict.studio.launchPipeline}
        cancelText={dict.common.cancel}
        okButtonProps={{ htmlType: 'submit' }}
      >
        <div data-testid="home-fresh-view">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label={dict.studio.form.title} rules={[{ required: true, message: dict.studio.emptyTitle }]}>
            <Input placeholder="My security check" autoFocus />
          </Form.Item>
          <Form.Item name="url" label={dict.homeMenu.freshCheckSubtitle} rules={[{ required: true, message: 'URL is required' }]}>
            <Input placeholder="http://juice-shop:3000" />
          </Form.Item>
          <Form.Item name="browser" label={dict.studio.form.browser ?? 'Browser'}>
            <Select options={BROWSER_OPTIONS} />
          </Form.Item>
        </Form>
        </div>
      </Modal>
    </Layout>
  );
}
