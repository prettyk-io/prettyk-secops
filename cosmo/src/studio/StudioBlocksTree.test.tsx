// @vitest-environment jsdom
import { App, Modal } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { collectStudioNodes } from './collectStudioNodes';
import { StudioBlocksTree, type StudioBlocksTreeProps } from './StudioBlocksTree';

const formData = {
  test_suites: {
    pages: {
      login: { title: 'login', path: '', constructor: '' },
    },
    scenarios: [],
    test_data_constructor: [],
    fuzzers: [],
    imports: [],
  },
};

function renderTree(overrides: Partial<StudioBlocksTreeProps> = {}): void {
  const props: StudioBlocksTreeProps = {
    mode: 'on',
    tree: collectStudioNodes(formData),
    folders: {
      pages: [{ id: 'folder_1', title: 'Авторизация', members: ['login'] }],
      scenarios: [],
      modules: [],
      fuzzers: [],
      resources: [],
    },
    projectId: 'folders-test',
    onSelectTab: vi.fn(),
    onCreateFolder: vi.fn(() => true),
    onRenameFolder: vi.fn(() => true),
    onDeleteFolder: vi.fn(),
    onMoveFolderMember: vi.fn(),
    onDropTreeMember: vi.fn(),
    onCreatePage: vi.fn(() => true),
    onRenamePage: vi.fn(() => true),
    onDeletePage: vi.fn(),
    onCreateScenario: vi.fn(() => true),
    onRenameScenario: vi.fn(() => true),
    onDeleteScenario: vi.fn(),
    onCreateModule: vi.fn(() => true),
    onRenameModule: vi.fn(() => true),
    onDeleteModule: vi.fn(),
    onCreateFuzzer: vi.fn(() => true),
    onRenameFuzzer: vi.fn(() => true),
    onDeleteFuzzer: vi.fn(),
    onCreateResource: vi.fn(() => true),
    onAttachResourceFiles: vi.fn(),
    onRenameResource: vi.fn(() => true),
    onDeleteResource: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider>
      <App>
        <StudioBlocksTree {...props} />
      </App>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('prettyk:studio-folder-expansion:folders-test');
});

