/**
 * Глобальная палитра команд (Ctrl/⌘+K · Ctrl/⌘+Shift+P · Ctrl/⌘+P).
 * Слой shell (навигация) + слой Studio (сущности / создать / вкладки / канвас).
 */
import { Command } from 'cmdk';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { HashRoute } from '../checks/hashRoute';
import { HUB_ACTION_TILES } from '../studio/StudioActionHub';
import { canAccessAdmin, readSession } from './auth';
import {
  ENTITY_KIND_LABEL,
  getStudioCommandHost,
  subscribeStudioCommandHost,
} from './studioCommandHost';

export type CommandPaletteProps = {
  onNavigate: (route: HashRoute) => void;
};

type NavItem = {
  id: string;
  label: string;
  hint?: string;
  route: HashRoute;
};

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Главная', hint: 'Старт проверки', route: { kind: 'home' } },
  { id: 'history', label: 'История', hint: 'Список проверок', route: { kind: 'history' } },
  { id: 'admin', label: 'Админка', route: { kind: 'admin' } },
  { id: 'sanctuary-map', label: 'Радар Обители', hint: 'Карта приложения', route: { kind: 'sanctuary-map' } },
];

const CREATE_TILES = HUB_ACTION_TILES.filter((tile) => !tile.isStub && !tile.isExternal);

function useStudioHost() {
  return useSyncExternalStore(subscribeStudioCommandHost, getStudioCommandHost, () => null);
}

