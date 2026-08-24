import type { Theme, CSSObject } from '@mui/material/styles';
import type { PaletteColorKey, CommonColorsKeys } from '../palette';

import { varAlpha, noRtlFlip } from '../../utils/minimal-shared';

import { dividerClasses } from '@mui/material/Divider';
import { checkboxClasses } from '@mui/material/Checkbox';
import { menuItemClasses } from '@mui/material/MenuItem';
import { autocompleteClasses } from '@mui/material/Autocomplete';

// ----------------------------------------------------------------------

export function menuItemStyles(theme: Theme): CSSObject {
  return {
    ...theme.typography.body2,
    padding: theme.spacing(0.75, 1),
    borderRadius: Number(theme.shape.borderRadius) * 0.75,
    '&:not(:last-of-type)': {
      marginBottom: 4,
    },
    [`&.${menuItemClasses.selected}`]: {
      fontWeight: theme.typography.fontWeightSemiBold,
      backgroundColor: theme.vars.palette.action.selected,
      '&:hover': { backgroundColor: theme.vars.palette.action.hover },
    },
    [`& .${checkboxClasses.root}`]: {
      padding: theme.spacing(0.5),
      marginLeft: theme.spacing(-0.5),
      marginRight: theme.spacing(0.5),
    },
    [`&.${autocompleteClasses.option}[aria-selected="true"]`]: {
      backgroundColor: theme.vars.palette.action.selected,
      '&:hover': { backgroundColor: theme.vars.palette.action.hover },
    },
    [`&+.${dividerClasses.root}`]: {
      margin: theme.spacing(0.5, 0),
    },
  };
}

// ----------------------------------------------------------------------

export type PaperStyleOptions = {
  blur?: number;
  color?: string;
  dropdown?: boolean;
};

/**
 * Base64 encoded SVG shape for paper gradient overlay — Cyber Minimal Cyan.
 */
const cyanShape =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSJ1cmwoI3BhaW50MF9yYWRpYWxfY3lhbl81NTMzOCkiIGZpbGwtb3BhY2l0eT0iMC4xIi8+CjxkZWZzPgo8cmFkaWFsR3JhZGllbnQgaWQ9InBhaW50MF9yYWRpYWxfY3lhbl81NTMzOCIgY3g9IjAiIGN5PSIwIiByPSIxIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgZ3JhZGllbnRUcmFuc2Zvcm09InRyYW5zbGF0ZSgxMjAgMS44MTgxMmUtMDUpIHJvdGF0ZSgtNDUpIHNjYWxlKDEyMy4yNSkiPgo8c3RvcCBzdG9wLWNvbG9yPSIjMzhCREY4Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzM4QkRGOCIgc3RvcC1vcGFjaXR5PSIwIi8+CjwvcmFkaWFsR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==';

/**
 * Base64 encoded SVG shape for paper gradient overlay — Cyber Minimal Violet.
 */
const violetShape =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSJ1cmwoI3BhaW50MF9yYWRpYWxfdmlvbGV0XzU1MzM4KSIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPGRlZnM+CjxyYWRpYWxHcmFkaWVudCBpZD0icGFpbnQwX3JhZGlhbF92aW9sZXRfNTUzMzgiIGN4PSIwIiBjeT0iMCIgcj0iMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiIGdyYWRpZW50VHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAxMjApIHJvdGF0ZSgxMzUpIHNjYWxlKDEyMy4yNSkiPgo8c3RvcCBzdG9wLWNvbG9yPSIjODE4Q0Y4Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzgxOENGOCIgc3RvcC1vcGFjaXR5PSIwIi8+CjwvcmFkaWFsR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+';

export function paperStyles(theme: Theme, options?: PaperStyleOptions): CSSObject {
  const { blur = 20, color, dropdown } = options ?? {};

  return {
    ...theme.mixins.bgGradient({
      images: [`url(${cyanShape})`, `url(${violetShape})`],
      sizes: ['50%', '50%'],
      positions: [noRtlFlip('top right'), noRtlFlip('left bottom')],
    }),
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    backgroundColor: color ?? varAlpha(theme.vars.palette.background.paperChannel, 0.9),
    ...(dropdown && {
      padding: theme.spacing(0.5),
      boxShadow: theme.vars.customShadows.dropdown,
      borderRadius: `${Number(theme.shape.borderRadius) * 1.25}px`,
    }),
  };
}

// ----------------------------------------------------------------------

export type ColorKey = CommonColorsKeys | PaletteColorKey | 'default' | 'inherit';

export type StyleOptions = {
  hover?: boolean | CSSObject;
};

