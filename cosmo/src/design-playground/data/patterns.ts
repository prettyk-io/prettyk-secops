export interface PatternFamily {
  name: string;
  description: string;
  source: string;
  url: string;
  tags: string[];
}

export const PATTERN_FAMILIES: PatternFamily[] = [
  { name: 'Segmented Control', description: 'Pill segments, animated sliding active indicator, icon badges', source: 'Origin UI', url: 'https://originui.com/segmented-control', tags: ['input', 'selection'] },
  { name: 'Radio Cards', description: 'Selectable card = radio: icon + title + description, glow highlight', source: '21st.dev', url: 'https://21st.dev/s/radio-cards', tags: ['card', 'selection'] },
  { name: 'Checkbox Cards', description: 'Multi-selection with interactive checkmarks, card-grid layout', source: '21st.dev', url: 'https://21st.dev/s/checkbox-cards', tags: ['card', 'selection'] },
  { name: 'Hero Input', description: 'Input + leading icon + clear button + error state + helper text', source: 'Origin UI', url: 'https://originui.com/input', tags: ['input', 'form'] },
  { name: 'Color Picker', description: 'Hex picker, swatch matrix, eyedropper tool, dynamic gradient bar', source: '21st.dev', url: 'https://21st.dev/s/color-picker', tags: ['input', 'color'] },
  { name: 'File Upload Dropzone', description: 'Drag-and-drop dashed area, file chips preview, progress bar', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/input', tags: ['input', 'file'] },
  { name: 'Date Range Picker', description: 'Calendar popover, timestamp range filter, quick presets', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/date-picker', tags: ['input', 'date'] },
  { name: 'Command Palette', description: 'Cmd+K search modal, grouped category items, keyboard navigation', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/command', tags: ['nav', 'search'] },
  { name: 'Hover Card', description: 'Rich popover preview on mouse hover, user/metadata badge', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/hover-card', tags: ['card', 'popover'] },
  { name: 'Slide-Over Sheet', description: 'Slide-over drawer panel (left, right, top, bottom)', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/sheet', tags: ['panel', 'overlay'] },
  { name: 'Breadcrumb Trail', description: 'Chevron-separated path trail, collapsible dropdown ellipsis', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/breadcrumb', tags: ['nav'] },
  { name: 'Pagination Controls', description: 'Page numbering, ellipsis jump, previous/next buttons', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/pagination', tags: ['nav', 'table'] },
  { name: 'Skeleton Loaders', description: 'Card, list, table, and text line shimmer placeholders', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/skeleton', tags: ['feedback', 'loading'] },
  { name: 'Avatar & Badges', description: 'User avatar, fallback initials squircle, live status dot', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/avatar', tags: ['display'] },
  { name: 'Progress Indicators', description: 'Linear bar, circular gauge, indeterminate scan animation', source: 'shadcn/ui', url: 'https://ui.shadcn.com/docs/components/progress', tags: ['feedback', 'loading'] },
];
