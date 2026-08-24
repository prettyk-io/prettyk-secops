import { defaultWired } from '../wired/defaultWired';

/** Чистый старт проверки: дефолтный legacy-манифест, без juice-demo и draft. */
export function freshCheckWiredData(): unknown {
  return defaultWired();
}
