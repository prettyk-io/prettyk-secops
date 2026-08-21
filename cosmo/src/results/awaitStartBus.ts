/**
 * Results poll lives under ResultsWorkspace; Studio launch needs the same
 * «ждём running» window for start_failed. Tiny bus avoids lifting the hook.
 */

type AwaitStartHandler = () => void;

let handler: AwaitStartHandler | null = null;

export function bindAwaitStartHandler(next: AwaitStartHandler | null): void {
  handler = next;
}

export function requestAwaitStart(): void {
  handler?.();
}
