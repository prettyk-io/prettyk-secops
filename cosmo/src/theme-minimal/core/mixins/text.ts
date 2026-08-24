import type { CSSObject } from '@mui/material/styles';

import { remToPx } from '../../utils/minimal-shared';

import { createTheme as getTheme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export function textGradient(color?: string): CSSObject {
  return {
    background: `linear-gradient(${color})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    textFillColor: 'transparent',
    color: 'transparent',
  };
}

// ----------------------------------------------------------------------

type MediaFontSize = {
  [key: string]: {
    fontSize: React.CSSProperties['fontSize'];
  };
};

export type MaxLineProps = {
  line: number;
  persistent?: Partial<React.CSSProperties>;
};

function getFontSize(fontSize: React.CSSProperties['fontSize']) {
  return typeof fontSize === 'string' ? remToPx(fontSize) : fontSize;
}

function getLineHeight(lineHeight: React.CSSProperties['lineHeight'], fontSize?: number) {
  if (typeof lineHeight === 'string') {
    return fontSize ? remToPx(lineHeight) / fontSize : 1;
  }
  return lineHeight;
}

function calculateHeight(fontSize: number, lineHeight: number, line: number): number {
  return fontSize * lineHeight * line;
}

export function maxLine({ line, persistent }: MaxLineProps): CSSObject {
  const {
    breakpoints: { keys, up },
  } = getTheme();

  const baseStyles: CSSObject = {
    overflow: 'hidden',
    display: '-webkit-box',
    textOverflow: 'ellipsis',
    WebkitLineClamp: line,
    WebkitBoxOrient: 'vertical',
  };

  if (!persistent) {
    return baseStyles;
  }

  const fontSizeBase = getFontSize(persistent.fontSize);
  const lineHeight = getLineHeight(persistent.lineHeight, fontSizeBase);

  if (!lineHeight || !fontSizeBase) {
    return baseStyles;
  }

  const responsiveStyles = keys.reduce((acc, breakpoint) => {
    const fontSize = getFontSize((persistent as MediaFontSize)[up(breakpoint)]?.fontSize);

    if (fontSize) {
      acc[up(breakpoint)] = {
        height: calculateHeight(fontSize, lineHeight, line),
      };
    }

    return acc;
  }, {} as CSSObject);

  return {
    ...baseStyles,
    height: calculateHeight(fontSizeBase, lineHeight, line),
    ...responsiveStyles,
  };
}