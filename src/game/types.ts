export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type WeatherMode = 'sunny' | 'overcast' | 'monsoon';

export type WeaponId = 'fists' | 'bat' | 'pistol' | 'smg' | 'shotgun';

export interface WeaponSpec {
  id: WeaponId;
  slot: number;
  name: string;
  shortName: string;
  kind: 'melee' | 'ranged';
  damage: number;
  range: number;
  cooldown: number;
  pellets: number;
  spread: number;
  infiniteAmmo: boolean;
  defaultAmmo: number;
  maxAmmo: number;
  ammoCostLkr: number;
  ammoPackAmount: number;
}

export type BuildingArchetype =
  | 'lotus_tower'
  | 'twin_towers'
  | 'colonial_arcade'
  | 'pettah_bazaar'
  | 'hotel_tower'
  | 'civic_hall'
  | 'temple_pavilion'
  | 'commercial_plaza'
  | 'lighthouse'
  | 'kiosk_arcade'
  | 'armory'
  | 'cafe_shop'
  | 'safehouse'
  | 'bank_vault';

export type InteriorKind = 'armory' | 'cafe_shop' | 'safehouse' | 'bank_vault';

export type VehicleKind = 'tuktuk' | 'sedan' | 'bus' | 'police';

export type NpcArchetype = 'citizen' | 'constable' | 'tactical' | 'enforcer';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DistrictPreset {
  id: string;
  name: string;
  subtitle: string;
  center: LatLng;
  hasOceanWest: boolean;
  hasLakeEast: boolean;
}

export interface StructureRecord {
  id: string;
  name: string;
  archetype: BuildingArchetype;
  source: 'google_maps' | 'district_landmark';
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationY: number;
  lat: number;
  lng: number;
  address?: string;
  primaryType?: string;
  googleMapsURI?: string;
  accentColor?: number;
  enterable?: InteriorKind;
  doorFacing?: 'north' | 'south' | 'east' | 'west';
}

export interface AABB {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MissionState {
  index: number;
  title: string;
  objective: string;
  type: 'drive_to' | 'clear_enforcers' | 'evade_heat';
  targetX: number;
  targetZ: number;
  targetLabel: string;
  rewardLkr: number;
  remainingTargets: number;
  completedCount: number;
}

export interface HudWeaponSlot {
  id: WeaponId;
  slot: number;
  name: string;
  shortName: string;
  ammo: number;
  infiniteAmmo: boolean;
  equipped: boolean;
}

export interface AccessibilitySettings {
  autoAim: boolean;
  highContrastHud: boolean;
  reducedShake: boolean;
}

export interface HudSnapshot {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  cashLkr: number;
  score: number;
  bestScore: number;
  wantedStars: number;
  wantedHeat: number;
  districtName: string;
  mapsSyncedCount: number;
  mapsStatus: 'loading' | 'live' | 'offline';
  weatherMode: WeatherMode;
  weatherLabel: string;
  weatherAutoCycle: boolean;
  playerLat: number;
  playerLng: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  inVehicle: boolean;
  vehicleName: string;
  speedKmh: number;
  nearbyVehiclePrompt: string | null;
  interiorName: string | null;
  interiorActionPrompt: string | null;
  weapons: HudWeaponSlot[];
  equippedWeaponId: WeaponId;
  mission: MissionState;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  muted: boolean;
  isWasted: boolean;
  elapsedSeconds: number;
  accessibility: AccessibilitySettings;
  minimapBuildings: {
    x: number;
    z: number;
    w: number;
    d: number;
    isLandmark: boolean;
    isEnterable: boolean;
  }[];
  minimapVehicles: { x: number; z: number; isPolice: boolean }[];
  minimapEnemies: { x: number; z: number }[];
  minimapPickups: { x: number; z: number; kind: 'cash' | 'medkit' | 'armor' | 'ammo' }[];
}
