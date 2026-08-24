/**
 * Ant Tree switcher chevron (S6478 — out of StudioBlocksTree).
 */
import type { ReactNode } from 'react';
import { sectionForGroupKey } from './studioTreeKeys';

type SwitcherNode = {
  eventKey?: string | number;
  expanded?: boolean;
};

function Chevron({ expanded }: { expanded: boolean }): React.JSX.Element {
  if (expanded) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="pk-studio-tree-chevron-icon"
        aria-hidden
      >
        <path
          d="M4 6.5L8 10.5L12 6.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="pk-studio-tree-chevron-icon"
      aria-hidden
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function renderStudioTreeSwitcherIcon(
  node: SwitcherNode,
  toggleSection: (key: string) => void,
): ReactNode {
  const key = String(node.eventKey);
  const chevronSvg = <Chevron expanded={Boolean(node.expanded)} />;
  if (sectionForGroupKey(key)) {
    return (
      <span
        className="pk-studio-tree-section-switcher"
        aria-hidden
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleSection(key);
        }}
      >
        {chevronSvg}
      </span>
    );
  }
  if (!key.startsWith('folder:')) {
    return <span className="pk-studio-tree-switcher" />;
  }
  return (
    <span className="pk-studio-tree-folder-switcher" aria-hidden>
      {chevronSvg}
    </span>
  );
}