function getHoverStyles(hoverOption: StyleOptions['hover'], hoverBase: CSSObject): CSSObject {
  if (!hoverOption) return {};

  return {
    '&:hover': {
      ...hoverBase,
      ...(typeof hoverOption === 'object' ? hoverOption : {}),
    },
  };
}

export function filledStyles(theme: Theme, colorKey: ColorKey, options?: StyleOptions): CSSObject {
  if (!colorKey) {
    console.warn(
      '[filledStyles] Missing colorKey. Please provide a valid color such as "primary", "black", or "default".'
    );
    return {};
  }

  if (colorKey === 'default') {
    const base: CSSObject = {
      color: theme.vars.palette.grey[800],
      backgroundColor: theme.vars.palette.grey[300],
    };

    const hover: CSSObject = getHoverStyles(options?.hover, {
      backgroundColor: theme.vars.palette.grey[400],
    });

    return { ...base, ...hover };
  }

  if (colorKey === 'inherit') {
    const base: CSSObject = {
      color: theme.vars.palette.common.white,
      backgroundColor: theme.vars.palette.grey[800],
      ...theme.applyStyles('dark', {
        color: theme.vars.palette.grey[800],
        backgroundColor: theme.vars.palette.common.white,
      }),
    };

    const hover: CSSObject = getHoverStyles(options?.hover, {
      backgroundColor: theme.vars.palette.grey[700],
      ...theme.applyStyles('dark', {
        backgroundColor: theme.vars.palette.grey[400],
      }),
    });

    return { ...base, ...hover };
  }

  if (colorKey === 'white' || colorKey === 'black') {
    const base: CSSObject = {
      color: `${theme.vars.palette.common[colorKey === 'white' ? 'black' : 'white']}`,
      backgroundColor: theme.vars.palette.common[colorKey],
    };

    const hover: CSSObject = getHoverStyles(options?.hover, {
      backgroundColor: varAlpha(
        `${theme.vars.palette.common[`${colorKey}Channel`]}`,
        theme.vars.opacity.filled.commonHoverBg
      ),
    });

    return { ...base, ...hover };
  }

  const colorPalette: Record<'base' | 'hover', CSSObject> = {
    base: {
      color: theme.vars.palette[colorKey].contrastText,
      backgroundColor: theme.vars.palette[colorKey].main,
    },
    hover: getHoverStyles(options?.hover, {
      backgroundColor: theme.vars.palette[colorKey].dark,
    }),
  };

  return { ...colorPalette.base, ...colorPalette.hover };
}

export function softStyles(theme: Theme, colorKey: ColorKey, options?: StyleOptions): CSSObject {
  if (!colorKey) {
    console.warn(
      '[softStyles] Missing colorKey. Please provide a valid color such as "primary", "black", or "default".'
    );
    return {};
  }

  if (colorKey === 'default') {
    return {
      ...filledStyles(theme, 'default', options),
      boxShadow: 'none',
    };
  }

  if (colorKey === 'inherit') {
    const base: CSSObject = {
      boxShadow: 'none',
      backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], theme.vars.opacity.soft.bg),
    };

    const hover: CSSObject = getHoverStyles(options?.hover, {
      backgroundColor: varAlpha(
        theme.vars.palette.grey['500Channel'],
        theme.vars.opacity.soft.hoverBg
      ),
    });

    return { ...base, ...hover };
  }

  if (colorKey === 'white' || colorKey === 'black') {
    const base: CSSObject = {
      boxShadow: 'none',
      color: theme.vars.palette.common[colorKey],
      backgroundColor: varAlpha('currentColor', theme.vars.opacity.soft.commonBg),
    };

    const hover: CSSObject = getHoverStyles(options?.hover, {
      backgroundColor: varAlpha('currentColor', theme.vars.opacity.soft.commonHoverBg),
    });

    return { ...base, ...hover };
  }

  const colorPalette: Record<'base' | 'hover', CSSObject> = {
    base: {
      boxShadow: 'none',
      color: theme.vars.palette[colorKey].dark,
      backgroundColor: varAlpha(
        theme.vars.palette[colorKey].mainChannel,
        theme.vars.opacity.soft.bg
      ),
      ...theme.applyStyles('dark', {
        color: theme.vars.palette[colorKey].light,
      }),
    },
    hover: getHoverStyles(options?.hover, {
      backgroundColor: varAlpha(
        theme.vars.palette[colorKey].mainChannel,
        theme.vars.opacity.soft.hoverBg
      ),
    }),
  };

  return { ...colorPalette.base, ...colorPalette.hover };
}