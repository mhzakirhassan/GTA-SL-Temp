import type { HudSnapshot, StructureRecord, WeatherMode, WeaponId } from './types';
import type { GtaSriLankaEngine } from './engine';
import type { WeatherAtmosphere } from './weather';
import { SRI_LANKA_DISTRICTS } from './cityData';
import { ROAD_X_LINES, ROAD_Z_LINES } from './worldMath';
import { ColomboMapExplorer } from './mapsService';
import { WeatherCanvasOverlay } from './weatherOverlay';

const SVG_STAR_FILLED = `<svg class="hud-star-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.2l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.4z" fill="#f5b942" stroke="#16110a" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const SVG_STAR_EMPTY = `<svg class="hud-star-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.2l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.4z" fill="rgba(22,17,10,0.65)" stroke="rgba(248,245,238,0.34)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const SVG_ICON_MAP = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`;
const SVG_ICON_PHONE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
const SVG_ICON_SOUND_ON = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const SVG_ICON_SOUND_OFF = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
const SVG_ICON_PAUSE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

const SVG_WEATHER_SUNNY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffd670" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="7.1" y2="7.1"/><line x1="16.9" y1="16.9" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="7.1" y2="16.9"/><line x1="16.9" y1="7.1" x2="19.1" y2="4.9"/></svg>`;
const SVG_WEATHER_OVERCAST = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
const SVG_WEATHER_MONSOON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><line x1="8" y1="19" x2="7" y2="22"/><line x1="12" y1="19" x2="11" y2="22"/><line x1="16" y1="19" x2="15" y2="22"/></svg>`;

const TITLE_EMBLEM_SVG = `
<svg viewBox="0 0 430 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GTA Sri Lanka">
  <defs>
    <filter id="posterShadow" x="-10%" y="-10%" width="125%" height="130%">
      <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#0b0805" flood-opacity="0.9"/>
    </filter>
  </defs>
  <g transform="translate(362, 34)">
    <path d="M0 -24 C9 -10, 12 4, 0 16 C-12 4, -9 -10, 0 -24 Z" fill="#df4c8c" stroke="#16110a" stroke-width="2.2"/>
    <path d="M-4 12 C-20 4, -26 -8, -14 -14 C-6 -6, -4 4, -4 12 Z" fill="#f5b942" stroke="#16110a" stroke-width="2"/>
    <path d="M4 12 C20 4, 26 -8, 14 -14 C6 -6, 4 4, 4 12 Z" fill="#f5b942" stroke="#16110a" stroke-width="2"/>
    <rect x="-18" y="14" width="36" height="5" rx="2" fill="#ffd670" stroke="#16110a" stroke-width="1.5"/>
  </g>
  <text x="6" y="76" font-family="'Bebas Neue', Impact, sans-serif" font-size="88" letter-spacing="4" fill="#f8f5ee" stroke="#120d08" stroke-width="7" paint-order="stroke fill" filter="url(#posterShadow)">GTA</text>
  <rect x="8" y="88" width="318" height="6" fill="#f5b942" stroke="#120d08" stroke-width="2"/>
  <text x="6" y="152" font-family="'Bebas Neue', Impact, sans-serif" font-size="68" letter-spacing="6" fill="#f5b942" stroke="#120d08" stroke-width="6.5" paint-order="stroke fill" filter="url(#posterShadow)">SRI LANKA</text>
