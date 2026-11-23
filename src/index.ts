import { registerGmpQuotaListeners } from './game/mapsService';
import { GtaSriLankaEngine } from './game/engine';
import { GameHud } from './game/hud';
import { WeatherCanvasOverlay } from './game/weatherOverlay';

// Register Tier 1 Google Maps Platform Demo Key quota listeners immediately at module root
registerGmpQuotaListeners();

function bootstrap(): void {
  const canvasMount = document.getElementById('canvas-mount');
  const weatherCanvas = document.getElementById('weather-overlay-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvasMount || !uiRoot) return;

  const mainWeatherOverlay = weatherCanvas ? new WeatherCanvasOverlay(weatherCanvas, false) : null;

  let hud: GameHud | null = null;
  const engine = new GtaSriLankaEngine(
    canvasMount,
    (snapshot) => {
      hud?.update(snapshot);
    },
    (dt, atmo, lightningFlash, indoorDampen) => {
      mainWeatherOverlay?.render(dt, atmo, lightningFlash, indoorDampen);
      hud?.renderMapWeatherOverlay(dt, atmo, lightningFlash);
    },
  );
  hud = new GameHud(uiRoot, engine);

  // Support ?autostart=1 to jump directly into active Colombo gameplay
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    engine.startGame();
  }

  window.addEventListener('beforeunload', () => {
    engine.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
