/**
 * CO-PILOT META (PoC) BUD-6 — Launchpad Hero.
 *
 * Пустой проект → Buddy-консоль по центру Launchpad
 * («Опиши приложение / вставь ссылку / OpenAPI / HAR»).
 * Инпут + 4 входных чипа + отправка intent в Buddy-движок (пока колбэк).
 */
import { useState } from 'react';
import { Sparkles, Link2, FileCode2, FileJson, Send } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LaunchpadHeroProps {
  /** Отправить intent в Buddy (движок Boss). */
  onSubmitIntent: (intent: string) => void;
  /** Колбэк вставки HAR-файла / OpenAPI / ссылки (позже wired в движок). */
  onImportKind?: (kind: 'openapi' | 'har' | 'link') => void;
}

const INPUT_HINTS = [
  { kind: 'openapi' as const, icon: FileCode2, label: 'OpenAPI' },
  { kind: 'har' as const, icon: FileJson, label: 'HAR' },
  { kind: 'link' as const, icon: Link2, label: 'Ссылка' },
];

export function LaunchpadHero({ onSubmitIntent, onImportKind }: LaunchpadHeroProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmitIntent(trimmed);
    setValue('');
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full p-6"
      style={{ background: '#0B0F17' }}
      data-testid="buddy-launchpad-hero"
    >
      <div className="max-w-[560px] w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="size-5 text-[#a855f7]" />
          <h2 className="text-lg font-semibold text-slate-100">PrettyK Buddy</h2>
        </div>
        <p className="text-[13px] text-slate-400 mb-6">
          Опиши целевое приложение простыми словами, вставь ссылку, OpenAPI или HAR —
          и Buddy соберёт каркас страниц и сценариев.
        </p>

        <div className="relative mb-4">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder="Например: это SPA. Есть каталог, карточка товара и корзина. Пользователь открывает товар, добавляет в корзину и видит товар в корзине…"
            className="w-full resize-none rounded-lg border border-slate-700 bg-[#131B2E] px-3 py-2.5 text-[13px] text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#a855f7]/60 focus:ring-1 focus:ring-[#a855f7]/40"
            aria-label="Описание приложения"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center mb-4">
          {INPUT_HINTS.map((h) => (
            <button
              key={h.kind}
              onClick={() => onImportKind?.(h.kind)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors',
                'border-slate-700 bg-slate-900/40 text-slate-300 hover:bg-slate-800 hover:border-cyan-500/40',
              )}
              data-testid={`launchpad-import-${h.kind}`}
            >
              <h.icon className="size-3.5 text-cyan-400" />
              {h.label}
            </button>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={!value.trim()}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all',
            value.trim()
              ? 'text-white'
              : 'text-slate-500 cursor-not-allowed',
          )}
          style={{
            background: value.trim()
              ? 'linear-gradient(90deg, #a855f7, #38bdf8)'
              : 'rgba(148,163,184,0.08)',
          }}
          data-testid="launchpad-submit"
        >
          <Send className="size-3.5" /> Отправить в Buddy
        </button>
      </div>
    </div>
  );
}
