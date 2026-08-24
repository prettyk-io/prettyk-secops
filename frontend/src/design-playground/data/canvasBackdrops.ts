/** CANON: 2 canvas backdrops — Dark & Light. No zany lime/teal/amber clutter. */

export type CanvasBackdropId = 'meta-dark-canvas' | 'meta-light-canvas';

export interface CanvasBackdrop {
  id: CanvasBackdropId;
  name: string;
  label: string;
  description: string;
  isLight?: boolean;
  style: React.CSSProperties;
  stageCardStyle: React.CSSProperties;
  inputBg: string;
  inputBorder: string;
  inputColor: string;
  textColor: string;
  mutedTextColor: string;
}

export const CANVAS_BACKDROPS: CanvasBackdrop[] = [
  {
    id: 'meta-dark-canvas',
    name: 'Obsidian Canvas',
    label: 'Meta Dark',
    description: 'Deep #080D1A studio canvas. Canonical PrettyK dark backdrop.',
    isLight: false,
    style: {
      backgroundColor: '#080D1A',
      color: '#F8FAFC',
    },
    stageCardStyle: {
      backgroundColor: '#0C1220',
      border: '1px solid rgba(56, 189, 248, 0.18)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
    },
    inputBg: '#080D1A',
    inputBorder: 'rgba(56, 189, 248, 0.3)',
    inputColor: '#F8FAFC',
    textColor: '#F8FAFC',
    mutedTextColor: '#94A3B8',
  },
  {
    id: 'meta-light-canvas',
    name: 'Studio White Canvas',
    label: 'Meta Light',
    description: 'Clean #F8FAFC studio backdrop. Light mode accessibility.',
    isLight: true,
    style: {
      backgroundColor: '#F8FAFC',
      color: '#0F172A',
    },
    stageCardStyle: {
      backgroundColor: '#FFFFFF',
      border: '1px solid #CBD5E1',
      boxShadow: '0 2px 12px rgba(15, 23, 42, 0.06)',
    },
    inputBg: '#FFFFFF',
    inputBorder: '#CBD5E1',
    inputColor: '#0F172A',
    textColor: '#0F172A',
    mutedTextColor: '#475569',
  },
];