import type { WeatherMode } from './types';

export interface WeatherAtmosphere {
  mode: WeatherMode;
  label: string;
  skyHex: number;
  fogHex: number;
  fogDensity: number;
  sunHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  oceanHex: number;
  exposure: number;
  asphaltRoughness: number;
  rainIntensity: number; // 0..1
  cloudCover: number; // 0..1
  windStrength: number; // 0..1
  sunDiscOpacity: number;
}

export const WEATHER_CYCLE_ORDER: readonly WeatherMode[] = ['sunny', 'overcast', 'monsoon'];

export const WEATHER_PRESETS: Record<WeatherMode, WeatherAtmosphere> = {
  sunny: {
    mode: 'sunny',
    label: 'Colombo Sunny',
    skyHex: 0xe8c49e,
    fogHex: 0xe8c49e,
    fogDensity: 0.0046,
    sunHex: 0xffdfb0,
    sunIntensity: 2.35,
    hemiSkyHex: 0x8ec5fc,
    hemiGroundHex: 0x8a6d4b,
    hemiIntensity: 0.98,
    oceanHex: 0x16688a,
    exposure: 1.12,
    asphaltRoughness: 0.85,
    rainIntensity: 0,
    cloudCover: 0.12,
    windStrength: 0.22,
    sunDiscOpacity: 1.0,
  },
  overcast: {
    mode: 'overcast',
    label: 'Tropical Overcast',
    skyHex: 0x9aa9b8,
    fogHex: 0x93a3b3,
    fogDensity: 0.0068,
    sunHex: 0xd8e2ec,
    sunIntensity: 1.15,
    hemiSkyHex: 0xa4b5c6,
    hemiGroundHex: 0x5c6068,
    hemiIntensity: 1.05,
    oceanHex: 0x204d63,
    exposure: 0.98,
    asphaltRoughness: 0.62,
    rainIntensity: 0.06,
    cloudCover: 0.72,
    windStrength: 0.52,
    sunDiscOpacity: 0.22,
  },
  monsoon: {
    mode: 'monsoon',
    label: 'Monsoon Rain',
    skyHex: 0x4b5c6e,
    fogHex: 0x495b6c,
    fogDensity: 0.0102,
    sunHex: 0x9cb4cc,
    sunIntensity: 0.72,
    hemiSkyHex: 0x6f849a,
    hemiGroundHex: 0x333c46,
    hemiIntensity: 0.86,
    oceanHex: 0x153647,
    exposure: 0.9,
    asphaltRoughness: 0.22,
    rainIntensity: 1.0,
    cloudCover: 0.95,
    windStrength: 0.94,
    sunDiscOpacity: 0.0,
  },
};

export interface WeatherState {
  mode: WeatherMode;
  previousMode: WeatherMode;
  transition: number; // 0..1 lerp from previousMode to mode
  cycleTimer: number;
  cycleDuration: number;
  autoCycle: boolean;
  lightningFlash: number; // 0..1 flash pulse
  lightningCooldown: number;
}

export function createInitialWeatherState(
  startMode: WeatherMode = 'sunny',
  cycleDuration = 42,
): WeatherState {
  return {
    mode: startMode,
    previousMode: startMode,
    transition: 1,
    cycleTimer: 0,
    cycleDuration,
    autoCycle: true,
    lightningFlash: 0,
    lightningCooldown: 6.5,
  };
}

export function getNextWeatherMode(current: WeatherMode): WeatherMode {
  const idx = WEATHER_CYCLE_ORDER.indexOf(current);
  return WEATHER_CYCLE_ORDER[(idx + 1) % WEATHER_CYCLE_ORDER.length];
}