</svg>
`;

export class GameHud {
  private root: HTMLElement;
  private engine: GtaSriLankaEngine;
  private mapExplorer = new ColomboMapExplorer();
  private mapWeatherOverlay: WeatherCanvasOverlay | null = null;
  private mapModalOpen = false;
  private phoneModalOpen = false;
  private quotaBannerShown = false;
  private lastSnap: HudSnapshot | null = null;
  private lastWeaponSig = '';

  // Cached DOM refs
  private quotaBannerEl!: HTMLDivElement;
  private titleOverlayEl!: HTMLDivElement;
  private hudLayerEl!: HTMLDivElement;
  private damageVignetteEl!: HTMLDivElement;
  private missionTitleEl!: HTMLElement;
  private missionTextEl!: HTMLElement;
  private missionDistEl!: HTMLElement;
  private cashEl!: HTMLElement;
  private wantedRowEl!: HTMLElement;
  private hpFillEl!: HTMLElement;
  private hpGhostEl!: HTMLElement;
  private hpValEl!: HTMLElement;
  private armorFillEl!: HTMLElement;
  private armorValEl!: HTMLElement;
  private staminaFillEl!: HTMLElement;
  private districtMetaEl!: HTMLElement;
  private weatherBtnEl!: HTMLButtonElement;
  private muteBtnEl!: HTMLButtonElement;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private gpsLatLngEl!: HTMLElement;
  private gpsSyncEl!: HTMLElement;
  private interactPromptEl!: HTMLElement;
  private interiorBarEl!: HTMLElement;
  private interiorBadgeEl!: HTMLElement;
  private interiorActionBtnEl!: HTMLButtonElement;
  private weaponBarEl!: HTMLElement;
  private speedoCardEl!: HTMLElement;
  private vehicleNameEl!: HTMLElement;
  private speedNumEl!: HTMLElement;
  private bannerToastEl!: HTMLElement;
  private bannerTitleEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;

  // Modals
  private pauseModalEl!: HTMLDivElement;
  private pauseStatsEl!: HTMLElement;
  private gameoverModalEl!: HTMLDivElement;
  private gameoverStatsEl!: HTMLElement;
  private mapsModalEl!: HTMLDivElement;
  private mapsContainerEl!: HTMLDivElement;
  private mapsWeatherCanvasEl!: HTMLCanvasElement;
  private mapsWeatherPillEl!: HTMLButtonElement;
  private mapsFallbackEl!: HTMLDivElement;
  private mapsSidebarListEl!: HTMLDivElement;
  private districtTabsEl!: HTMLDivElement;
  private phoneModalEl!: HTMLDivElement;
  private phoneContentEl!: HTMLDivElement;

  constructor(root: HTMLElement, engine: GtaSriLankaEngine) {
    this.root = root;
    this.engine = engine;
    this.buildDom();
    this.bindGlobalKeys();

    window.addEventListener('gmp-quota-exceeded', () => {
      this.showQuotaBanner();
    });
  }

  private buildDom(): void {
    this.root.innerHTML = `
      <div id="gmp-quota-banner" class="gmp-quota-banner" style="display:none" role="status">
        <span>
          Google Maps Platform quota reached. If you are the app owner, visit
          <a href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors" target="_blank" rel="noopener noreferrer">maps developer site</a>
          for instructions to update your account.
        </span>
        <button type="button" id="btn-dismiss-quota" aria-label="Dismiss Maps quota notice">Dismiss</button>
      </div>

      <!-- Title Screen -->
      <section id="title-overlay" class="title-overlay" aria-label="GTA Sri Lanka Title Screen">
        <div class="title-lockup-col">
          <div class="title-svg-wrap">${TITLE_EMBLEM_SVG}</div>
          <p class="title-tagline">
            Explore 1:1 human-scale Colombo across sandy beaches, park knolls, Beira Lake, and walk-in interiors. Switch weapons, weather Colombo monsoons, drive Tuk-Tuks, and sync live Sri Lankan landmarks from Google Maps.
          </p>
          <div class="title-actions">
            <button type="button" id="btn-play-start" class="cta-primary" data-start="true">Play Colombo</button>
            <button type="button" id="btn-title-map" class="cta-secondary">Sri Lanka Map</button>
          </div>
        </div>
        <div class="title-hint-bar">
          WASD Move · 1–5 Weapons · Click/J Attack · E Interior Action · F Drive · V Weather · B Phone · G Google Map · P Pause
        </div>
      </section>

      <!-- Active Gameplay HUD -->
      <div id="hud-layer" class="hud-layer hidden">
        <div id="damage-vignette" class="damage-vignette"></div>

        <!-- Top-Center Mission Bar -->
        <div class="hud-mission-bar" aria-live="polite">
          <span id="hud-mission-kicker" class="hud-mission-kicker">CONTRACT</span>
          <span id="hud-mission-text" class="hud-mission-text">Drive to Lotus Spire Plaza</span>
          <span id="hud-mission-dist" class="hud-mission-dist">0m</span>
        </div>

        <!-- Top-Right GTA Classic Status Cluster -->
        <div class="hud-top-right">
          <div class="hud-utility-row">
            <button type="button" id="btn-hud-weather" class="hud-weather-btn" tabindex="-1" title="Cycle Colombo Weather [V]" aria-label="Cycle Colombo Weather">
              ${SVG_WEATHER_SUNNY}<span>SUNNY</span>
            </button>
            <button type="button" id="btn-hud-phone" class="hud-icon-btn" tabindex="-1" title="Sri Lanka Phone & Fast Travel [B]" aria-label="Open Sri Lanka Quick-Action Phone">${SVG_ICON_PHONE}</button>
            <button type="button" id="btn-hud-map" class="hud-icon-btn" tabindex="-1" title="Google Maps Explorer [G]" aria-label="Open Google Maps Colombo Explorer">${SVG_ICON_MAP}</button>
            <button type="button" id="btn-hud-mute" class="hud-icon-btn" tabindex="-1" title="Toggle Audio [M]" aria-label="Toggle Sound">${SVG_ICON_SOUND_ON}</button>
            <button type="button" id="btn-hud-pause" class="hud-icon-btn" tabindex="-1" title="Pause [P]" aria-label="Pause Game">${SVG_ICON_PAUSE}</button>
          </div>

          <div id="hud-cash" class="hud-cash-display" aria-label="Cash in Sri Lankan Rupees">LKR 3,200</div>
          <div id="hud-wanted-row" class="hud-wanted-row" aria-label="Wanted level"></div>

          <div class="hud-vitals-box">
            <div class="hud-bar-header">
              <span>HEALTH</span>
              <span id="hud-hp-val" class="hud-bar-value">100</span>
            </div>
            <div class="hud-bar-track">
              <div id="hud-hp-ghost" class="hud-bar-ghost"></div>
              <div id="hud-hp-fill" class="hud-bar-fill"></div>
            </div>
            <div class="hud-bar-header" style="margin-top:2px">
              <span>KEVLAR ARMOR</span>
              <span id="hud-armor-val" class="hud-bar-value">50</span>
            </div>
            <div class="hud-bar-track" style="height:7px">
              <div id="hud-armor-fill" class="hud-bar-fill armor"></div>
            </div>
            <div class="hud-bar-header" style="margin-top:2px">
              <span>STAMINA</span>
              <span>SPRINT</span>
            </div>
            <div class="hud-bar-track" style="height:5px">
              <div id="hud-stamina-fill" class="hud-bar-fill stamina"></div>
            </div>
          </div>

          <div id="hud-district-meta" class="hud-district-meta">Colombo Fort &amp; Lotus</div>
        </div>

        <!-- Bottom-Left Radar Minimap -->
        <div class="hud-minimap-wrap">
          <div class="hud-minimap-frame">
            <canvas id="hud-minimap-canvas" class="hud-minimap-canvas" width="174" height="174"></canvas>
            <span class="hud-minimap-north">N</span>
          </div>
          <div class="hud-gps-readout">
            <span id="hud-gps-ll">6.9271, 79.8565</span>
            <span id="hud-gps-sync">GPS</span>
          </div>
        </div>

        <!-- Walk-In Building Contextual Action Prompt -->
        <div id="hud-interior-bar" class="hud-interior-bar hidden" role="region" aria-label="Building Interior Action">
          <span id="hud-interior-badge" class="hud-interior-badge">INSIDE · ARMORY</span>
          <button type="button" id="btn-interior-action" class="hud-interior-btn" tabindex="-1">[E] Buy Ammo</button>
        </div>

        <!-- Bottom-Center Accessible Weapon Bar -->
        <div id="hud-weapon-bar" class="hud-weapon-bar" role="toolbar" aria-label="Weapon Arsenal"></div>

        <!-- Bottom-Right Speedometer & Vehicle Prompt -->
        <div class="hud-bottom-right">
          <div id="hud-interact-prompt" class="hud-interact-prompt hidden">
            <span class="hud-keycap">F</span><span id="hud-interact-label">Drive Colombo Tuk-Tuk</span>
          </div>
          <div id="hud-speedo-card" class="hud-speedo-card hidden">
            <div id="hud-vehicle-name" class="hud-vehicle-name">Colombo Tuk-Tuk</div>
            <div class="hud-speed-row">
              <span id="hud-speed-num" class="hud-speed-num">0</span>
              <span class="hud-speed-unit">KM/H</span>
            </div>
          </div>
        </div>

        <!-- Mission Passed / Alert Toast -->
        <div id="hud-banner-toast" class="hud-banner-toast" aria-live="polite">
          <div id="hud-banner-title" class="hud-banner-title"></div>
          <div id="hud-banner-sub" class="hud-banner-sub"></div>
        </div>
      </div>

      <!-- Pause Modal -->
      <div id="pause-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="pause-modal-title">
        <div class="modal-card">
          <h2 id="pause-modal-title" class="modal-title">PAUSED</h2>
          <p class="modal-subtitle">Colombo Open World · Simulation Frozen</p>
          <div id="pause-stats-grid" class="modal-stats-grid"></div>
          <div class="modal-actions">
            <button type="button" id="btn-pause-resume" class="modal-btn primary">Resume Colombo</button>
            <button type="button" id="btn-pause-phone" class="modal-btn">Sri Lanka Phone &amp; Supplies [B]</button>
            <button type="button" id="btn-pause-map" class="modal-btn">Google Maps Explorer [G]</button>
            <button type="button" id="btn-pause-restart" class="modal-btn">Restart Run</button>
            <button type="button" id="btn-pause-title" class="modal-btn">Return to Title</button>
          </div>
        </div>
      </div>

      <!-- Game Over (Wasted) Modal -->
      <div id="gameover-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="gameover-modal-title">
        <div class="modal-card">
          <h2 id="gameover-modal-title" class="modal-title wasted">WASTED</h2>
          <p class="modal-subtitle">Colombo General Hospital · Run Summary</p>
          <div id="gameover-stats-grid" class="modal-stats-grid"></div>
          <div class="modal-actions">
            <button type="button" id="btn-gameover-retry" class="modal-btn primary" data-start="true">Try Again</button>
            <button type="button" id="btn-gameover-title" class="modal-btn">Title Screen</button>
          </div>
        </div>
      </div>

      <!-- Sri Lanka Quick-Action Phone & Accessibility Drawer -->
      <div id="phone-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="phone-modal-title">
        <div class="phone-modal-card">
          <div class="phone-header">
            <h2 id="phone-modal-title">COLOMBO PHONE · QUICK ACCESS &amp; SERVICES</h2>
            <button type="button" id="btn-phone-close" class="cta-secondary" style="padding:7px 14px;font-size:17px">Close [B]</button>
          </div>
          <div id="phone-content"></div>
        </div>
      </div>

      <!-- Google Maps Colombo Sector Explorer Modal -->
      <div id="maps-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="maps-modal-title">
        <div class="maps-modal-card">
          <div class="maps-modal-header">
            <h2 id="maps-modal-title">SRI LANKA GOOGLE MAPS · LIVE STRUCTURE SYNC</h2>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" id="btn-maps-weather" class="maps-weather-pill" title="Cycle Colombo weather over the map">WEATHER: SUNNY</button>
              <button type="button" id="btn-maps-close" class="cta-secondary" style="padding:7px 14px;font-size:17px">Close [G]</button>
            </div>
          </div>
          <div id="maps-district-tabs" class="maps-district-tabs"></div>
          <div class="maps-modal-body">
            <div class="maps-stage">
              <div id="google-map-container" class="google-map-container">
                <div id="maps-fallback-overlay" class="maps-fallback-overlay">
                  <strong style="color:#ffd670">Loading Live Google Map of Sri Lanka…</strong>
                  <span>Select any district tab above to load real nearby buildings and set a 3D GPS waypoint.</span>
                </div>
              </div>
              <canvas id="maps-weather-canvas" data-testid="maps-weather-canvas" aria-hidden="true"></canvas>
            </div>
            <div class="maps-places-sidebar">
              <h3 class="maps-sidebar-heading">3D Structures &amp; Walk-In Buildings</h3>
              <div id="maps-sidebar-list" style="display:flex;flex-direction:column;gap:7px"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind refs
    this.quotaBannerEl = this.root.querySelector('#gmp-quota-banner')!;
    this.titleOverlayEl = this.root.querySelector('#title-overlay')!;
    this.hudLayerEl = this.root.querySelector('#hud-layer')!;
    this.damageVignetteEl = this.root.querySelector('#damage-vignette')!;
    this.missionTitleEl = this.root.querySelector('#hud-mission-kicker')!;
    this.missionTextEl = this.root.querySelector('#hud-mission-text')!;
    this.missionDistEl = this.root.querySelector('#hud-mission-dist')!;
    this.cashEl = this.root.querySelector('#hud-cash')!;
    this.wantedRowEl = this.root.querySelector('#hud-wanted-row')!;
    this.hpFillEl = this.root.querySelector('#hud-hp-fill')!;
    this.hpGhostEl = this.root.querySelector('#hud-hp-ghost')!;
    this.hpValEl = this.root.querySelector('#hud-hp-val')!;
    this.armorFillEl = this.root.querySelector('#hud-armor-fill')!;
    this.armorValEl = this.root.querySelector('#hud-armor-val')!;
    this.staminaFillEl = this.root.querySelector('#hud-stamina-fill')!;
    this.districtMetaEl = this.root.querySelector('#hud-district-meta')!;
    this.weatherBtnEl = this.root.querySelector('#btn-hud-weather')!;
    this.muteBtnEl = this.root.querySelector('#btn-hud-mute')!;
    this.minimapCanvas = this.root.querySelector('#hud-minimap-canvas')!;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.gpsLatLngEl = this.root.querySelector('#hud-gps-ll')!;
    this.gpsSyncEl = this.root.querySelector('#hud-gps-sync')!;
    this.interactPromptEl = this.root.querySelector('#hud-interact-prompt')!;
    this.interiorBarEl = this.root.querySelector('#hud-interior-bar')!;
    this.interiorBadgeEl = this.root.querySelector('#hud-interior-badge')!;
    this.interiorActionBtnEl = this.root.querySelector('#btn-interior-action')!;
    this.weaponBarEl = this.root.querySelector('#hud-weapon-bar')!;
    this.speedoCardEl = this.root.querySelector('#hud-speedo-card')!;
    this.vehicleNameEl = this.root.querySelector('#hud-vehicle-name')!;
    this.speedNumEl = this.root.querySelector('#hud-speed-num')!;
    this.bannerToastEl = this.root.querySelector('#hud-banner-toast')!;
    this.bannerTitleEl = this.root.querySelector('#hud-banner-title')!;
    this.bannerSubEl = this.root.querySelector('#hud-banner-sub')!;

    this.pauseModalEl = this.root.querySelector('#pause-modal')!;
    this.pauseStatsEl = this.root.querySelector('#pause-stats-grid')!;
    this.gameoverModalEl = this.root.querySelector('#gameover-modal')!;
    this.gameoverStatsEl = this.root.querySelector('#gameover-stats-grid')!;
    this.mapsModalEl = this.root.querySelector('#maps-modal')!;
    this.mapsContainerEl = this.root.querySelector('#google-map-container')!;
    this.mapsWeatherCanvasEl = this.root.querySelector('#maps-weather-canvas')!;
    this.mapsWeatherPillEl = this.root.querySelector('#btn-maps-weather')!;
    this.mapsFallbackEl = this.root.querySelector('#maps-fallback-overlay')!;
    this.mapsSidebarListEl = this.root.querySelector('#maps-sidebar-list')!;
    this.districtTabsEl = this.root.querySelector('#maps-district-tabs')!;
    this.phoneModalEl = this.root.querySelector('#phone-modal')!;
    this.phoneContentEl = this.root.querySelector('#phone-content')!;

    this.mapWeatherOverlay = new WeatherCanvasOverlay(this.mapsWeatherCanvasEl, true);

    this.renderDistrictTabs();

    // Event listeners (blur HUD buttons after click so WASD focus stays on game)
    this.root.querySelector('#btn-dismiss-quota')!.addEventListener('click', () => {
      this.quotaBannerEl.style.display = 'none';
    });

    this.root.querySelector('#btn-play-start')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.startGame();
    });

    this.root.querySelector('#btn-title-map')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.openMapsModal();
    });

    this.weatherBtnEl.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.cycleWeather();
    });

    this.mapsWeatherPillEl.addEventListener('click', () => {
      this.engine.cycleWeather();
    });

    this.root.querySelector('#btn-hud-phone')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.togglePhoneModal();
    });

    this.root.querySelector('#btn-hud-map')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.toggleMapsModal();
    });

    this.muteBtnEl.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.toggleMute();
    });

    this.root.querySelector('#btn-hud-pause')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.pauseGame();
    });

    this.interiorActionBtnEl.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.interactInsideBuilding();
    });

    this.root.querySelector('#btn-pause-resume')!.addEventListener('click', () => {
      this.engine.resumeGame();
    });
    this.root.querySelector('#btn-pause-phone')!.addEventListener('click', () => {
      this.openPhoneModal();
    });
    this.root.querySelector('#btn-pause-map')!.addEventListener('click', () => {
      this.openMapsModal();
    });
    this.root.querySelector('#btn-pause-restart')!.addEventListener('click', () => {
      this.engine.restartGame();
    });
    this.root.querySelector('#btn-pause-title')!.addEventListener('click', () => {
      this.engine.returnToTitle();
    });

    this.root.querySelector('#btn-gameover-retry')!.addEventListener('click', () => {
      this.engine.restartGame();
    });
    this.root.querySelector('#btn-gameover-title')!.addEventListener('click', () => {
      this.engine.returnToTitle();
    });

    this.root.querySelector('#btn-maps-close')!.addEventListener('click', () => {
      this.closeMapsModal();
    });
    this.root.querySelector('#btn-phone-close')!.addEventListener('click', () => {
      this.closePhoneModal();
    });
  }

  private bindGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') {
        if (this.engine.getPhase() === 'playing' || this.mapModalOpen || this.phoneModalOpen) {
          e.preventDefault();
          this.toggleMapsModal();
        }
      } else if (e.code === 'KeyB') {
        if (this.engine.getPhase() === 'playing' || this.phoneModalOpen || this.mapModalOpen) {
          e.preventDefault();
          this.togglePhoneModal();
        }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mapModalOpen) {
          e.preventDefault();
          this.closeMapsModal();
          return;
        }
        if (this.phoneModalOpen) {
          e.preventDefault();
          this.closePhoneModal();
          return;
        }
        const phase = this.engine.getPhase();
        if (phase === 'playing') {
          e.preventDefault();
          this.engine.pauseGame();
        } else if (phase === 'paused') {
          e.preventDefault();
          this.engine.resumeGame();
        }
      }
    });
  }

  public renderMapWeatherOverlay(
    dt: number,
    atmo: WeatherAtmosphere,
    lightningFlash: number,
  ): void {
    if (!this.mapModalOpen || !this.mapWeatherOverlay) return;
    this.mapWeatherOverlay.render(dt, atmo, lightningFlash, 1);
  }

  private renderDistrictTabs(): void {
    const activeId = this.engine.getDistrict().id;
    this.districtTabsEl.innerHTML = '';
    for (const d of SRI_LANKA_DISTRICTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `district-tab-btn${d.id === activeId ? ' active' : ''}`;
      btn.textContent = d.name;
      btn.addEventListener('click', () => {
        this.engine.loadDistrict(d.id);
        this.renderDistrictTabs();
        void this.refreshGoogleMapView();
      });
      this.districtTabsEl.appendChild(btn);
    }
  }

  private toggleMapsModal(): void {
    if (this.mapModalOpen) {
      this.closeMapsModal();
    } else {
      this.openMapsModal();
    }
  }

  private openMapsModal(): void {
    this.phoneModalOpen = false;
    this.phoneModalEl.classList.add('hidden');
    this.mapModalOpen = true;
    if (this.engine.getPhase() === 'playing') {
      this.engine.pauseGame();
    }
    this.pauseModalEl.classList.add('hidden');
    this.mapsModalEl.classList.remove('hidden');
    this.renderDistrictTabs();
    void this.refreshGoogleMapView();
    // Draw one immediate weather frame over the map right as it opens
    this.mapWeatherOverlay?.render(0.016, this.engine.getCurrentAtmosphere(), this.engine.getLightningFlash(), 1);
  }

  private closeMapsModal(): void {
    this.mapModalOpen = false;
    this.mapsModalEl.classList.add('hidden');
    if (this.engine.getPhase() === 'paused') {
      this.engine.resumeGame();
    }
  }

  private togglePhoneModal(): void {
    if (this.phoneModalOpen) {
      this.closePhoneModal();
    } else {
      this.openPhoneModal();
    }
  }

  private openPhoneModal(): void {
    this.mapModalOpen = false;
    this.mapsModalEl.classList.add('hidden');
    this.phoneModalOpen = true;
    if (this.engine.getPhase() === 'playing') {
      this.engine.pauseGame();
    }
    this.pauseModalEl.classList.add('hidden');
    this.phoneModalEl.classList.remove('hidden');
    this.renderPhoneDrawer();
  }

  private closePhoneModal(): void {
    this.phoneModalOpen = false;
    this.phoneModalEl.classList.add('hidden');
    if (this.engine.getPhase() === 'paused') {
      this.engine.resumeGame();
    }
  }

  private renderPhoneDrawer(): void {
    const snap = this.lastSnap;
    const enterables = this.engine.getStructures().filter((s) => Boolean(s.enterable));
    const mode = snap?.weatherMode ?? 'sunny';
    const autoCycle = snap?.weatherAutoCycle ?? true;
    const acc = snap?.accessibility ?? { autoAim: true, highContrastHud: false, reducedShake: false };

    this.phoneContentEl.innerHTML = `
      <div class="phone-section">
        <h3 class="phone-section-title">Colombo Weather Control</h3>
        <div class="phone-btn-grid">
          <button type="button" class="phone-action-btn ${mode === 'sunny' ? 'active' : ''}" data-weather="sunny">
            <span class="phone-action-label">Colombo Sunny</span>
            <span class="phone-action-meta">Clear coastal sky &amp; sunbeams</span>
          </button>
          <button type="button" class="phone-action-btn ${mode === 'overcast' ? 'active' : ''}" data-weather="overcast">
            <span class="phone-action-label">Tropical Overcast</span>
            <span class="phone-action-meta">Drifting cloud shadows &amp; breeze</span>
          </button>
          <button type="button" class="phone-action-btn ${mode === 'monsoon' ? 'active' : ''}" data-weather="monsoon">
            <span class="phone-action-label">Monsoon Rain</span>
            <span class="phone-action-meta">Rain overlay, wet roads &amp; thunder</span>
          </button>
          <button type="button" class="phone-action-btn ${autoCycle ? 'active' : ''}" data-action="toggle-cycle">
            <span class="phone-action-label">Auto Cycle: ${autoCycle ? 'ON' : 'LOCKED'}</span>
            <span class="phone-action-meta">Cycles Sunny → Overcast → Monsoon</span>
          </button>
        </div>
      </div>

      <div class="phone-section">
        <h3 class="phone-section-title">Fast Travel · Walk-In Enterable Buildings</h3>
        <div class="phone-btn-grid">
          ${enterables
            .map(
              (s) => `
              <button type="button" class="phone-action-btn" data-teleport="${s.id}">
                <span class="phone-action-label">${s.name}</span>
                <span class="phone-action-meta">Walk-In Interior · Open Doorway</span>
              </button>
            `,
            )
            .join('')}
        </div>
      </div>

      <div class="phone-section">
        <h3 class="phone-section-title">Street Deliveries &amp; Tactical Supplies (Balance: LKR ${(snap?.cashLkr ?? 0).toLocaleString()})</h3>
        <div class="phone-btn-grid">
          <button type="button" class="phone-action-btn" data-deliver="tuktuk">
            <span class="phone-action-label">Call Colombo Tuk-Tuk</span>
            <span class="phone-action-meta">Free roadside drop</span>
          </button>
          <button type="button" class="phone-action-btn" data-deliver="sedan">
            <span class="phone-action-label">Call Ceylon GT Coupe</span>
            <span class="phone-action-meta">LKR 500 · High-speed delivery</span>
          </button>
          <button type="button" class="phone-action-btn" data-supply="ammo">
            <span class="phone-action-label">Full Ammo Crate</span>
            <span class="phone-action-meta">LKR 450 · Refills Pistol/SMG/Shotgun</span>
          </button>
          <button type="button" class="phone-action-btn" data-supply="armor">
            <span class="phone-action-label">Kevlar Body Armor</span>
            <span class="phone-action-meta">LKR 400 · +100 Armor</span>
          </button>
          <button type="button" class="phone-action-btn" data-supply="heal">
            <span class="phone-action-label">Ceylon Medkit</span>
            <span class="phone-action-meta">LKR 300 · Full 100 Health</span>
          </button>
          <button type="button" class="phone-action-btn" data-supply="fixer">
            <span class="phone-action-label">Call Colombo Fixer</span>
            <span class="phone-action-meta">LKR 1,200 · Clears Wanted Stars</span>
          </button>
        </div>
      </div>

      <div class="phone-section">
        <h3 class="phone-section-title">Accessibility &amp; Comfort Controls</h3>
        <div class="phone-btn-grid">
          <button type="button" class="phone-action-btn ${acc.autoAim ? 'active' : ''}" data-acc="autoAim">
            <span class="phone-action-label">Auto-Aim Assist: ${acc.autoAim ? 'ON' : 'OFF'}</span>
            <span class="phone-action-meta">Locks firearms onto nearby hostiles</span>
          </button>
          <button type="button" class="phone-action-btn ${acc.highContrastHud ? 'active' : ''}" data-acc="highContrastHud">
            <span class="phone-action-label">High-Contrast HUD: ${acc.highContrastHud ? 'ON' : 'OFF'}</span>
            <span class="phone-action-meta">Crisp solid borders &amp; boosted labels</span>
          </button>
          <button type="button" class="phone-action-btn ${acc.reducedShake ? 'active' : ''}" data-acc="reducedShake">
            <span class="phone-action-label">Reduced Camera Shake: ${acc.reducedShake ? 'ON' : 'OFF'}</span>
            <span class="phone-action-meta">Softens weapon &amp; impact camera jolt</span>
          </button>
        </div>
      </div>
    `;

    this.phoneContentEl.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.dataset.weather as WeatherMode;
        this.engine.setWeather(w, false);
        this.renderPhoneDrawer();
      });
    });

    this.phoneContentEl.querySelector('[data-action="toggle-cycle"]')?.addEventListener('click', () => {
      this.engine.toggleWeatherAutoCycle();
      this.renderPhoneDrawer();
    });

    this.phoneContentEl.querySelectorAll<HTMLButtonElement>('[data-teleport]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.teleport!;
        this.engine.teleportToStructure(id);
        this.closePhoneModal();
      });
    });

    this.phoneContentEl.querySelectorAll<HTMLButtonElement>('[data-deliver]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.deliver as 'tuktuk' | 'sedan';
        this.engine.callVehicleDelivery(kind);
        this.closePhoneModal();
      });
    });

    this.phoneContentEl.querySelectorAll<HTMLButtonElement>('[data-supply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.dataset.supply as 'ammo' | 'armor' | 'heal' | 'fixer';
        this.engine.buyRemoteSupply(item);
        this.renderPhoneDrawer();
      });
    });

    this.phoneContentEl.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.acc as 'autoAim' | 'highContrastHud' | 'reducedShake';
        const cur = this.lastSnap?.accessibility[key] ?? false;
        this.engine.updateAccessibility({ [key]: !cur });
        this.renderPhoneDrawer();
      });
    });
  }

  private async refreshGoogleMapView(): Promise<void> {
    const district = this.engine.getDistrict();
    const structures = this.engine.getStructures();
    const playerPos = this.engine.getPlayerLatLng();

    this.renderSidebarPlaces(structures);
    this.mapsFallbackEl.style.display = 'flex';

    const mounted = await this.mapExplorer.mount(
      this.mapsContainerEl,
      district.center,
      structures,
      playerPos,
      (struct) => {
        this.engine.setCustomWaypoint(struct);
        this.closeMapsModal();
      },
    );

    if (mounted) {
      this.mapsFallbackEl.style.display = 'none';
    } else {
      this.mapsFallbackEl.innerHTML = `
        <strong style="color:#ffd670">${district.name} (${district.center.lat.toFixed(4)}, ${district.center.lng.toFixed(4)})</strong>
        <span>Interactive map tiles require an active browser connection to Google Maps Platform. Select any Sri Lankan landmark in the list to set a 3D GPS waypoint.</span>
      `;
    }
  }

  private renderSidebarPlaces(structures: StructureRecord[]): void {
    this.mapsSidebarListEl.innerHTML = '';
    const sorted = [...structures].sort((a, b) => {
      if (Boolean(a.enterable) !== Boolean(b.enterable)) return a.enterable ? -1 : 1;
      if (a.source === b.source) return 0;
      return a.source === 'google_maps' ? -1 : 1;
    });
    for (const s of sorted) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'maps-place-item';

      const nameEl = document.createElement('span');
      nameEl.className = 'maps-place-name';
      nameEl.textContent = s.name;
      if (s.enterable) {
        nameEl.style.color = '#5eead4';
      } else if (s.source === 'google_maps') {
        nameEl.style.color = '#ffd670';
      }

      const metaEl = document.createElement('span');
      metaEl.className = 'maps-place-meta';
      const badge = s.enterable
        ? 'Walk-In Interior'
        : s.source === 'google_maps'
          ? 'Google Maps Live'
          : 'Colombo Landmark';
      metaEl.textContent = `${badge} · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`;

      btn.append(nameEl, metaEl);
      btn.addEventListener('click', () => {
        if (s.enterable) {
          this.engine.teleportToStructure(s.id);
        } else {
          this.engine.setCustomWaypoint(s);
        }
        this.closeMapsModal();
      });
      this.mapsSidebarListEl.appendChild(btn);
    }
  }

  private showQuotaBanner(): void {
    if (this.quotaBannerShown) return;
    this.quotaBannerShown = true;
    this.quotaBannerEl.style.display = 'flex';
  }

  private updateWeatherButton(mode: WeatherMode, label: string): void {
    const icon =
      mode === 'monsoon'
        ? SVG_WEATHER_MONSOON
        : mode === 'overcast'
          ? SVG_WEATHER_OVERCAST
          : SVG_WEATHER_SUNNY;
    const short = mode === 'monsoon' ? 'MONSOON' : mode === 'overcast' ? 'OVERCAST' : 'SUNNY';
    this.weatherBtnEl.className = `hud-weather-btn ${mode}`;
    this.weatherBtnEl.innerHTML = `${icon}<span>${short}</span>`;
    this.weatherBtnEl.title = `${label} · Click or press [V] to switch weather`;
    this.mapsWeatherPillEl.textContent = `WEATHER: ${short}`;
  }

  private renderWeaponBar(snap: HudSnapshot): void {
    const sig = snap.weapons.map((w) => `${w.id}:${w.equipped ? 1 : 0}:${w.ammo}`).join('|');
    if (sig === this.lastWeaponSig) return;
    this.lastWeaponSig = sig;

    this.weaponBarEl.innerHTML = '';
    for (const w of snap.weapons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hud-weapon-slot${w.equipped ? ' active' : ''}`;
      btn.setAttribute('tabindex', '-1');
      btn.setAttribute('aria-pressed', String(w.equipped));
      btn.setAttribute('data-weapon', w.id);
      const ammoText = w.infiniteAmmo ? '∞' : String(w.ammo);
      const emptyCls = !w.infiniteAmmo && w.ammo <= 0 ? ' empty' : '';
      btn.innerHTML = `
        <span class="hud-weapon-top">
          <span class="hud-weapon-key">[${w.slot}]</span>
          <span class="hud-weapon-ammo${emptyCls}">${ammoText}</span>
        </span>
        <span class="hud-weapon-name">${w.shortName}</span>
      `;
      btn.addEventListener('click', (e) => {
        (e.currentTarget as HTMLButtonElement).blur();
        this.engine.selectWeapon(w.id as WeaponId);
      });
      this.weaponBarEl.appendChild(btn);
    }

    const fireBtn = document.createElement('button');
    fireBtn.type = 'button';
    fireBtn.className = 'hud-fire-btn';
    fireBtn.setAttribute('tabindex', '-1');
    fireBtn.setAttribute('aria-label', 'Attack or Fire Equipped Weapon');
    fireBtn.textContent = 'FIRE [J]';
    fireBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      this.engine.triggerPrimaryAttack();
    });
    this.weaponBarEl.appendChild(fireBtn);
  }

  public update(snap: HudSnapshot): void {
    this.lastSnap = snap;

    // Accessibility high-contrast class
    this.root.classList.toggle('high-contrast-hud', snap.accessibility.highContrastHud);

    // Visibility by GamePhase
    this.titleOverlayEl.classList.toggle('hidden', snap.phase !== 'title');
    this.hudLayerEl.classList.toggle('hidden', snap.phase !== 'playing');
    this.pauseModalEl.classList.toggle(
      'hidden',
      snap.phase !== 'paused' || this.mapModalOpen || this.phoneModalOpen,
    );
    this.gameoverModalEl.classList.toggle('hidden', snap.phase !== 'gameover');

    this.updateWeatherButton(snap.weatherMode, snap.weatherLabel);

    if (snap.phase === 'paused' && !this.mapModalOpen && !this.phoneModalOpen) {
      this.pauseStatsEl.innerHTML = this.renderStatTiles(snap);
    }
    if (snap.phase === 'gameover') {
      this.gameoverStatsEl.innerHTML = this.renderStatTiles(snap);
    }

    if (this.mapModalOpen) {
      this.mapExplorer.updatePlayer({ lat: snap.playerLat, lng: snap.playerLng });
    }

    if (snap.phase !== 'playing') return;

    // Mission Bar
    this.missionTitleEl.textContent = snap.mission.title.toUpperCase();
    this.missionTextEl.textContent = snap.mission.objective;
    const distM = Math.round(
      Math.hypot(snap.mission.targetX - snap.playerX, snap.mission.targetZ - snap.playerZ),
    );
    this.missionDistEl.textContent = `${distM}M`;

    // Top-Right Economy, Wanted Stars, Vitals
    this.cashEl.textContent = `LKR ${snap.cashLkr.toLocaleString()}`;
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= snap.wantedStars ? SVG_STAR_FILLED : SVG_STAR_EMPTY;
    }
    this.wantedRowEl.innerHTML = starsHtml;

    const hpPct = Math.max(0, Math.min(1, snap.health / snap.maxHealth));
    this.hpFillEl.style.transform = `scaleX(${hpPct})`;
    this.hpGhostEl.style.transform = `scaleX(${hpPct})`;
    this.hpValEl.textContent = String(snap.health);

    const armorPct = Math.max(0, Math.min(1, snap.armor / snap.maxArmor));
    this.armorFillEl.style.transform = `scaleX(${armorPct})`;
    this.armorValEl.textContent = String(snap.armor);

    const stamPct = Math.max(0, Math.min(1, snap.stamina / 100));
    this.staminaFillEl.style.transform = `scaleX(${stamPct})`;

    this.damageVignetteEl.style.opacity = snap.health <= 32 ? String((32 - snap.health) / 32) : '0';

    // District & Google Maps Sync indicator
    const syncLabel =
      snap.mapsSyncedCount > 0
        ? `${snap.districtName} · ${snap.mapsSyncedCount} Maps POIs`
        : snap.districtName;
    this.districtMetaEl.textContent = syncLabel;

    this.muteBtnEl.innerHTML = snap.muted ? SVG_ICON_SOUND_OFF : SVG_ICON_SOUND_ON;

    // GPS Coordinates readout
    this.gpsLatLngEl.textContent = `${snap.playerLat.toFixed(4)}, ${snap.playerLng.toFixed(4)}`;
    this.gpsSyncEl.textContent =
      snap.mapsStatus === 'live'
        ? 'MAPS LIVE'
        : snap.mapsStatus === 'loading'
          ? 'SYNCING'
          : 'COLOMBO';

    // Walk-In Interior Prompt
    if (snap.interiorName && snap.interiorActionPrompt) {
      this.interiorBarEl.classList.remove('hidden');
      this.interiorBadgeEl.textContent = `INSIDE · ${snap.interiorName.toUpperCase()}`;
      this.interiorActionBtnEl.textContent = `[E] ${snap.interiorActionPrompt}`;
    } else {
      this.interiorBarEl.classList.add('hidden');
    }

    // Accessible Weapon Bar
    this.renderWeaponBar(snap);

    // Context Vehicle Prompt & Speedometer
    if (snap.nearbyVehiclePrompt) {
      this.interactPromptEl.classList.remove('hidden');
      const lbl = this.interactPromptEl.querySelector('#hud-interact-label');
      if (lbl) lbl.textContent = snap.nearbyVehiclePrompt;
    } else {
      this.interactPromptEl.classList.add('hidden');
    }

    if (snap.inVehicle) {
      this.speedoCardEl.classList.remove('hidden');
      this.vehicleNameEl.textContent = snap.vehicleName;
      this.speedNumEl.textContent = String(snap.speedKmh);
    } else {
      this.speedoCardEl.classList.add('hidden');
    }

    // Banner Toast
    if (snap.bannerTitle) {
      this.bannerTitleEl.textContent = snap.bannerTitle;
      this.bannerSubEl.textContent = snap.bannerSubtitle ?? '';
      this.bannerToastEl.classList.add('visible');
    } else {
      this.bannerToastEl.classList.remove('visible');
    }

    this.renderMinimap(snap);
  }

  private renderStatTiles(snap: HudSnapshot): string {
    return `
      <div class="modal-stat-tile">
        <div class="modal-stat-label">Cash</div>
        <div class="modal-stat-val">LKR ${snap.cashLkr.toLocaleString()}</div>
      </div>
      <div class="modal-stat-tile">
        <div class="modal-stat-label">Score / Best</div>
        <div class="modal-stat-val">${snap.score} / ${snap.bestScore}</div>
      </div>
      <div class="modal-stat-tile">
        <div class="modal-stat-label">Weather</div>
        <div class="modal-stat-val">${snap.weatherMode.toUpperCase()}</div>
      </div>
    `;
  }

  private renderMinimap(snap: HudSnapshot): void {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const scale = 1.05;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#18222e';
    ctx.fillRect(0, 0, W, H);

    const toPxX = (wx: number) => cx + (wx - snap.playerX) * scale;
    const toPxY = (wz: number) => cy + (wz - snap.playerZ) * scale;

    // Indian Ocean west edge (x < -68)
    const oceanEdgeX = toPxX(-68);
    if (oceanEdgeX > 0) {
      ctx.fillStyle = '#0f4c75';
      ctx.fillRect(0, 0, Math.min(W, oceanEdgeX), H);
    }

    // Galle Face Sandy Beach & Coastal Lawn (-68 to -50)
    const lawnL = toPxX(-68);
    const lawnR = toPxX(-50);
    ctx.fillStyle = '#254a2b';
    ctx.fillRect(lawnL, 0, lawnR - lawnL, H);

    // Beira Lake east waterway (x > 64)
    const lakeEdgeX = toPxX(64);
    if (lakeEdgeX < W) {
      ctx.fillStyle = '#145a70';
      ctx.fillRect(Math.max(0, lakeEdgeX), toPxY(-58), W - lakeEdgeX, 118 * scale);
    }

    // Colombo Road Grid
    ctx.fillStyle = '#3b424d';
    for (const rx of ROAD_X_LINES) {
      ctx.fillRect(toPxX(rx - 6.2), 0, 12.4 * scale, H);
    }
    for (const rz of ROAD_Z_LINES) {
      ctx.fillRect(0, toPxY(rz - 6.2), W, 12.4 * scale);
    }

    // Buildings, Walk-In Interiors & Google Maps structures
    for (const b of snap.minimapBuildings) {
      const bx = toPxX(b.x - b.w * 0.5);
      const by = toPxY(b.z - b.d * 0.5);
      if (b.isEnterable) {
        ctx.fillStyle = '#14b8a6';
        ctx.fillRect(bx, by, b.w * scale, b.d * scale);
        ctx.strokeStyle = '#ffd670';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, by, b.w * scale, b.d * scale);
      } else {
        ctx.fillStyle = b.isLandmark ? '#b47d2a' : '#5c6675';
        ctx.fillRect(bx, by, b.w * scale, b.d * scale);
      }
    }

    // Street Pickups (Cash / Medkit / Armor / Ammo)
    for (const p of snap.minimapPickups) {
      ctx.fillStyle =
        p.kind === 'cash'
          ? '#4fd18b'
          : p.kind === 'medkit'
            ? '#ef4444'
            : p.kind === 'armor'
              ? '#38bdf8'
              : '#f5b942';
      ctx.beginPath();
      ctx.arc(toPxX(p.x), toPxY(p.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vehicles
    for (const v of snap.minimapVehicles) {
      ctx.fillStyle = v.isPolice ? '#38bdf8' : '#e5e7eb';
      ctx.fillRect(toPxX(v.x) - 2, toPxY(v.z) - 2, 4, 4);
    }

    // Hostile NPCs
    ctx.fillStyle = '#ef4444';
    for (const e of snap.minimapEnemies) {
      ctx.beginPath();
      ctx.arc(toPxX(e.x), toPxY(e.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mission Waypoint Beacon (clamped to radar edge if far)
    const mx = toPxX(snap.mission.targetX);
    const my = toPxY(snap.mission.targetZ);
    const clampedX = Math.max(10, Math.min(W - 10, mx));
    const clampedY = Math.max(10, Math.min(H - 10, my));
    ctx.fillStyle = '#f5b942';
    ctx.strokeStyle = '#120d08';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clampedX, clampedY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Player heading arrow at center
    ctx.save();
    ctx.translate(cx, cy);
    const canvasAngle = Math.atan2(Math.sin(snap.playerYaw), -Math.cos(snap.playerYaw));
    ctx.rotate(canvasAngle);
    ctx.fillStyle = '#4fd18b';
    ctx.strokeStyle = '#120d08';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
