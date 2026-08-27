/**
 * HDO-F1: Вычисление координат клика в viewport с учётом object-contain letterboxing.
 *
 * Картинка масштабируется с сохранением пропорций (object-contain).
 * Поля (letterbox) могут быть сверху/снизу или слева/справа.
 * Клик должен быть внутри реального изображения, не в полях.
 */

export interface ImageDims {
  /** Ширина изображения в естественном разрешении (viewport width). */
  naturalW: number;
  /** Высота изображения в естественном разрешении (viewport height). */
  naturalH: number;
  /** Ширина контейнера (DOM). */
  containerW: number;
  /** Высота контейнера (DOM). */
  containerH: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

/**
 * Преобразует координаты клика в DOM-контейнере в координаты viewport'а
 * с учётом object-contain letterboxing.
 *
 * Возвращает null если клик попал в поле (letterbox), а не в изображение.
 */
export function computeViewportCoords(
  dims: ImageDims,
  clickX: number,
  clickY: number,
): ViewportPoint | null {
  const { naturalW, naturalH, containerW, containerH } = dims;
  if (!naturalW || !naturalH || !containerW || !containerH) return null;

  // object-contain: масштаб с сохранением пропорций
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const displayW = naturalW * scale;
  const displayH = naturalH * scale;

  // Поля letterbox
  const offsetX = (containerW - displayW) / 2;
  const offsetY = (containerH - displayH) / 2;

  // Перевод в координаты viewport
  const viewportX = (clickX - offsetX) / scale;
  const viewportY = (clickY - offsetY) / scale;

  // Гейт: клик не должен уходить за пределы реальной страницы
  if (viewportX < 0 || viewportX > naturalW || viewportY < 0 || viewportY > naturalH) {
    return null;
  }

  return { x: viewportX, y: viewportY };
}

/**
 * Вычисляет координаты клика из DOM-события мыши на <img>.
 * Использует rect элемента и naturalWidth/naturalHeight изображения.
 */
export function computeViewportCoordsFromEvent(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
): ViewportPoint | null {
  const rect = img.getBoundingClientRect();
  return computeViewportCoords(
    {
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      containerW: rect.width,
      containerH: rect.height,
    },
    clientX - rect.left,
    clientY - rect.top,
  );
}