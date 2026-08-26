/**
 * Explorer folder guide heights (S3776).
 */

const GUIDE_Y = 14.5;

type ClearFolder = (folder: HTMLElement) => void;
type SectionKeyFor = (
  treeElement: HTMLElement,
  target: EventTarget | null,
) => string | undefined;

function folderDescendants(treeItems: HTMLElement[], folder: HTMLElement): HTMLElement[] {
  const folderIndex = treeItems.indexOf(folder);
  const folderIndentCount = folder.querySelectorAll('.ant-tree-indent-unit').length;
  const descendants: HTMLElement[] = [];
  for (let i = folderIndex + 1; i < treeItems.length; i++) {
    const item = treeItems[i]!;
    if (item.classList.contains('pk-studio-tree-section-node')) {
      break;
    }
    const itemIndentCount = item.querySelectorAll('.ant-tree-indent-unit').length;
    if (itemIndentCount <= folderIndentCount) {
      break;
    }
    if (
      item.getAttribute('aria-hidden') !== 'true' &&
      !item.classList.contains('pk-studio-tree-folder-drop-zone-node')
    ) {
      descendants.push(item);
    }
  }
  return descendants;
}

export function syncFolderGuides(
  treeElement: HTMLElement,
  treeItems: HTMLElement[],
  currentHoveredKey: string | undefined,
  isAnimating: boolean,
  clearFolderGuide: ClearFolder,
  sectionKeyForElement: SectionKeyFor,
): void {
  const folders = treeItems.filter((item) =>
    item.classList.contains('pk-studio-tree-folder-node'),
  );

  for (const folder of folders) {
    const folderSectionKey = sectionKeyForElement(treeElement, folder);

    if (folder.getAttribute('aria-expanded') !== 'true') {
      clearFolderGuide(folder);
      continue;
    }

    const descendants = folderDescendants(treeItems, folder);
    if (descendants.length === 0) {
      clearFolderGuide(folder);
      continue;
    }

    const folderRect = folder.getBoundingClientRect();
    const folderBottom = Math.max(
      ...descendants.map((item) => item.getBoundingClientRect().bottom),
    );
    const height = folderBottom - (folderRect.top + GUIDE_Y);
    if (height <= 0) {
      continue;
    }

    folder.style.setProperty('--pk-folder-guide-height', `${String(height)}px`);
    folder.classList.add('pk-studio-tree-folder-guide');

    if (folderSectionKey && folderSectionKey === currentHoveredKey && !isAnimating) {
      folder.classList.add('pk-studio-tree-folder-guide-visible');
    } else {
      folder.classList.remove('pk-studio-tree-folder-guide-visible');
    }
  }
}
