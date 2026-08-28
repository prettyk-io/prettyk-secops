/**
 * WIRE-SYNC-F1: ScenarioStepCard — карточка шага с бейджами DSL-блоков.
 *
 * Оборачивает StepPillRow, добавляя поверх:
 *   [RECOVER] — сворачиваемый read-only аккордеон с шагами восстановления
 *   [SOFT]    — компактный серый/жёлтый бейдж
 *   [TRY]     — пунктирная рамка вокруг шагов внутри try/catch
 *
 * Нулевой шум: если blockMeta отсутствует — рендерится чистый StepPillRow.
 */
import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert, SkipForward, ArrowRight } from 'lucide-react';
import { StepPillRow } from './StepPillRow';
import type { ScenarioStepModel } from './scenarioStepModel';

export interface ScenarioStepCardProps {
  step: ScenarioStepModel;
  index: number;
  onChange: (patch: Partial<ScenarioStepModel>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDebug: () => void;
  /** WIRE-SYNC-F1: колбэк для deep-link к строке Monaco. */
  onJumpToLine?: (line: number) => void;
}

const BADGE_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  recover: {
    bg: 'rgba(249,115,22,0.1)',
    color: '#f97316',
    icon: <ShieldAlert className="size-2.5" />,
  },
  soft: {
    bg: 'rgba(234,179,8,0.1)',
    color: '#eab308',
    icon: <SkipForward className="size-2.5" />,
  },
  try: {
    bg: 'rgba(168,85,247,0.1)',
    color: '#a855f7',
    icon: null,
  },
};

export function ScenarioStepCard({
  step, index, onChange, onDelete, onMoveUp, onMoveDown, onDebug, onJumpToLine,
}: ScenarioStepCardProps) {
  const [recoverOpen, setRecoverOpen] = useState(false);
  const blockMeta = step.blockMeta ?? [];
  const hasRecover = blockMeta.some((m) => m.kind === 'recover');
  const hasSoft = blockMeta.some((m) => m.kind === 'soft');
  const tryBlock = blockMeta.find((m) => m.kind === 'try' && m.title);
  const inTry = blockMeta.some((m) => m.kind === 'try');
  const hasOverlay = blockMeta.length > 0;

  const handleJump = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (step.dslLine) onJumpToLine?.(step.dslLine);
  }, [step.dslLine, onJumpToLine]);

  return (
    <div style={{ position: 'relative' }}>
      {/* TRY-BLOCK рамка */}
      {tryBlock && (
        <div
          style={{
            position: 'absolute', inset: -4,
            border: '1.5px dashed #a855f7', borderRadius: 6,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Основная строка */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StepPillRow
            step={step}
            index={index}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDebug={onDebug}
          />
        </div>

        {/* Бейджи */}
        {hasOverlay && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingRight: 4 }}>
            {/* SOFT бейдж */}
            {hasSoft && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  padding: '1px 5px', borderRadius: 3, fontSize: 9,
                  fontFamily: 'Golos UI, sans-serif', fontWeight: 600,
                  background: BADGE_STYLES.soft!.bg, color: BADGE_STYLES.soft!.color,
                  border: `1px solid ${BADGE_STYLES.soft!.color}30`,
                }}
                title="Soft-skip: шаг не прерывает прогон при ошибке"
              >
                {BADGE_STYLES.soft!.icon}
                SOFT
              </span>
            )}
            {/* RECOVER бейдж */}
            {hasRecover && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setRecoverOpen((v) => !v); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  padding: '1px 5px', borderRadius: 3, fontSize: 9,
                  fontFamily: 'Golos UI, sans-serif', fontWeight: 600,
                  background: BADGE_STYLES.recover!.bg, color: BADGE_STYLES.recover!.color,
                  border: `1px solid ${BADGE_STYLES.recover!.color}30`,
                  cursor: 'pointer',
                }}
                title="Recover: >@ — шаги восстановления при ошибке"
              >
                {BADGE_STYLES.recover!.icon}
                RECOVER
                {recoverOpen ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
              </button>
            )}
            {/* Deep-link кнопка */}
            {step.dslLine && (
              <button
                type="button"
                onClick={handleJump}
                className="pk-step-deeplink inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] opacity-0 transition-opacity"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  background: 'rgba(56,189,248,0.08)', color: '#38bdf8',
                  border: '1px solid rgba(56,189,248,0.2)', cursor: 'pointer',
                }}
                title={`Перейти к строке ${step.dslLine} в Monaco`}
              >
                <ArrowRight className="size-2.5" />
                L{step.dslLine}
              </button>
            )}
          </div>
        )}
      </div>

      {/* RECOVER аккордеон */}
      {hasRecover && recoverOpen && step.recoverSteps && step.recoverSteps.length > 0 && (
        <div
          style={{
            marginLeft: 24, marginTop: 2, marginBottom: 4,
            padding: '4px 8px', borderRadius: 4,
            background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ShieldAlert className="size-3" style={{ color: '#f97316' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#f97316', fontFamily: 'Golos UI, sans-serif' }}>
              RECOVER · {step.recoverSteps.length} шагов
            </span>
            <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'Golos UI, sans-serif' }}>
              retry primary ×1
            </span>
          </div>
          {step.recoverSteps.map((rs, ri) => (
            <div key={rs.id} style={{ pointerEvents: 'none', opacity: 0.7 }}>
              <StepPillRow
                step={rs}
                index={ri}
                onChange={() => {}}
                onDelete={() => {}}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
                onDebug={() => {}}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}