describe('StudioBlocksTree folders', () => {
  it('держит папку закрытой и показывает лист после раскрытия', () => {
    window.localStorage.removeItem('prettyk:studio-folder-expansion:folders-test');
    renderTree();

    expect(screen.getByText('Авторизация')).not.toBeNull();
    expect(screen.queryByText('login')).toBeNull();

    fireEvent.click(document.querySelector('.pk-studio-tree-folder-switcher')!);

    expect(screen.getByText('login')).not.toBeNull();
  });

  it('сворачивает и повторно раскрывает целый раздел Explorer', async () => {
    renderTree();
    expect(document.querySelector('.ant-tree-show-line')).toBeNull();
    const sectionNode = screen.getByText('Модели страниц').closest('[role="treeitem"]');
    const sectionSwitcher = sectionNode?.querySelector('.pk-studio-tree-section-switcher');
    if (!sectionNode || !sectionSwitcher) {
      throw new Error('Не найден switcher раздела Explorer');
    }

    expect(sectionNode.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(sectionSwitcher);
    expect(sectionNode.getAttribute('aria-expanded')).toBe('false');

    const reopenedSectionNode = screen.getByText('Модели страниц').closest('[role="treeitem"]');
    const reopenedSwitcher = reopenedSectionNode?.querySelector(
      '.pk-studio-tree-section-switcher',
    );
    if (!reopenedSectionNode || !reopenedSwitcher) {
      throw new Error('Не найден switcher повторного раскрытия раздела');
    }
    fireEvent.click(reopenedSwitcher);
    await waitFor(() => {
      expect(
        screen
          .getByText('Модели страниц')
          .closest('[role="treeitem"]')
          ?.getAttribute('aria-expanded'),
      ).toBe('true');
    });
    expect(screen.getByText('Авторизация')).not.toBeNull();
  });

  it('даёт в ПКМ секции создать сущность и добавить группу', async () => {
    window.localStorage.removeItem('prettyk:studio-folder-expansion:folders-test');
    renderTree();

    fireEvent.contextMenu(screen.getByText('Модели страниц'));

    expect(await screen.findByText('Создать модель страницы')).not.toBeNull();
    expect(screen.getByText('Добавить группу')).not.toBeNull();
  });

  it('после Escape снова применяет rename по Enter (VS Code)', async () => {
    window.localStorage.setItem(
      'prettyk:studio-folder-expansion:folders-test',
      JSON.stringify({ folders: ['folder:pages:folder_1'], collapsedGroups: [] }),
    );
    const onRenamePage = vi.fn(() => true);
    renderTree({ onRenamePage, selectedTabId: 'page:login' });

    fireEvent.contextMenu(screen.getByText('login'));
    fireEvent.click(await screen.findByText('Переименовать'));

    const firstInput = await screen.findByDisplayValue('login');
    fireEvent.keyDown(firstInput, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByDisplayValue('login')).toBeNull();
    });

    fireEvent.contextMenu(screen.getByText('login'));
    fireEvent.click(await screen.findByText('Переименовать'));
    const renameInput = await screen.findByDisplayValue('login');
    fireEvent.change(renameInput, { target: { value: 'login_v2' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onRenamePage).toHaveBeenCalledWith('login', 'login_v2');
    });
  });

  it('по revealRequest раскрывает раздел и папку', async () => {
    window.localStorage.setItem(
      'prettyk:studio-folder-expansion:folders-test',
      JSON.stringify({ folders: [], collapsedGroups: ['group:pages'] }),
    );
    const { rerender } = render(
      <ThemeProvider>
        <App>
          <StudioBlocksTree
            mode="on"
            tree={collectStudioNodes(formData)}
            folders={{
              pages: [{ id: 'folder_1', title: 'Авторизация', members: ['login'] }],
              scenarios: [],
              modules: [],
              fuzzers: [],
              resources: [],
            }}
            projectId="folders-test"
            onSelectTab={vi.fn()}
            onCreateFolder={vi.fn(() => true)}
            onRenameFolder={vi.fn(() => true)}
            onDeleteFolder={vi.fn()}
            onMoveFolderMember={vi.fn()}
            onDropTreeMember={vi.fn()}
            onCreatePage={vi.fn(() => true)}
            onRenamePage={vi.fn(() => true)}
            onDeletePage={vi.fn()}
            onCreateScenario={vi.fn(() => true)}
            onRenameScenario={vi.fn(() => true)}
            onDeleteScenario={vi.fn()}
            onCreateModule={vi.fn(() => true)}
            onRenameModule={vi.fn(() => true)}
            onDeleteModule={vi.fn()}
            onCreateFuzzer={vi.fn(() => true)}
            onRenameFuzzer={vi.fn(() => true)}
            onDeleteFuzzer={vi.fn()}
            onCreateResource={vi.fn(() => true)}
            onAttachResourceFiles={vi.fn()}
            onRenameResource={vi.fn(() => true)}
            onDeleteResource={vi.fn()}
            revealRequest={null}
          />
        </App>
      </ThemeProvider>,
    );

    const collapsedSection = screen.getByText('Модели страниц').closest('[role="treeitem"]');
    expect(collapsedSection?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('login')).toBeNull();

    rerender(
      <ThemeProvider>
        <App>
          <StudioBlocksTree
            mode="on"
            tree={collectStudioNodes(formData)}
            folders={{
              pages: [{ id: 'folder_1', title: 'Авторизация', members: ['login'] }],
              scenarios: [],
              modules: [],
              fuzzers: [],
              resources: [],
            }}
            projectId="folders-test"
            onSelectTab={vi.fn()}
            onCreateFolder={vi.fn(() => true)}
            onRenameFolder={vi.fn(() => true)}
            onDeleteFolder={vi.fn()}
            onMoveFolderMember={vi.fn()}
            onDropTreeMember={vi.fn()}
            onCreatePage={vi.fn(() => true)}
            onRenamePage={vi.fn(() => true)}
            onDeletePage={vi.fn()}
            onCreateScenario={vi.fn(() => true)}
            onRenameScenario={vi.fn(() => true)}
            onDeleteScenario={vi.fn()}
            onCreateModule={vi.fn(() => true)}
            onRenameModule={vi.fn(() => true)}
            onDeleteModule={vi.fn()}
            onCreateFuzzer={vi.fn(() => true)}
            onRenameFuzzer={vi.fn(() => true)}
            onDeleteFuzzer={vi.fn()}
            onCreateResource={vi.fn(() => true)}
            onAttachResourceFiles={vi.fn()}
            onRenameResource={vi.fn(() => true)}
            onDeleteResource={vi.fn()}
            revealRequest={{ token: 1, section: 'pages', folderId: 'folder_1' }}
          />
        </App>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Модели страниц')
          .closest('[role="treeitem"]')
          ?.getAttribute('aria-expanded'),
      ).toBe('true');
    });
    await waitFor(() => {
      expect(screen.getByText('login')).not.toBeNull();
    });
  });

  it('показывает модули плоско и не предлагает создавать для них группы', async () => {
    const tree = collectStudioNodes({
      ...formData,
      test_suites: {
        ...formData.test_suites,
        test_data_constructor: [{ id: 'users', module_type: 'Модуль работы с данными' }],
      },
    });
    renderTree({
      tree,
      folders: {
        pages: [],
        scenarios: [],
        modules: [{ id: 'legacy_folder', title: 'Старые модули', members: ['users'] }],
        fuzzers: [],
        resources: [],
      },
    });

    expect(screen.getByText('users')).not.toBeNull();
    expect(screen.queryByText('Старые модули')).toBeNull();
    fireEvent.contextMenu(screen.getByText('Коннекторы и Интеграции'));

    expect(await screen.findByText('Создать коннектор/интеграцию')).not.toBeNull();
    expect(screen.queryByText('Добавить группу')).toBeNull();
  });

  it('держит root-листья Explorer в алфавитном порядке', () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: {
          zeta: { title: 'zeta', path: '', constructor: '' },
          alpha: { title: 'alpha', path: '', constructor: '' },
        },
        scenarios: [],
        test_data_constructor: [],
        fuzzers: [],
        imports: [],
      },
    });
    renderTree({
      tree,
      folders: { pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] },
    });

    const alpha = screen.getByText('alpha');
    const zeta = screen.getByText('zeta');
    expect(alpha.compareDocumentPosition(zeta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('подсвечивает папку и раздел без открытия вкладки редактора', async () => {
    const onSelectTab = vi.fn();
    renderTree({ onSelectTab });

    fireEvent.click(screen.getByText('Авторизация'));
    await waitFor(() => {
      expect(
        screen
          .getByText('Авторизация')
          .closest('[role="treeitem"]')
          ?.classList.contains('ant-tree-treenode-selected'),
      ).toBe(true);
    });
    expect(onSelectTab).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Сценарии'));
    await waitFor(() => {
      expect(
        screen
          .getByText('Сценарии')
          .closest('[role="treeitem"]')
          ?.classList.contains('ant-tree-treenode-selected'),
      ).toBe(true);
    });
    expect(onSelectTab).not.toHaveBeenCalled();
  });

  it('в ПКМ группы открывает модалку создания страницы', async () => {
    const onCreatePage = vi.fn(() => true);
    const onMoveFolderMember = vi.fn();
    renderTree({ onCreatePage, onMoveFolderMember });

    fireEvent.contextMenu(screen.getByText('Авторизация'));

    expect(await screen.findByText('Добавить модель страницы')).not.toBeNull();
    expect(screen.queryByText('Добавить группу')).toBeNull();

    fireEvent.click(screen.getByText('Добавить модель страницы'));

    const idInput = await screen.findByPlaceholderText('login_page');
    expect(idInput).not.toBeNull();
    fireEvent.change(idInput, { target: { value: 'profile' } });
    fireEvent.keyDown(idInput, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });

    await waitFor(() => {
      expect(onCreatePage).toHaveBeenCalledWith('profile', '');
      expect(onMoveFolderMember).toHaveBeenCalledWith('pages', 'profile', 'folder_1');
    });
  });

  it('открывает модалку создания сценария из папки', async () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: {
          login: { title: 'login', path: '', constructor: '' },
        },
        scenarios: [{ scenario_name: 'juice', steps: [] }],
        test_data_constructor: [],
        fuzzers: [],
        imports: [],
      },
    });
    renderTree({
      tree,
      folders: {
        pages: [{ id: 'folder_1', title: 'Модели JuiceShop', members: ['login'] }],
        scenarios: [{ id: 'folder_1', title: 'Сценарии JuiceShop', members: ['juice'] }],
        modules: [],
        fuzzers: [],
        resources: [],
      },
    });

    fireEvent.contextMenu(screen.getByText('Сценарии JuiceShop'));
    fireEvent.click(await screen.findByText('Добавить сценарий'));

    const titleInput = await screen.findByPlaceholderText('Дымовой тест');
    expect(titleInput).not.toBeNull();
  });

  it('перетаскивает файл в группу того же раздела', () => {
    const onDropTreeMember = vi.fn();
    renderTree({
      folders: {
        pages: [{ id: 'folder_1', title: 'Авторизация', members: [] }],
        scenarios: [],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      onDropTreeMember,
    });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };

    const pageNode = screen.getByText('login').closest('[role="treeitem"]');
    const folderNode = screen.getByText('Авторизация').closest('[role="treeitem"]');
    if (!pageNode || !folderNode) {
      throw new Error('Не найдены узлы дерева для drag-and-drop');
    }
    fireEvent.dragStart(pageNode, { dataTransfer: transfer });
    fireEvent.dragEnter(folderNode, { dataTransfer: transfer });
    fireEvent.dragOver(folderNode, { dataTransfer: transfer });
    fireEvent.drop(folderNode, { dataTransfer: transfer });

    expect(onDropTreeMember).toHaveBeenCalledWith('pages', 'login', { folderId: 'folder_1' });
  });

  it('принимает drop в область раскрытой папки', () => {
    const onDropTreeMember = vi.fn();
    renderTree({
      folders: {
        pages: [{ id: 'folder_1', title: 'Авторизация', members: [] }],
        scenarios: [],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      onDropTreeMember,
    });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };

    fireEvent.click(document.querySelector('.pk-studio-tree-folder-switcher')!);
    const pageNode = screen.getByText('login').closest('[role="treeitem"]');
    if (!pageNode) {
      throw new Error('Не найден лист для переноса в область папки');
    }
    fireEvent.dragStart(pageNode, { dataTransfer: transfer });
    const dropZone = document
      .querySelector('.pk-studio-tree-folder-drop-zone')
      ?.closest('[role="treeitem"]');
    if (!dropZone) {
      throw new Error('Не найдена внутренняя область папки');
    }
    fireEvent.dragEnter(dropZone, { dataTransfer: transfer });
    fireEvent.dragOver(dropZone, { dataTransfer: transfer });
    fireEvent.drop(dropZone, { dataTransfer: transfer });

    expect(onDropTreeMember).toHaveBeenCalledWith('pages', 'login', { folderId: 'folder_1' });
  });

  it('переносит сценарий в папку при drop на её сценарий', () => {
    const onDropTreeMember = vi.fn();
    const tree = collectStudioNodes({
      ...formData,
      test_suites: {
        ...formData.test_suites,
        scenarios: [
          { scenario_name: 'folder_item', steps: [] },
          { scenario_name: 'root_item', steps: [] },
        ],
      },
    });
    renderTree({
      tree,
      folders: {
        pages: [],
        scenarios: [{ id: 'folder_1', title: 'Scenario Folder', members: ['folder_item'] }],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      onDropTreeMember,
    });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const folderNode = screen.getByText('Scenario Folder').closest('[role="treeitem"]');
    const folderSwitcher = folderNode?.querySelector('.pk-studio-tree-folder-switcher');
    if (!folderSwitcher) {
      throw new Error('Не найден переключатель папки сценариев');
    }
    fireEvent.click(folderSwitcher);

    const source = screen.getByText('root_item');
    const target = screen.getByText('folder_item');
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    expect(onDropTreeMember).toHaveBeenCalledWith(
      'scenarios',
      'root_item',
      expect.objectContaining({ folderId: 'folder_1' }),
    );
  });

  it('возвращает сценарий из папки в корень по заголовку раздела', () => {
    const onDropTreeMember = vi.fn();
    const tree = collectStudioNodes({
      ...formData,
      test_suites: {
        ...formData.test_suites,
        scenarios: [{ scenario_name: 'folder_item', steps: [] }],
      },
    });
    renderTree({
      tree,
      folders: {
        pages: [],
        scenarios: [{ id: 'folder_1', title: 'Scenario Folder', members: ['folder_item'] }],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      onDropTreeMember,
    });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const folderNode = screen.getByText('Scenario Folder').closest('[role="treeitem"]');
    const folderSwitcher = folderNode?.querySelector('.pk-studio-tree-folder-switcher');
    if (!folderSwitcher) {
      throw new Error('Не найден переключатель папки сценариев');
    }
    fireEvent.click(folderSwitcher);

    fireEvent.dragStart(screen.getByText('folder_item'), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByText('Сценарии'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByText('Сценарии'), { dataTransfer: transfer });

    expect(onDropTreeMember).toHaveBeenCalledWith('scenarios', 'folder_item', {});
  });

  it('не позволяет вручную менять порядок через соседний root-элемент', () => {
    const onDropTreeMember = vi.fn();
    const tree = collectStudioNodes({
      ...formData,
      test_suites: {
        ...formData.test_suites,
        scenarios: [
          { scenario_name: 'folder_item', steps: [] },
          { scenario_name: 'root_item', steps: [] },
        ],
      },
    });
    renderTree({
      tree,
      folders: {
        pages: [],
        scenarios: [{ id: 'folder_1', title: 'Scenario Folder', members: ['folder_item'] }],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      onDropTreeMember,
    });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const folderSwitcher = document.querySelector('.pk-studio-tree-folder-switcher');
    if (!folderSwitcher) {
      throw new Error('Не найден переключатель папки сценариев');
    }
    fireEvent.click(folderSwitcher);

    const source = screen.getByText('folder_item').closest('.pk-studio-tree-leaf-hit');
    const target = screen.getByText('root_item').closest('.pk-studio-tree-leaf-hit');
    if (!source || !target) {
      throw new Error('Не найдены полные области строк для переноса');
    }
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 100 });
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 100 });

    expect(onDropTreeMember).not.toHaveBeenCalled();
  });

  it('подтверждает удаление выбранного файла по Delete', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({
      destroy: vi.fn(),
      update: vi.fn(),
    }));
    renderTree({ selectedTabId: 'page:login' });

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Удалить модель страницы' }),
    );
    confirm.mockRestore();
  });

  it('Delete удаляет выделенный в дереве узел, а не активную вкладку', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({
      destroy: vi.fn(),
      update: vi.fn(),
    }));
    const tree = collectStudioNodes({
      test_suites: {
        pages: {
          alpha: { title: 'alpha', path: '', constructor: '' },
          zeta: { title: 'zeta', path: '', constructor: '' },
        },
        scenarios: [],
        test_data_constructor: [],
        fuzzers: [],
        imports: [],
      },
    });
    renderTree({
      tree,
      folders: { pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] },
      selectedTabId: 'page:zeta',
    });

    fireEvent.click(screen.getByText('alpha'));
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Удалить модель страницы',
        content: expect.stringContaining('alpha'),
      }),
    );
    expect(confirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('zeta'),
      }),
    );
    confirm.mockRestore();
  });

  it('Delete удаляет выделенную папку Explorer', () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({
      destroy: vi.fn(),
      update: vi.fn(),
    }));
    renderTree({ selectedTabId: 'page:login' });

    fireEvent.click(screen.getByText('Авторизация'));
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Удалить группу и содержимое' }),
    );
    confirm.mockRestore();
  });

  it('оставляет переключатель у пустой группы', () => {
    renderTree({
      folders: {
        pages: [{ id: 'folder_empty', title: 'Пустая группа', members: [] }],
        scenarios: [],
        modules: [],
        fuzzers: [],
        resources: [],
      },
    });

    expect(document.querySelector('.pk-studio-tree-folder-switcher')).not.toBeNull();
  });

  it('отображает иконки элементов сущностей в дереве', () => {
    const tree = collectStudioNodes({
      ...formData,
      test_suites: {
        ...formData.test_suites,
        scenarios: [{ scenario_name: 'smoke', steps: [] }],
        test_data_constructor: [
          {
            id: 'auth_data',
            label: 'auth_data',
            module_type: 'Модуль работы с данными',
          },
        ],
        fuzzers: [
          {
            id: 'search_q',
            message: { source: 'template', url: 'http://juice-shop/search' },
            location: { kind: 'query_param', name: 'q' },
            corpus: 'intent_boundary',
          },
        ],
        imports: [{ path: 'resources/urls.txt', kind: 'data_file', as: 'urls' }],
      },
    });
    renderTree({ tree });
    fireEvent.click(document.querySelector('.pk-studio-tree-folder-switcher')!);

    expect(screen.getByText('auth_data')).not.toBeNull();
    expect(document.querySelector('.pk-studio-tree-model-img')).not.toBeNull();
    expect(document.querySelector('.pk-studio-tree-module-img')).not.toBeNull();
    expect(document.querySelector('.pk-studio-tree-fuzzer-img')).not.toBeNull();
    expect(document.querySelector('.pk-studio-tree-resource-img')).not.toBeNull();
    expect(document.querySelector('.pk-studio-tree-scenario-img')).not.toBeNull();
    expect(document.querySelectorAll('.pk-studio-tree-entity')).toHaveLength(2);
    expect(document.querySelectorAll('.pk-studio-tree-entity.pk-studio-tree-scenario')).toHaveLength(0);
  });

  it('возвращает файл из группы в корень раздела', () => {
    const onDropTreeMember = vi.fn();
    renderTree({ onDropTreeMember });
    const transfer = {
      dropEffect: 'move',
      effectAllowed: 'all',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    };

    fireEvent.click(document.querySelector('.pk-studio-tree-folder-switcher')!);
    const pageNode = screen.getByText('login').closest('[role="treeitem"]');
    const groupNode = screen.getByText('Модели страниц').closest('[role="treeitem"]');
    if (!pageNode || !groupNode) {
      throw new Error('Не найдены узлы дерева для возврата в корень');
    }
    fireEvent.dragStart(pageNode, { dataTransfer: transfer });
    fireEvent.dragEnter(groupNode, { dataTransfer: transfer });
    fireEvent.dragOver(groupNode, { dataTransfer: transfer });
    fireEvent.drop(groupNode, { dataTransfer: transfer });

    expect(onDropTreeMember).toHaveBeenCalledWith('pages', 'login', {});
  });
});
