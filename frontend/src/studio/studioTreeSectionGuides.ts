/**
 * Explorer section guide heights (S3776).
 */

const GUIDE_Y = 14.5;

type ClearSection = (section: HTMLElement) => void;

export function syncSectionGuides(
  treeItems: HTMLElement[],
  sections: HTMLElement[],
  currentHoveredKey: string | undefined,
  isAnimating: boolean,
  clearSectionGuide: ClearSection,
): boolean {
  let needsRetry = false;
  for (const section of sections) {
    const sectionKey = section
      .querySelector('[data-pk-tree-key]')
      ?.getAttribute('data-pk-tree-key');

    if (section.getAttribute('aria-expanded') !== 'true') {
      clearSectionGuide(section);
      continue;
    }

    const sectionIndex = treeItems.indexOf(section);
    const nextSection = sections[sections.indexOf(section) + 1];
    const nextSectionIndex = nextSection ? treeItems.indexOf(nextSection) : treeItems.length;
    const descendants = treeItems
      .slice(sectionIndex + 1, nextSectionIndex)
      .filter(
        (item) =>
          item.getAttribute('aria-hidden') !== 'true' &&
          !item.classList.contains('pk-studio-tree-folder-drop-zone-node'),
      );
    if (descendants.length === 0) {
      needsRetry = true;
      continue;
    }

    const sectionRect = section.getBoundingClientRect();
    const sectionBottom = Math.max(
      ...descendants.map((item) => item.getBoundingClientRect().bottom),
    );
    const height = sectionBottom - (sectionRect.top + GUIDE_Y);
    if (height <= 0) {
      needsRetry = true;
      continue;
    }

    section.style.setProperty('--pk-section-guide-height', `${String(height)}px`);
    section.classList.add('pk-studio-tree-section-guide');

    if (sectionKey && sectionKey === currentHoveredKey && !isAnimating) {
      section.classList.add('pk-studio-tree-section-guide-visible');
    } else {
      section.classList.remove('pk-studio-tree-section-guide-visible');
    }
  }
  return needsRetry;
}
