/**
 * Scroll first RJSF/antd form error into view (S3776).
 */
export function scrollFirstFormErrorIntoView(
  root: HTMLElement | null | undefined,
  delayMs = 0,
): void {
  window.setTimeout(() => {
    root
      ?.querySelector('.ant-form-item-has-error')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, delayMs);
}
