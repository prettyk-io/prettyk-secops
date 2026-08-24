/**
 * Nested overflow wheel → continue parent form column scroll.
 * Pairs with CSS `overscroll-behavior: contain` on inputs/textareas
 * (stops browser scroll-chaining / «пробуксовку» над полем).
 */

function isScrollPortY(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const oy = style.overflowY;
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

function canScrollY(el: HTMLElement): boolean {
  return isScrollPortY(el) && el.scrollHeight > el.clientHeight + 1;
}

export function attachFormNestedWheelBridge(root: HTMLElement): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.deltaY === 0) {
      return;
    }
    let node: HTMLElement | null = event.target instanceof HTMLElement ? event.target : null;
    while (node && node !== root) {
      if (isScrollPortY(node)) {
        const top = node.scrollTop;
        const max = Math.max(0, node.scrollHeight - node.clientHeight);
        const up = event.deltaY < 0;
        const down = event.deltaY > 0;
        /* Есть куда крутить внутри — native. */
        if (canScrollY(node) && ((up && top > 0) || (down && top < max - 1))) {
          return;
        }
        /* Край / нет overflow (textarea часто scrollport даже пустая) — колонка формы. */
        root.scrollTop += event.deltaY;
        event.preventDefault();
        return;
      }
      node = node.parentElement;
    }
  };

  root.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    root.removeEventListener('wheel', onWheel);
  };
}