export function setWeatherMode(
  state: WeatherState,
  targetMode: WeatherMode,
  keepAutoCycle?: boolean,
): WeatherState {
  const autoCycle = keepAutoCycle ?? state.autoCycle;
  if (targetMode === state.mode) {
    return { ...state, autoCycle, cycleTimer: 0 };
  }
  return {
    ...state,
    previousMode: state.mode,
    mode: targetMode,
    transition: 0,
    cycleTimer: 0,
    autoCycle,
    lightningCooldown: targetMode === 'monsoon' ? 4.5 : 8,
  };
}

export function stepWeatherState(
  prev: WeatherState,
  dt: number,
  randomVal = 0.5,
): { state: WeatherState; thunderTriggered: boolean; transitionedMode: WeatherMode | null } {
  let mode = prev.mode;
  let previousMode = prev.previousMode;
  let transition = Math.min(1, prev.transition + dt * 0.45);
  let cycleTimer = prev.cycleTimer;
  let transitionedMode: WeatherMode | null = null;

  if (prev.autoCycle) {
    cycleTimer += dt;
    if (cycleTimer >= prev.cycleDuration) {
      cycleTimer = 0;
      previousMode = mode;
      mode = getNextWeatherMode(mode);
      transition = 0;
      transitionedMode = mode;
    }
  }

  let lightningFlash = Math.max(0, prev.lightningFlash - dt * 3.4);
  let lightningCooldown = prev.lightningCooldown;
  let thunderTriggered = false;

  if (mode === 'monsoon' && transition > 0.35) {
    lightningCooldown -= dt;
    if (lightningCooldown <= 0) {
      lightningFlash = 1.0;
      lightningCooldown = 7 + randomVal * 7;
      thunderTriggered = true;
    }
  }

  return {
    state: {
      mode,
      previousMode,
      transition,
      cycleTimer,
      cycleDuration: prev.cycleDuration,
      autoCycle: prev.autoCycle,
      lightningFlash,
      lightningCooldown,
    },
    thunderTriggered,
    transitionedMode,
  };
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: number, hexB: number, t: number): number {
  const ar = (hexA >> 16) & 255;
  const ag = (hexA >> 8) & 255;
  const ab = hexA & 255;
  const br = (hexB >> 16) & 255;
  const bg = (hexB >> 8) & 255;
  const bb = hexB & 255;
  const r = Math.round(lerpNum(ar, br, t));
  const g = Math.round(lerpNum(ag, bg, t));
  const b = Math.round(lerpNum(ab, bb, t));
  return (r << 16) | (g << 8) | b;
}

export function getBlendedAtmosphere(state: WeatherState): WeatherAtmosphere {
  const from = WEATHER_PRESETS[state.previousMode];
  const to = WEATHER_PRESETS[state.mode];
  const t = Math.max(0, Math.min(1, state.transition));

  return {
    mode: state.mode,
    label: to.label,
    skyHex: lerpHex(from.skyHex, to.skyHex, t),
    fogHex: lerpHex(from.fogHex, to.fogHex, t),
    fogDensity: lerpNum(from.fogDensity, to.fogDensity, t),
    sunHex: lerpHex(from.sunHex, to.sunHex, t),
    sunIntensity: lerpNum(from.sunIntensity, to.sunIntensity, t),
    hemiSkyHex: lerpHex(from.hemiSkyHex, to.hemiSkyHex, t),
    hemiGroundHex: lerpHex(from.hemiGroundHex, to.hemiGroundHex, t),
    hemiIntensity: lerpNum(from.hemiIntensity, to.hemiIntensity, t),
    oceanHex: lerpHex(from.oceanHex, to.oceanHex, t),
    exposure: lerpNum(from.exposure, to.exposure, t),
    asphaltRoughness: lerpNum(from.asphaltRoughness, to.asphaltRoughness, t),
    rainIntensity: lerpNum(from.rainIntensity, to.rainIntensity, t),
    cloudCover: lerpNum(from.cloudCover, to.cloudCover, t),
    windStrength: lerpNum(from.windStrength, to.windStrength, t),
    sunDiscOpacity: lerpNum(from.sunDiscOpacity, to.sunDiscOpacity, t),
  };
}
