import React, { useRef } from 'react';
import { Space, Typography } from 'antd';
import { importWiredErrorMessage, importWiredJson } from '../utils/importWired';
import { auditAndClampFormDataForRoleCaps, formatRoleCapsThreat, writeRoleCapsThreat } from '../utils/applyRoleCaps';
import { capsForUser, readSession } from '../shell/auth';
import { freshCheckWiredData } from '../shell/freshCheck';
import studioNewCheckIcon from '../assets/icons/home-new-check-icon.png';
import studioImportCheckIcon from '../assets/icons/import-wired-icon.png';

export interface StudioLaunchpadProps {
  onStartFresh: () => void;
  onStartImported: (formData: unknown) => void;
}

export function StudioLaunchpad({ onStartFresh, onStartImported }: StudioLaunchpadProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
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
        onStartImported(formData);
      })
      .catch(() => {
        alert(`${file.name}: не удалось прочитать файл`);
      });
  };

  return (
    <div
      className="pk-studio-launchpad"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        background: '#0B0F17',
        padding: 24,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFile(file);
          }
          e.target.value = '';
        }}
      />
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Typography.Title level={3} style={{ color: '#F8FAFC', marginBottom: 8 }}>
          Рабочая зона Студии
        </Typography.Title>
        <Typography.Text style={{ color: '#94A3B8', fontSize: 14 }}>
          Выберите действие для начала работы с конфигурацией проверки
        </Typography.Text>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Плитка 1: Новая конфигурация проверки */}
        <button
          type="button"
          onClick={onStartFresh}
          className="pk-studio-launch-tile"
          data-testid="studio-launch-fresh"
          style={{
            background: 'linear-gradient(180deg, #131B2E 0%, #0D131F 100%)',
            border: '1px solid rgba(147, 51, 234, 0.4)',
            borderRadius: 8,
            padding: '32px 24px',
            width: 280,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 0 24px rgba(147, 51, 234, 0.15)',
            transition: 'all 0.2s ease',
          }}
        >
          <img src={studioNewCheckIcon} width={80} height={80} alt="" style={{ marginBottom: 16 }} />
          <Typography.Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 600, marginBottom: 8, display: 'block' }}>
            Новая конфигурация проверки
          </Typography.Text>
          <Typography.Text style={{ color: '#94A3B8', fontSize: 12 }}>
            Инициализировать чистую структуру сценариев и моделей данных
          </Typography.Text>
        </button>

        {/* Плитка 2: Загрузить конфигурацию проверки */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="pk-studio-launch-tile"
          data-testid="studio-launch-import"
          style={{
            background: 'linear-gradient(180deg, #131B2E 0%, #0D131F 100%)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 8,
            padding: '32px 24px',
            width: 280,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 0 24px rgba(56, 189, 248, 0.15)',
            transition: 'all 0.2s ease',
          }}
        >
          <img src={studioImportCheckIcon} width={80} height={80} alt="" style={{ marginBottom: 16 }} />
          <Typography.Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 600, marginBottom: 8, display: 'block' }}>
            Загрузить конфигурацию
          </Typography.Text>
          <Typography.Text style={{ color: '#94A3B8', fontSize: 12 }}>
            Импортировать готовый JSON-манифест проверки из файла
          </Typography.Text>
        </button>
      </div>
    </div>
  );
}