export function CommandPalette({ onNavigate }: CommandPaletteProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const studio = useStudioHost();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      // Capture + code=: Monaco chord и русская раскладка (key !== латиница).
      const isModK =
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.code === 'KeyK' || event.key.toLowerCase() === 'k');
      // VS Code: Ctrl+Shift+P = Command Palette; Ctrl+P = Quick Open → та же палитра.
      const isModShiftP =
        mod &&
        !event.altKey &&
        event.shiftKey &&
        (event.code === 'KeyP' || event.key.toLowerCase() === 'p');
      const isModP =
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.code === 'KeyP' || event.key.toLowerCase() === 'p');
      if (isModK || isModShiftP || isModP) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!open) {
    return null;
  }

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="pk-cmdk-root" role="presentation">
      <button
        type="button"
        className="pk-cmdk-backdrop"
        aria-label="Закрыть палитру"
        onClick={() => setOpen(false)}
      />
      <Command className="pk-cmdk" label="Палитра команд" shouldFilter>
        <Command.Input placeholder="Команда…" autoFocus />
        <Command.List>
          <Command.Empty>Ничего не найдено</Command.Empty>

          <Command.Group heading="Навигация">
            {NAV_ITEMS.filter(
              (item) => item.id !== 'admin' || canAccessAdmin(readSession()),
            ).map((item) => (
              <Command.Item
                key={item.id}
                value={`${item.label} ${item.hint ?? ''}`}
                onSelect={() => {
                  run(() => onNavigate(item.route));
                }}
              >
                <span>{item.label}</span>
                {item.hint ? <span className="pk-cmdk-hint">{item.hint}</span> : null}
              </Command.Item>
            ))}
          </Command.Group>

          {studio ? (
            <>
              <Command.Group heading="Открыть">
                {studio.entities.length === 0 ? (
                  <Command.Item value="нет сущностей" disabled>
                    <span>Нет сущностей</span>
                  </Command.Item>
                ) : (
                  studio.entities.map((entity) => (
                    <Command.Item
                      key={entity.id}
                      value={`открыть ${entity.label} ${ENTITY_KIND_LABEL[entity.kind]} ${entity.kind}`}
                      onSelect={() => {
                        run(() => studio.openEntity(entity.tabId));
                      }}
                    >
                      <span>{entity.label}</span>
                      <span className="pk-cmdk-hint">{ENTITY_KIND_LABEL[entity.kind]}</span>
                    </Command.Item>
                  ))
                )}
              </Command.Group>

              <Command.Group heading="Создать">
                {CREATE_TILES.map((tile) => (
                  <Command.Item
                    key={tile.id}
                    value={`создать ${tile.title} ${tile.description}`}
                    onSelect={() => {
                      run(() => studio.create(tile.id));
                    }}
                  >
                    <span>{tile.title}</span>
                    <span className="pk-cmdk-hint">Создать</span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Вкладки">
                {studio.tabs
                  .filter((tab) => tab.id !== 'action-hub')
                  .map((tab) => (
                    <Command.Item
                      key={`tab-${tab.id}`}
                      value={`вкладка ${tab.title} ${tab.id}`}
                      onSelect={() => {
                        run(() => studio.switchTab(tab.id));
                      }}
                    >
                      <span>{tab.title.trim() || 'Без названия'}</span>
                      <span className="pk-cmdk-hint">
                        {tab.id === studio.activeTabId ? 'Активная' : 'Переключить'}
                      </span>
                    </Command.Item>
                  ))}
                <Command.Item
                  value="закрыть активную вкладку close tab"
                  onSelect={() => {
                    run(() => studio.closeActiveTab());
                  }}
                >
                  <span>Закрыть активную вкладку</span>
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Канвас">
                <Command.Item
                  value="validate валидация манифест"
                  onSelect={() => {
                    run(() => studio.validate());
                  }}
                >
                  <span>Validate</span>
                  <span className="pk-cmdk-hint">Проверка манифеста</span>
                </Command.Item>
                {studio.baseline ? (
                  <Command.Item
                    value="baseline pipeline запуск"
                    onSelect={() => {
                      run(() => studio.baseline?.());
                    }}
                  >
                    <span>Baseline</span>
                    <span className="pk-cmdk-hint">Запуск pipeline</span>
                  </Command.Item>
                ) : null}
                <Command.Item
                  value="go to definition goto definition переход к определению f12"
                  onSelect={() => {
                    run(() => studio.goToDefinition());
                  }}
                >
                  <span>Go to definition</span>
                  <span className="pk-cmdk-hint">F12</span>
                </Command.Item>
                <Command.Item
                  value="go to references find references ссылки shift+f12"
                  onSelect={() => {
                    run(() => studio.goToReferences());
                  }}
                >
                  <span>Go to references</span>
                  <span className="pk-cmdk-hint">Shift+F12</span>
                </Command.Item>
                <Command.Item
                  value="peek definition peek определение alt+f12"
                  onSelect={() => {
                    run(() => studio.peekDefinition());
                  }}
                >
                  <span>Peek definition</span>
                  <span className="pk-cmdk-hint">Alt+F12</span>
                </Command.Item>
                <Command.Item
                  value="outline symbols goto symbol структура ctrl+shift+o"
                  onSelect={() => {
                    run(() => studio.showOutline());
                  }}
                >
                  <span>Outline</span>
                  <span className="pk-cmdk-hint">Ctrl+Shift+O</span>
                </Command.Item>
                <Command.Item
                  value="navigate back go back назад alt+left"
                  onSelect={() => {
                    run(() => studio.navigateBack());
                  }}
                >
                  <span>Go back</span>
                  <span className="pk-cmdk-hint">Alt+←</span>
                </Command.Item>
                <Command.Item
                  value="quick fix code action быстрый фикс ctrl+."
                  onSelect={() => {
                    run(() => studio.quickFix());
                  }}
                >
                  <span>Quick Fix</span>
                  <span className="pk-cmdk-hint">Ctrl+.</span>
                </Command.Item>
                <Command.Item
                  value="go to line goto line переход к строке ctrl+g"
                  onSelect={() => {
                    run(() => studio.gotoLine());
                  }}
                >
                  <span>Go to Line</span>
                  <span className="pk-cmdk-hint">Ctrl+G</span>
                </Command.Item>
                <Command.Item
                  value="select all occurrences highlights выделить все вхождения ctrl+shift+l"
                  onSelect={() => {
                    run(() => studio.selectHighlights());
                  }}
                >
                  <span>Select all occurrences</span>
                  <span className="pk-cmdk-hint">Ctrl+Shift+L</span>
                </Command.Item>
              </Command.Group>
            </>
          ) : null}
        </Command.List>
      </Command>
    </div>
  );
}
