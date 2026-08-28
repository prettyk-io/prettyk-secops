/**
 * WZ-3: Beam Renderer — плазменный луч фаззинга I(t).
 *
 * Сигмоида ramp/dim + пульс + ядро/ореол + волновое смещение.
 * Спецификация: docs/research/2026-08-27-studio-warzone-rewind-specification.md §2.2–2.3
 */

/** Параметры луча — настраиваются через константы, не хардкод в формулах. */
export const BEAM = {
  deltaTRamp: 0.15,       // время разогрева плазменного канала (сек)
  deltaTDim: 0.25,        // время плавного угасания (сек)
  amplitudePulse: 0.08,   // амплитуда микрофлуктуации потока
  freqPulse: 12,          // частота пульсации пакетов (Гц)
  sigmaCore: 2.0,         // радиус плазменного ядра (px)
  sigmaHalo: 8.5,         // радиус ореола (px)
  colorCore: '#FFFFFF',   // цвет ядра (белая плазма)
  colorHaloCyan: '#38BDF8',   // Cyan DAST-ореол
  colorHaloRed: '#F43F5E',    // Red High/Critical ореол
  waveAmplitude: 3.0,     // амплитуда волнового смещения (px)
  waveFreq: 4.5,          // пространственная частота волны (rad/unit)
} as const;

/** Источник и цель луча в мировых координатах. */
export interface BeamEndpoint {
  x: number;
  y: number;
}

/** Параметры одного луча фаззинга. */
export interface BeamState {
  src: BeamEndpoint;
  tgt: BeamEndpoint;
  tStart: number;       // время старта (относительное, сек)
  tEnd: number;         // время окончания
  severity: 'cyan' | 'red';  // цвет ореола
}

/** Позиция на луче. */
export interface BeamSample {
  x: number;
  y: number;
  intensity: number;     // I(t) в этой точке
}

/**
 * Гладкая сигмоида: 0 при edge0, 1 при edge1.
 * smoothstep(0, 1, x) = 3x² - 2x³.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Интенсивность луча I(t) в момент времени t.
 * Формула из §2.2:
 *   t < tStart                         → 0
 *   tStart ≤ t < tStart + ramp         → smoothstep(0, 1, ...)
 *   ramp ≤ t ≤ tEnd - dim              → 1 + A*sin(...)
 *   tEnd - dim < t ≤ tEnd              → smoothstep(1, 0, ...)
 *   t > tEnd                           → 0
 */
export function beamIntensity(
  t: number,
  tStart: number,
  tEnd: number,
  ramp = BEAM.deltaTRamp,
  dim = BEAM.deltaTDim,
  amp = BEAM.amplitudePulse,
  freq = BEAM.freqPulse,
): number {
  const { deltaTRamp, deltaTDim, amplitudePulse, freqPulse } = BEAM;

  if (t < tStart) return 0;
  if (t < tStart + deltaTRamp) {
    return smoothstep(0, 1, (t - tStart) / deltaTRamp);
  }
  if (t <= tEnd - deltaTDim) {
    return 1.0 + amplitudePulse * Math.sin(2 * Math.PI * freqPulse * (t - tStart));
  }
  if (t <= tEnd) {
    return smoothstep(1, 0, (t - (tEnd - deltaTDim)) / deltaTDim);
  }
  return 0;
}

/**
 * Радиальное распределение плазменного ядра и ореола C(r, t).
 * §2.3: C(r, t) = I(t) * (α_core * exp(-r²/(2σ_core²)) + α_halo * exp(-r²/(2σ_halo²)))
 */
export function beamRadialGlow(
  r: number,   // расстояние от осевой линии в px
  intensity: number,
  coreSigma = BEAM.sigmaCore,
  haloSigma = BEAM.sigmaHalo,
): { core: number; halo: number } {
  const core = 1.0 * Math.exp(-(r * r) / (2 * coreSigma * coreSigma));
  const halo = 0.6 * Math.exp(-(r * r) / (2 * haloSigma * haloSigma));
  return {
    core: intensity * core,
    halo: intensity * halo,
  };
}

/**
 * Волновое смещение точки на луче — эффект нестабильности плазмы.
 * §2.3: P(u, t) = (1-u)*Psrc + u*Ptgt + N_perp * sin(k_w*u - ω*t) * A_w * I(t)
 */
export function beamWaveOffset(
  u: number,      // позиция на луче [0, 1]
  t: number,      // время
  intensity: number,
  src: BeamEndpoint,
  tgt: BeamEndpoint,
  amplitude = BEAM.waveAmplitude,
  freq = BEAM.waveFreq,
): BeamSample {
  // Линейная интерполяция вдоль луча
  const x = (1 - u) * src.x + u * tgt.x;
  const y = (1 - u) * src.y + u * tgt.y;

  // Перпендикуляр к лучу
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;  // нормаль (перпендикуляр)
  const ny = dx / len;

  // Волновое смещение
  const wave = Math.sin(freq * u - 2 * Math.PI * BEAM.freqPulse * t) * amplitude * intensity;

  return {
    x: x + nx * wave,
    y: y + ny * wave,
    intensity,
  };
}

/**
 * Сэмплировать N точек вдоль луча в момент времени t.
 * Возвращает массив {x, y, intensity} для отрисовки.
 */
export function sampleBeam(
  beam: BeamState,
  t: number,
  numSamples = 32,
): BeamSample[] {
  const intensity = beamIntensity(t, beam.tStart, beam.tEnd);
  if (intensity <= 0.001) return [];

  const samples: BeamSample[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const u = i / numSamples;
    samples.push(beamWaveOffset(u, t, intensity, beam.src, beam.tgt));
  }
  return samples;
}

/**
 * Рендерить луч на Canvas 2D.
 */
export function renderBeam(
  ctx: CanvasRenderingContext2D,
  beam: BeamState,
  t: number,
): void {
  const samples = sampleBeam(beam, t);
  if (samples.length < 2) return;

  const intensity = beamIntensity(t, beam.tStart, beam.tEnd);
  const haloColor = beam.severity === 'red' ? BEAM.colorHaloRed : BEAM.colorHaloCyan;

  // Ореол (широкая линия)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++) {
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  }
  ctx.strokeStyle = haloColor;
  ctx.lineWidth = BEAM.sigmaHalo * 2 * intensity;
  ctx.globalAlpha = 0.3 * intensity;
  ctx.stroke();

  // Ядро (тонкая яркая линия поверх)
  ctx.beginPath();
  ctx.moveTo(samples[0]!.x, samples[0]!.y);
  for (let i = 1; i < samples.length; i++) {
    ctx.lineTo(samples[i]!.x, samples[i]!.y);
  }
  ctx.strokeStyle = BEAM.colorCore;
  ctx.lineWidth = BEAM.sigmaCore * 2 * intensity;
  ctx.globalAlpha = 0.9 * intensity;
  ctx.stroke();
  ctx.restore();
}