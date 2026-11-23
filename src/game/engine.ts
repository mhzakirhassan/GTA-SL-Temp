import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  AABB,
  AccessibilitySettings,
  DistrictPreset,
  GamePhase,
  HudSnapshot,
  MissionState,
  NpcArchetype,
  StructureRecord,
  VehicleKind,
  WeaponId,
  WeatherMode,
} from './types';
import {
  ROAD_X_LINES,
  ROAD_Z_LINES,
  WORLD_PLAYABLE_RADIUS,
  applyArmorAndHealthDamage,
  buildEnterableBuildingWallColliders,
  getTerrainHeight,
  isPointInsideStructure,
  resolveCircleAABBCollision,
  shortestAngleDelta,
  stepWantedSystem,
  worldToLatLng,
  type WantedState,
} from './worldMath';
import { buildDistrictBaseStructures, SRI_LANKA_DISTRICTS } from './cityData';
import { createProceduralTextures, type GameTextureSet } from './textures';
import {
  animateHumanPose,
  buildCoconutPalmInstancedMeshes,
  createBuildingModel,
  createHumanModel,
  createVehicleModel,
  type HumanRig,
  type VehicleRig,
} from './models';
import {
  buildSriLankaTerrainAndProps,
  createEnterableBuildingModel,
  createPickupModel,
  type EnterableBuildingView,
  type WorldPropsRig,
} from './worldProps';
import {
  createInitialWeatherState,
  getBlendedAtmosphere,
  getNextWeatherMode,
  setWeatherMode,
  stepWeatherState,
  type WeatherAtmosphere,
  type WeatherState,
} from './weather';
import {
  WEAPON_BY_ID,
  WEAPON_SPECS,
  consumeWeaponAmmo,
  createInitialAmmoBag,
  refillAllAmmo,
} from './weapons';
import { GameAudio } from './audio';
import { fetchDistrictStructuresFromGoogleMaps } from './mapsService';

interface VehicleEntity {
  id: string;
  kind: VehicleKind;
  rig: VehicleRig;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steerAngle: number;
  wheelSpin: number;
  isPlayerDriven: boolean;
  aiLaneAxis: 'x' | 'z';
  aiLaneCoord: number;
  aiDir: 1 | -1;
  aiSpeed: number;
  health: number;
}

interface NpcEntity {
  id: string;
  archetype: NpcArchetype;
  rig: HumanRig;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  gaitPhase: number;
  hitFlashTimer: number;
  koTimer: number;
  dead: boolean;
  homeX: number;
  homeZ: number;
  wanderAngle: number;
  wanderTimer: number;
  attackState: 'idle' | 'windup' | 'active' | 'recover';
  attackTimer: number;
  hasAttackToken: boolean;
  lungeDirX: number;
  lungeDirZ: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface BulletTracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface WorldPickup {
  id: string;
  kind: 'cash' | 'medkit' | 'armor' | 'ammo';
  x: number;
  z: number;
  mesh: THREE.Group;
  respawnTimer: number;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _camLookGoal = new THREE.Vector3();
const _camLookCur = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _raycaster = new THREE.Raycaster();
const _colorScratch = new THREE.Color();

const OUTFIT_COLORS = [0x135d66, 0xb83232, 0xd48c24, 0x264653, 0x6b21a8];

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class GtaSriLankaEngine {
  private mountEl: HTMLElement;
  private onHudUpdate: (snap: HudSnapshot) => void;
  private onAtmosphereFrame?: (
    dt: number,
    atmo: WeatherAtmosphere,
    lightningFlash: number,
    indoorDampen: number,
  ) => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: GameTextureSet;
  private audio = new GameAudio();
  private isSoftwareGl: boolean;

  // World groups & atmospheric references
  private worldGroup = new THREE.Group();
  private dynamicBuildingsGroup = new THREE.Group();
  private pickupsGroup = new THREE.Group();
  private oceanMesh!: THREE.Mesh;
  private oceanMat!: THREE.MeshPhysicalMaterial;
  private sunDisc!: THREE.Mesh;
  private sunDiscMat!: THREE.MeshBasicMaterial;
  private roadMaterials: THREE.MeshStandardMaterial[] = [];
  private worldProps!: WorldPropsRig;
  private beaconGroup!: THREE.Group;
  private beaconRing!: THREE.Mesh;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;

  private buildingColliders: AABB[] = [];
  private buildingMeshesForCamera: THREE.Object3D[] = [];
  private enterableViews: EnterableBuildingView[] = [];
  private currentInterior: StructureRecord | null = null;
  private bankHeistCooldown = 0;
  private outfitIndex = 0;

  // District, Weather & Google Maps state
  private district: DistrictPreset = SRI_LANKA_DISTRICTS[0];
  private structures: StructureRecord[] = [];
  private mapsSyncedCount = 0;
  private mapsStatus: 'loading' | 'live' | 'offline' = 'loading';
  private districtLoadToken = 0;
  private weather: WeatherState = createInitialWeatherState('sunny', 42);

  // Player state (1:1 human scale Kasun)
  private playerRig!: HumanRig;
  private playerX = 0;
  private playerY = 0;
  private playerVy = 0;
  private playerZ = 26;
  private playerYaw = Math.PI;
  private playerSpeed = 0;
  private playerGait = 0;
  private stepAccum = 0;
  private playerGrounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private squashY = 1;
  private playerHealth = 100;
  private readonly maxHealth = 100;
  private playerArmor = 50;
  private readonly maxArmor = 100;
  private playerStamina = 100;
  private playerHitFlash = 0;

  // Weapons & Combat
  private equippedWeapon: WeaponId = 'pistol';
  private ammoBag: Record<WeaponId, number> = createInitialAmmoBag();
  private weaponCooldown = 0;
  private attackAnimTimer = 0;
  private attackAnimDuration = 0.36;
  private meleeHitApplied = false;
  private muzzleFlashTimer = 0;
  private tracers: BulletTracer[] = [];

  private activeVehicle: VehicleEntity | null = null;
  private nearbyVehicle: VehicleEntity | null = null;

  // Economy, Wanted, Accessibility & Missions
  private phase: GamePhase = 'title';
  private cashLkr = 3200;
  private score = 0;
  private bestScore = 0;
  private wanted: WantedState = { heat: 0, stars: 0, cooldownTimer: 0 };
  private mission!: MissionState;
  private bannerTitle: string | null = null;
  private bannerSubtitle: string | null = null;
  private bannerTimer = 0;
  private elapsedSeconds = 0;
  private isWasted = false;
  private wastedDelayTimer = 0;
  private accessibility: AccessibilitySettings = {
    autoAim: true,
    highContrastHud: false,
    reducedShake: false,
  };

  // Entities & Pooled Particles
  private vehicles: VehicleEntity[] = [];
  private npcs: NpcEntity[] = [];
  private pickups: WorldPickup[] = [];
  private particles: ParticleSlot[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private particleCursor = 0;
  private readonly maxParticles = 140;

  // Camera & Juice
  private camYaw = Math.PI;
  private camTrauma = 0;
  private hitstopTimer = 0;
  private titleOrbitAngle = 0.4;
  private waterTime = 0;

  // Unified Input Hub
  private keysHeld = new Set<string>();
  private keysJustPressed = new Set<string>();
  private pointerDragActive = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownTime = 0;
  private pointerDragged = false;
  private lastPointerX = 0;

  // Loop & Throttling
  private frameId = 0;
  private lastTimeMs = 0;
  private hudEmitAccum = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    mountEl: HTMLElement,
    onHudUpdate: (snap: HudSnapshot) => void,
    onAtmosphereFrame?: (
      dt: number,
      atmo: WeatherAtmosphere,
      lightningFlash: number,
      indoorDampen: number,
    ) => void,
  ) {
    this.mountEl = mountEl;
    this.onHudUpdate = onHudUpdate;
    this.onAtmosphereFrame = onAtmosphereFrame;
    this.isSoftwareGl = detectSoftwareWebGL();

    try {
      const saved = Number(localStorage.getItem('gta_sl_best_score') || '0');
      if (Number.isFinite(saved)) this.bestScore = saved;
    } catch {
      // Ignore storage failures in sandboxed frames
    }

    // 1. Renderer setup with software-WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      mountEl.clientWidth || window.innerWidth,
      mountEl.clientHeight || window.innerHeight,
    );
    mountEl.appendChild(this.renderer.domElement);

    // 2. Scene, Sky & Colombo Dynamic Atmosphere
    this.scene = new THREE.Scene();
    const horizonHex = 0xe8c49e;
    this.scene.background = new THREE.Color(horizonHex);
    this.scene.fog = new THREE.FogExp2(horizonHex, 0.0046);

    this.camera = new THREE.PerspectiveCamera(
      58,
      (mountEl.clientWidth || window.innerWidth) /
        Math.max(1, mountEl.clientHeight || window.innerHeight),
      0.2,
      460,
    );

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0x8ec5fc, 0x8a6d4b, 0.98);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffdfb0, 2.35);
    this.sunLight.position.set(-55, 78, 42);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 220;
    const sd = 68;
    this.sunLight.shadow.camera.left = -sd;
    this.sunLight.shadow.camera.right = sd;
    this.sunLight.shadow.camera.top = sd;
    this.sunLight.shadow.camera.bottom = -sd;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 3. Procedural PBR Textures, Pooled Particles, Mission Beacon
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.initParticlePool();
    this.initMissionBeacon();

    this.scene.add(this.worldGroup);
    this.worldGroup.add(this.dynamicBuildingsGroup);
    this.worldGroup.add(this.pickupsGroup);

    // 4. Build Colombo multi-terrain environment, player, pickups, traffic & live Maps sync
    this.buildStaticEnvironment();
    this.buildPlayer();
    this.spawnWorldPickups();
    this.loadDistrict(this.district.id);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 5. Event listeners & ResizeObserver
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.mountEl);

    // 6. Start paced simulation loop
    this.lastTimeMs = performance.now();
    this.emitHud();
    this.tick();
  }

  private initParticlePool(): void {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 1,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, this.particles[i].color);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    hexColor: number,
    speed = 5,
    scale = 1,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      slot.active = true;
      slot.x = x + (Math.random() - 0.5) * 0.4;
      slot.y = y + Math.random() * 0.35;
      slot.z = z + (Math.random() - 0.5) * 0.4;
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      slot.vx = Math.cos(angle) * spd;
      slot.vy = 1.8 + Math.random() * speed * 0.75;
      slot.vz = Math.sin(angle) * spd;
      slot.maxLife = 0.32 + Math.random() * 0.38;
      slot.life = slot.maxLife;
      slot.scale = scale * (0.7 + Math.random() * 0.6);
      slot.color.setHex(hexColor);
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy -= 13 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;

      const t = p.life / p.maxLife;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.life * 6, p.life * 4, 0);
      _dummy.scale.setScalar(p.scale * t);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private spawnBulletTracer(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    hex = 0xffe484,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.max(0.2, Math.hypot(dx, dy, dz));
    const geo = new THREE.CylinderGeometry(0.025, 0.025, len, 5);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.92 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
    mesh.lookAt(x2, y2, z2);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09, maxLife: 0.09 });
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        (tr.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = tr.life / tr.maxLife;
      }
    }
  }

  private initMissionBeacon(): void {
    this.beaconGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(2.1, 2.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf5b942,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.position.y = 0.08;
    this.beaconGroup.add(this.beaconRing);

    const beamGeo = new THREE.CylinderGeometry(0.45, 1.35, 36, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd670,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 18;
    this.beaconGroup.add(beam);

    this.scene.add(this.beaconGroup);
  }

  private buildStaticEnvironment(): void {
    // Extended tropical ground plane
    const landMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.sidewalkMap,
      roughness: 0.88,
      metalness: 0.02,
    });
    const land = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), landMat);
    land.rotation.x = -Math.PI / 2;
    land.position.set(194, 0, 0);
    land.receiveShadow = true;
    this.worldGroup.add(land);

    // Coastal seawall balustrade with beach stairways/openings at z = 0 and z = 44
    const seawallMat = new THREE.MeshStandardMaterial({ color: 0xc8bfa8, roughness: 0.82 });
    const wallSpans: [number, number][] = [
      [-140, -52],
      [-36, -8],
      [8, 36],
      [52, 140],
    ];
    for (const [z0, z1] of wallSpans) {
      const len = z1 - z0;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, len), seawallMat);
      wall.position.set(-66.5, 0.52, (z0 + z1) * 0.5);
      wall.receiveShadow = true;
      wall.castShadow = true;
      this.worldGroup.add(wall);
    }

    // Extended Indian Ocean along West horizon
    const oceanGeo = new THREE.PlaneGeometry(340, 580, 12, 12);
    this.oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x16688a,
      roughness: 0.16,
      metalness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.set(-246, -0.45, 0);
    this.worldGroup.add(this.oceanMesh);

    // Golden-hour sun disc in western sky (fades cleanly under Overcast / Monsoon)
    this.sunDiscMat = new THREE.MeshBasicMaterial({
      color: 0xffe4a8,
      fog: false,
      transparent: true,
      opacity: 1,
    });
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 16), this.sunDiscMat);
    this.sunDisc.position.set(-250, 96, -110);
    this.worldGroup.add(this.sunDisc);

    // Colombo Road Grid
    const roadMatNS = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.asphaltMap,
      bumpMap: this.textures.asphaltBump,
      bumpScale: 0.03,
      roughness: 0.85,
      metalness: 0.08,
    });
    const roadMatEW = roadMatNS.clone();
    this.roadMaterials = [roadMatNS, roadMatEW];

    const roadLen = 230;
    const roadWidth = 12.4;

    for (const rx of ROAD_X_LINES) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLen), roadMatNS);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(rx, 0.04, 0);
      strip.receiveShadow = true;
      this.worldGroup.add(strip);
    }

    for (const rz of ROAD_Z_LINES) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLen), roadMatEW);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = Math.PI / 2;
      strip.position.set(10, 0.055, rz);
      strip.receiveShadow = true;
      this.worldGroup.add(strip);
    }

    // Intersections & zebra crosswalk bars
    const interMat = new THREE.MeshStandardMaterial({ color: 0x2c3037, roughness: 0.85, metalness: 0.08 });
    this.roadMaterials.push(interMat);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xede8dc });
    for (const rx of ROAD_X_LINES) {
      for (const rz of ROAD_Z_LINES) {
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth + 0.4, roadWidth + 0.4), interMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(rx, 0.07, rz);
        patch.receiveShadow = true;
        this.worldGroup.add(patch);

        for (let s = -4; s <= 4; s += 2) {
          const zbar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), stripeMat);
          zbar.rotation.x = -Math.PI / 2;
          zbar.position.set(rx + s, 0.085, rz + 7.4);
          this.worldGroup.add(zbar);
        }
      }
    }

    // Varied Sri Lankan Multi-Terrain & Environmental Props (beach, hills, Beira Lake, boats, cricket, food carts, billboards, traffic lights)
    this.worldProps = buildSriLankaTerrainAndProps(this.textures);
    this.worldGroup.add(this.worldProps.group);

    // Instanced Tropical Coconut Palms lining Galle Face Promenade, avenues, and Cinnamon Gardens hills
    const palmSpots: { x: number; z: number; scale: number; rotY: number }[] = [];
    for (let z = -96; z <= 96; z += 11) {
      palmSpots.push({ x: -53.5, z, scale: 0.92 + (Math.abs(z) % 5) * 0.06, rotY: z * 0.7 });
      palmSpots.push({ x: -64.5, z: z + 5, scale: 0.88 + (Math.abs(z) % 4) * 0.07, rotY: z * 1.1 });
    }
    for (let z = -84; z <= 84; z += 18) {
      if (Math.abs(z % 44) < 12) continue;
      // Keep doorways of our 4 walk-in buildings completely clear of palm trunks
      if (Math.abs(z - 19) < 8 || Math.abs(z + 16) < 8) continue;
      palmSpots.push({ x: -8.2, z, scale: 0.95, rotY: z * 0.4 });
      palmSpots.push({ x: 8.2, z, scale: 1.02, rotY: z * 0.9 });
      palmSpots.push({ x: 35.8, z, scale: 0.94, rotY: z * 1.3 });
    }
    // Palms framing Beira Lake & eastern hills
    for (let z = -34; z <= 28; z += 12) {
      palmSpots.push({ x: 77.5, z, scale: 1.0, rotY: z * 0.8 });
    }
    this.worldGroup.add(buildCoconutPalmInstancedMeshes(palmSpots));

    // Coastal streetlamp poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a313a, roughness: 0.45, metalness: 0.7 });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffe4a1,
      emissive: 0xffc864,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.4, 8);
    const armGeo = new THREE.BoxGeometry(1.1, 0.09, 0.09);
    const bulbGeo = new THREE.BoxGeometry(0.45, 0.12, 0.24);
    for (let z = -76; z <= 76; z += 22) {
      if (Math.abs(z % 44) < 10) continue;
      for (const side of [-1, 1]) {
        const lamp = new THREE.Group();
        lamp.position.set(side * 7.6, 0, z);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 2.7;
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(-side * 0.5, 5.3, 0);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(-side * 0.95, 5.22, 0);
        lamp.add(pole, arm, bulb);
        this.worldGroup.add(lamp);
      }
    }
  }

  private spawnWorldPickups(): void {
    while (this.pickupsGroup.children.length > 0) {
      this.pickupsGroup.remove(this.pickupsGroup.children[0]);
    }
    this.pickups = [];

    const specs: { kind: WorldPickup['kind']; x: number; z: number }[] = [
      { kind: 'ammo', x: 9.2, z: 23 },
      { kind: 'armor', x: -9.2, z: 12 },
      { kind: 'cash', x: -57, z: 18 },
      { kind: 'medkit', x: -57, z: -12 },
      { kind: 'cash', x: 24, z: 2 },
      { kind: 'ammo', x: 28, z: 20 },
      { kind: 'armor', x: 44, z: -14 },
      { kind: 'cash', x: 85, z: -4 }, // On Beira Lake footbridge!
      { kind: 'cash', x: -72, z: 6 }, // On Galle Face Sandy Beach!
      { kind: 'medkit', x: 48, z: 24 },
      { kind: 'ammo', x: -24, z: -36 },
      { kind: 'cash', x: 96, z: -70 }, // On Cinnamon Gardens Hilltop Gazebo!
    ];

    specs.forEach((s, i) => {
      const mesh = createPickupModel(s.kind);
      const gy = getTerrainHeight(s.x, s.z);
      mesh.position.set(s.x, gy, s.z);
      this.pickupsGroup.add(mesh);
      this.pickups.push({
        id: `pk-${i}`,
        kind: s.kind,
        x: s.x,
        z: s.z,
        mesh,
        respawnTimer: 0,
      });
    });
  }

  private buildPlayer(): void {
    this.playerRig = createHumanModel(
      {
        role: 'player',
        shirtColor: OUTFIT_COLORS[this.outfitIndex],
        pantsColor: 0x263142,
        skinColor: 0x9c6b49,
        hairColor: 0x141210,
      },
      this.textures.contactShadowMap,
    );
    this.playerRig.root.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.root);
  }

  public loadDistrict(districtId: string): void {
    const found = SRI_LANKA_DISTRICTS.find((d) => d.id === districtId) ?? SRI_LANKA_DISTRICTS[0];
    this.district = found;
    this.districtLoadToken += 1;
    const token = this.districtLoadToken;

    const base = buildDistrictBaseStructures(found);
    this.structures = base;
    this.mapsSyncedCount = 0;
    this.mapsStatus = 'loading';
    this.rebuildCityBuildings();
    this.resetEntitiesForDistrict();
    this.setupMission(0);
    this.emitHud();

    // Live Google Maps Places API (New) structure fetch
    const occupied = base.map((b) => ({ x: b.x, z: b.z }));
    void fetchDistrictStructuresFromGoogleMaps(found, occupied).then((res) => {
      if (this.disposed || token !== this.districtLoadToken) return;
      if (res.live && res.structures.length > 0) {
        this.structures = [...base, ...res.structures];
        this.mapsSyncedCount = res.structures.length;
        this.mapsStatus = 'live';
        this.rebuildCityBuildings();
        this.showBanner(
          'GOOGLE MAPS SYNCED',
          `${res.structures.length} real ${found.name} structures loaded`,
          2.6,
        );
      } else {
        this.mapsStatus = res.live ? 'live' : 'offline';
      }
      this.emitHud();
    });
  }

  private rebuildCityBuildings(): void {
    while (this.dynamicBuildingsGroup.children.length > 0) {
      this.dynamicBuildingsGroup.remove(this.dynamicBuildingsGroup.children[0]);
    }
    this.buildingColliders = [];
    this.buildingMeshesForCamera = [];
    this.enterableViews = [];

    for (const s of this.structures) {
      if (s.enterable) {
        const view = createEnterableBuildingModel(s, this.textures);
        this.dynamicBuildingsGroup.add(view.group);
        this.enterableViews.push(view);
        const wallBoxes = buildEnterableBuildingWallColliders(s);
        this.buildingColliders.push(...wallBoxes);
      } else {
        const mesh = createBuildingModel(s, this.textures);
        this.dynamicBuildingsGroup.add(mesh);
        this.buildingMeshesForCamera.push(mesh);

        const hw = s.width * 0.52;
        const hd = s.depth * 0.52;
        this.buildingColliders.push({
          id: s.id,
          minX: s.x - hw,
          maxX: s.x + hw,
          minZ: s.z - hd,
          maxZ: s.z + hd,
        });
      }
    }
  }

  private resetEntitiesForDistrict(): void {
    for (const v of this.vehicles) this.scene.remove(v.rig.root);
    for (const n of this.npcs) this.scene.remove(n.rig.root);
    this.vehicles = [];
    this.npcs = [];

    this.activeVehicle = null;
    this.nearbyVehicle = null;
    this.currentInterior = null;
    this.playerX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.playerZ = 26;
    this.playerYaw = Math.PI;
    this.camYaw = Math.PI;
    this.playerSpeed = 0;
    this.playerHealth = this.maxHealth;
    this.playerArmor = 50;
    this.playerStamina = 100;
    this.equippedWeapon = 'pistol';
    this.ammoBag = createInitialAmmoBag();
    this.wanted = { heat: 0, stars: 0, cooldownTimer: 0 };
    this.isWasted = false;
    this.wastedDelayTimer = 0;
    this.playerRig.root.visible = true;
    this.playerRig.root.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;

    // Signature vehicles across Colombo
    this.spawnVehicle('veh-hero-tuktuk', 'tuktuk', 0xd62828, 2.1, 21.2, Math.PI, 'z', 2.1, -1, 0);
    this.spawnVehicle('veh-tuktuk-2', 'tuktuk', 0x168a5c, 41, 14, Math.PI, 'z', 41, -1, 11);
    this.spawnVehicle('veh-tuktuk-3', 'tuktuk', 0xf59e0b, -4.2, 16, 0, 'z', -4.2, 1, 0);
    this.spawnVehicle('veh-coupe-gold', 'sedan', 0xe6a622, -3.2, -10, 0, 'z', -3.2, 1, 15);
    this.spawnVehicle('veh-coupe-blue', 'sedan', 0x1d68b8, -24, 3.2, Math.PI / 2, 'x', 3.2, 1, 14);
    this.spawnVehicle('veh-bus-1', 'bus', 0xb8242a, -40.8, -28, 0, 'z', -40.8, 1, 10.5);
    this.spawnVehicle('veh-police-1', 'police', 0xf2f4f8, 28, -40.8, -Math.PI / 2, 'x', -40.8, -1, 13);
    this.spawnVehicle('veh-police-2', 'police', 0xf2f4f8, 47.2, -35, 0, 'z', 47.2, 1, 12.5);

    // Citizens strolling Colombo sidewalks & Galle Face beach
    const citizenPalettes = [
      { shirt: 0xf4a261, pants: 0x2b2d42, skin: 0x9b6847 },
      { shirt: 0xe76f51, pants: 0x1f2937, skin: 0x855538 },
      { shirt: 0xf1faee, pants: 0x3d405b, skin: 0xab7754 },
      { shirt: 0x2a9d8f, pants: 0x23262f, skin: 0x7c4f33 },
      { shirt: 0xe9c46a, pants: 0x2f3e46, skin: 0x9e6d4b },
    ];
    const citizenCoords: [number, number][] = [
      [-8.5, 16],
      [8.5, 8],
      [-8.5, -14],
      [8.5, -24],
      [-51, 12],
      [-51, -18],
      [-70, 20],
      [35.5, 18],
      [-35.5, 22],
      [18, 36],
      [-18, -36],
    ];
    citizenCoords.forEach(([cx, cz], i) => {
      const pal = citizenPalettes[i % citizenPalettes.length];
      this.spawnNpc(`cit-${i}`, 'citizen', cx, cz, pal.shirt, pal.pants, pal.skin);
    });

    // Rival Gang Enforcers guarding Pettah Bazaar
    this.spawnNpc('enf-1', 'enforcer', 26, 20, 0x9e1c24, 0x1b1b20, 0x8a583b);
    this.spawnNpc('enf-2', 'enforcer', 36, 24, 0x9e1c24, 0x1b1b20, 0x7c4d32);
    this.spawnNpc('enf-3', 'enforcer', 32, 37, 0x9e1c24, 0x1b1b20, 0x946244);

    // Colombo Police Force
    this.spawnNpc('cop-constable-1', 'constable', 52, 16, 0x7b7457, 0x454a36, 0x8f5e41);
    this.spawnNpc('cop-tactical-1', 'tactical', 52, 28, 0x1d3557, 0x162235, 0x8d5b3e);
    this.spawnNpc('cop-tactical-2', 'tactical', -34, -34, 0x1d3557, 0x162235, 0x986648);
  }

  private spawnVehicle(
    id: string,
    kind: VehicleKind,
    color: number,
    x: number,
    z: number,
    yaw: number,
    aiLaneAxis: 'x' | 'z',
    aiLaneCoord: number,
    aiDir: 1 | -1,
    aiSpeed: number,
  ): VehicleEntity {
    const rig = createVehicleModel(kind, color, this.textures.contactShadowMap);
    rig.root.position.set(x, getTerrainHeight(x, z), z);
    rig.root.rotation.y = yaw;
    this.scene.add(rig.root);

    const veh: VehicleEntity = {
      id,
      kind,
      rig,
      x,
      z,
      yaw,
      speed: 0,
      steerAngle: 0,
      wheelSpin: 0,
      isPlayerDriven: false,
      aiLaneAxis,
      aiLaneCoord,
      aiDir,
      aiSpeed,
      health: 100,
    };
    this.vehicles.push(veh);
    return veh;
  }

  private spawnNpc(
    id: string,
    archetype: NpcArchetype,
    x: number,
    z: number,
    shirtColor: number,
    pantsColor: number,
    skinColor: number,
  ): NpcEntity {
    const rig = createHumanModel(
      { role: archetype, shirtColor, pantsColor, skinColor },
      this.textures.contactShadowMap,
    );
    rig.root.position.set(x, getTerrainHeight(x, z), z);
    this.scene.add(rig.root);

    const maxHp = archetype === 'citizen' ? 40 : archetype === 'tactical' ? 75 : 65;
    const npc: NpcEntity = {
      id,
      archetype,
      rig,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw: Math.random() * Math.PI * 2,
      hp: maxHp,
      maxHp,
      gaitPhase: Math.random() * 6,
      hitFlashTimer: 0,
      koTimer: 0,
      dead: false,
      homeX: x,
      homeZ: z,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 2,
      attackState: 'idle',
      attackTimer: 0,
      hasAttackToken: false,
      lungeDirX: 0,
      lungeDirZ: 1,
    };
    this.npcs.push(npc);
    return npc;
  }

  private setupMission(index: number): void {
    const completed = this.mission ? this.mission.completedCount : 0;
    const slot = index % 3;

    if (slot === 0) {
      const gmpStructs = this.structures.filter((s) => s.source === 'google_maps');
      const target =
        index >= 3 && gmpStructs.length > 0
          ? gmpStructs[index % gmpStructs.length]
          : this.structures.find((s) => s.id === 'lm-lotus') ?? this.structures[0];
      const tx = target ? Math.max(-44, Math.min(44, target.x - 10)) : 8;
      const tz = target ? Math.max(-44, Math.min(44, target.z + 10)) : -24;
      this.mission = {
        index,
        title: 'Galle Face Express',
        objective: `Drive or walk to ${target?.name ?? 'Lotus Spire Plaza'} (or visit Pettah Armory!)`,
        type: 'drive_to',
        targetX: tx,
        targetZ: tz,
        targetLabel: target?.name ?? 'Lotus Spire Plaza',
        rewardLkr: 3500 + index * 500,
        remainingTargets: 1,
        completedCount: completed,
      };
    } else if (slot === 1) {
      const livingEnf = this.npcs.filter((n) => n.archetype === 'enforcer' && !n.dead);
      if (livingEnf.length === 0) {
        this.spawnNpc(`enf-w${index}-1`, 'enforcer', 26, 20, 0x9e1c24, 0x1b1b20, 0x8a583b);
        this.spawnNpc(`enf-w${index}-2`, 'enforcer', 36, 24, 0x9e1c24, 0x1b1b20, 0x7c4d32);
      }
      const rem = this.npcs.filter((n) => n.archetype === 'enforcer' && !n.dead).length;
      this.mission = {
        index,
        title: 'Pettah Contraband Takedown',
        objective: `Clear ${rem} Rival Enforcers [Click/J Fire · 1-5 Weapons]`,
        type: 'clear_enforcers',
        targetX: 30,
        targetZ: 22,
        targetLabel: 'Pettah Bazaar Drop',
        rewardLkr: 5000 + index * 500,
        remainingTargets: rem,
        completedCount: completed,
      };
    } else {
      this.wanted = stepWantedSystem(this.wanted, 0, 130, true);
      this.mission = {
        index,
        title: 'Colombo Monsoon Run',
        objective: 'Lose Police pursuit & deliver stash to Galle Face Coast',
        type: 'drive_to',
        targetX: -44,
        targetZ: 22,
        targetLabel: 'Galle Face Promenade',
        rewardLkr: 6500 + index * 500,
        remainingTargets: 1,
        completedCount: completed,
      };
    }

    this.beaconGroup.position.set(
      this.mission.targetX,
      getTerrainHeight(this.mission.targetX, this.mission.targetZ),
      this.mission.targetZ,
    );
  }

  public setCustomWaypoint(struct: StructureRecord): void {
    const tx = Math.max(-68, Math.min(92, struct.x));
    const tz = Math.max(-88, Math.min(88, struct.z));
    this.mission = {
      ...this.mission,
      title: `GPS Route: ${struct.name}`,
      objective: struct.enterable
        ? `Walk inside ${struct.name} through glowing entrance`
        : `Navigate to ${struct.name}`,
      type: 'drive_to',
      targetX: tx,
      targetZ: tz,
      targetLabel: struct.name,
      remainingTargets: 1,
    };
    this.beaconGroup.position.set(tx, getTerrainHeight(tx, tz), tz);
    this.showBanner('GPS WAYPOINT SET', struct.name, 2.2);
    this.emitHud();
  }

  // --- Accessible Weather, Weapon, Interior & Phone APIs ---
  public cycleWeather(): WeatherMode {
    const next = getNextWeatherMode(this.weather.mode);
    this.setWeather(next, this.weather.autoCycle);
    return next;
  }

  public setWeather(mode: WeatherMode, autoCycle?: boolean): void {
    this.weather = setWeatherMode(this.weather, mode, autoCycle);
    const label =
      mode === 'sunny'
        ? 'Colombo Golden Sun'
        : mode === 'overcast'
          ? 'Tropical Cloud Cover'
          : 'Colombo Monsoon Rain';
    this.showBanner('COLOMBO WEATHER', label, 2.0);
    this.emitHud();
  }

  public toggleWeatherAutoCycle(): void {
    this.weather = { ...this.weather, autoCycle: !this.weather.autoCycle };
    this.emitHud();
  }

  public selectWeapon(id: WeaponId): void {
    if (this.equippedWeapon === id) return;
    this.equippedWeapon = id;
    this.audio.playImpact('light');
    this.emitHud();
  }

  public cycleWeapon(dir: 1 | -1): void {
    const idx = WEAPON_SPECS.findIndex((w) => w.id === this.equippedWeapon);
    const next = WEAPON_SPECS[(idx + dir + WEAPON_SPECS.length) % WEAPON_SPECS.length];
    this.selectWeapon(next.id);
  }

  public triggerPrimaryAttack(): void {
    if (this.phase !== 'playing' || this.isWasted || this.activeVehicle) return;
    if (this.weaponCooldown > 0) return;

    const spec = WEAPON_BY_ID[this.equippedWeapon];
    const ammoRes = consumeWeaponAmmo(this.equippedWeapon, this.ammoBag);
    if (!ammoRes.fired) {
      this.showBanner('OUT OF AMMO', 'Visit Pettah Tactical Armory or press [B] Phone', 1.8);
      this.audio.playImpact('light');
      return;
    }

    this.ammoBag = ammoRes.nextAmmo;
    this.weaponCooldown = spec.cooldown;
    this.attackAnimDuration = Math.max(0.16, spec.cooldown * 0.9);
    this.attackAnimTimer = this.attackAnimDuration;
    this.meleeHitApplied = false;
    this.audio.playWeaponFire(spec.id);

    if (spec.kind === 'ranged') {
      this.fireRangedWeapon(spec.id);
    }
    this.emitHud();
  }

  private fireRangedWeapon(weaponId: WeaponId): void {
    const spec = WEAPON_BY_ID[weaponId];
    this.muzzleFlashTimer = 0.065;
    const shakeScale = this.accessibility.reducedShake ? 0.25 : 1;
    this.camTrauma = Math.min(
      1,
      this.camTrauma + (weaponId === 'shotgun' ? 0.34 : weaponId === 'smg' ? 0.1 : 0.16) * shakeScale,
    );

    // Optional accessible soft auto-aim toward closest living NPC inside forward cone
    let aimYaw = this.playerYaw;
    if (this.accessibility.autoAim) {
      let bestScore = Infinity;
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        const dx = npc.x - this.playerX;
        const dz = npc.z - this.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > spec.range || dist < 0.5) continue;
        const toNpcYaw = Math.atan2(dx, dz);
        const angDiff = Math.abs(shortestAngleDelta(this.playerYaw, toNpcYaw));
        const maxCone = npc.archetype === 'citizen' ? 0.14 : 0.44;
        if (angDiff < maxCone) {
          const score = dist + angDiff * 14 - (npc.archetype !== 'citizen' ? 8 : 0);
          if (score < bestScore) {
            bestScore = score;
            aimYaw = toNpcYaw;
          }
        }
      }
      this.playerYaw = aimYaw;
    }

    const originX = this.playerX + Math.sin(aimYaw) * 0.6;
    const originY = this.playerY + 1.32;
    const originZ = this.playerZ + Math.cos(aimYaw) * 0.6;

    // Firing firearms in Colombo alerts police slightly
    this.wanted = stepWantedSystem(this.wanted, 0, weaponId === 'shotgun' ? 22 : 10, false);

    for (let p = 0; p < spec.pellets; p++) {
      const pelletYaw = aimYaw + (Math.random() - 0.5) * spec.spread * 2;
      const dirX = Math.sin(pelletYaw);
      const dirZ = Math.cos(pelletYaw);

      let hitDist = spec.range;
      let hitNpc: NpcEntity | null = null;

      // Test ray against living NPC cylinders
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        const toX = npc.x - originX;
        const toZ = npc.z - originZ;
        const proj = toX * dirX + toZ * dirZ;
        if (proj <= 0 || proj >= hitDist) continue;
        const perpSq = toX * toX + toZ * toZ - proj * proj;
        if (perpSq < 0.68 * 0.68) {
          hitDist = proj;
          hitNpc = npc;
        }
      }

      const endX = originX + dirX * hitDist;
      const endY = originY + (Math.random() - 0.5) * 0.18;
      const endZ = originZ + dirZ * hitDist;
      this.spawnBulletTracer(originX, originY, originZ, endX, endY, endZ, 0xffe066);

      if (hitNpc) {
        this.damageNpc(hitNpc, spec.damage, dirX * 6.5, dirZ * 6.5);
      } else {
        this.spawnParticles(endX, Math.max(0.3, endY - 0.3), endZ, 3, 0xffd670, 3.2, 0.55);
      }
    }
  }

  public interactInsideBuilding(): void {
    if (!this.currentInterior) return;
    const kind = this.currentInterior.enterable;
    this.audio.unlock();

    if (kind === 'armory') {
      const cost = this.cashLkr >= 600 ? 600 : 0;
      this.cashLkr -= cost;
      this.ammoBag = refillAllAmmo(this.ammoBag);
      this.playerArmor = this.maxArmor;
      this.audio.playCashChime();
      this.spawnParticles(this.playerX, 1.3, this.playerZ, 16, 0x38bdf8, 5, 0.9);
      this.showBanner(
        'ARMORY RESUPPLIED',
        cost > 0 ? 'All Weapons Reloaded + Full Kevlar (-LKR 600)' : 'Free Starter Resupply + Full Kevlar',
        2.4,
      );
    } else if (kind === 'cafe_shop') {
      const cost = this.cashLkr >= 350 ? 350 : 0;
      this.cashLkr -= cost;
      this.playerHealth = this.maxHealth;
      this.playerStamina = 100;
      this.wanted = stepWantedSystem(this.wanted, 0, -100, false);
      this.audio.playCashChime();
      this.spawnParticles(this.playerX, 1.3, this.playerZ, 16, 0x4fd18b, 5, 0.9);
      this.showBanner('CEYLON KOTTU & TEA', 'Full Health & Stamina Restored!', 2.4);
    } else if (kind === 'safehouse') {
      this.playerHealth = this.maxHealth;
      this.playerStamina = 100;
      this.wanted = { heat: 0, stars: 0, cooldownTimer: 0 };
      this.outfitIndex = (this.outfitIndex + 1) % OUTFIT_COLORS.length;
      this.playerRig.shirtMaterial.color.setHex(OUTFIT_COLORS[this.outfitIndex]);
      this.audio.playCashChime();
      this.spawnParticles(this.playerX, 1.4, this.playerZ, 20, 0xf5b942, 6, 1.0);
      this.showBanner('SAFEHOUSE RESTED', 'Wanted Stars Cleared · New Colombo Outfit Equipped', 2.6);
    } else if (kind === 'bank_vault') {
      if (this.bankHeistCooldown > 0) {
        this.showBanner(
          'VAULT LOCKED',
          `Security reset in ${Math.ceil(this.bankHeistCooldown)}s`,
          1.8,
        );
      } else {
        this.bankHeistCooldown = 25;
        this.cashLkr += 12000;
        this.score += 2500;
        this.wanted = stepWantedSystem(this.wanted, 0, 280, true);
        this.audio.playCashChime();
        this.spawnParticles(this.playerX, 1.5, this.playerZ, 28, 0xf5b942, 8, 1.15);
        this.showBanner('COLOMBO BANK HEIST!', '+LKR 12,000 Looted · 3-Star Police Dispatch!', 3.0);
      }
    }
    this.emitHud();
  }

  public callVehicleDelivery(kind: 'tuktuk' | 'sedan'): void {
    const cost = this.cashLkr >= 500 ? 500 : 0;
    this.cashLkr -= cost;
    const spawnX = Math.max(-52, Math.min(58, this.playerX + Math.sin(this.playerYaw) * 4.5));
    const spawnZ = Math.max(-78, Math.min(78, this.playerZ + Math.cos(this.playerYaw) * 4.5));
    const color = kind === 'tuktuk' ? 0xd62828 : 0xf5b942;
    this.spawnVehicle(
      `veh-deliv-${Date.now()}`,
      kind,
      color,
      spawnX,
      spawnZ,
      this.playerYaw,
      'z',
      spawnX,
      1,
      0,
    );
    this.audio.playHorn(kind === 'tuktuk');
    this.showBanner(
      'VEHICLE DELIVERED',
      `${kind === 'tuktuk' ? 'Colombo Tuk-Tuk' : 'GT Coupe'} parked ahead!`,
      2.2,
    );
    this.emitHud();
  }

  public buyRemoteSupply(item: 'ammo' | 'armor' | 'heal' | 'fixer'): void {
    this.audio.unlock();
    if (item === 'ammo') {
      const cost = this.cashLkr >= 700 ? 700 : 0;
      this.cashLkr -= cost;
      this.ammoBag = refillAllAmmo(this.ammoBag);
      this.audio.playCashChime();
      this.showBanner('AMMO DROP', 'All Firearms Reloaded', 2.0);
    } else if (item === 'armor') {
      const cost = this.cashLkr >= 800 ? 800 : 0;
      this.cashLkr -= cost;
      this.playerArmor = this.maxArmor;
      this.audio.playCashChime();
      this.showBanner('KEVLAR EQUIPPED', '100% Tactical Armor Active', 2.0);
    } else if (item === 'heal') {
      const cost = this.cashLkr >= 400 ? 400 : 0;
      this.cashLkr -= cost;
      this.playerHealth = this.maxHealth;
      this.playerStamina = 100;
      this.audio.playCashChime();
      this.showBanner('MEDKIT APPLIED', 'Health & Stamina 100%', 2.0);
    } else if (item === 'fixer') {
      const cost = this.cashLkr >= 1200 ? 1200 : 0;
      this.cashLkr -= cost;
      this.wanted = { heat: 0, stars: 0, cooldownTimer: 0 };
      this.audio.playCashChime();
      this.showBanner('HEAT CLEARED', 'Colombo Fixer Called Off Police', 2.2);
    }
    this.emitHud();
  }

  public teleportToStructure(structureId: string): void {
    const struct = this.structures.find((s) => s.id === structureId);
    if (!struct) return;
    // Exit vehicle if inside one
    if (this.activeVehicle) {
      this.activeVehicle.isPlayerDriven = false;
      this.activeVehicle = null;
      this.playerRig.root.visible = true;
    }

    const facing = struct.doorFacing ?? 'west';
    let tx = struct.x;
    let tz = struct.z;
    let yaw = Math.PI;
    if (struct.enterable) {
      // Step right inside the open doorway foyer facing the furnished interior counter!
      const insideOffset = 1.6;
      if (facing === 'west') {
        tx = struct.x - struct.width * 0.5 + insideOffset;
        yaw = Math.PI / 2;
      } else if (facing === 'east') {
        tx = struct.x + struct.width * 0.5 - insideOffset;
        yaw = -Math.PI / 2;
      } else if (facing === 'north') {
        tz = struct.z - struct.depth * 0.5 + insideOffset;
        yaw = 0;
      } else {
        tz = struct.z + struct.depth * 0.5 - insideOffset;
        yaw = Math.PI;
      }
    } else {
      tx = Math.max(-52, Math.min(58, struct.x - struct.width * 0.5 - 3));
      tz = Math.max(-78, Math.min(78, struct.z));
      yaw = Math.PI / 2;
    }

    this.playerX = tx;
    this.playerZ = tz;
    this.playerY = getTerrainHeight(tx, tz);
    this.playerYaw = yaw;
    this.camYaw = yaw;
    this.updateInteriorDetection();
    this.snapCameraBehindPlayer();
    this.showBanner(
      struct.enterable ? struct.name.toUpperCase() : 'FAST TRAVEL',
      struct.enterable ? 'Press [E] to use interior service · Walk out doorway anytime' : struct.name,
      2.4,
    );
    this.emitHud();
  }

  public updateAccessibility(patch: Partial<AccessibilitySettings>): void {
    this.accessibility = { ...this.accessibility, ...patch };
    this.emitHud();
  }

  public getCurrentAtmosphere(): WeatherAtmosphere {
    return getBlendedAtmosphere(this.weather);
  }

  public getLightningFlash(): number {
    return this.weather.lightningFlash;
  }

  private showBanner(title: string, subtitle: string, seconds = 2.5): void {
    this.bannerTitle = title;
    this.bannerSubtitle = subtitle;
    this.bannerTimer = seconds;
  }

  private snapCameraBehindPlayer(): void {
    const anchorX = this.playerX;
    const anchorY = this.playerY + 1.5;
    const anchorZ = this.playerZ;
    this.camera.position.set(
      anchorX - Math.sin(this.camYaw) * 5.6,
      anchorY + 1.55,
      anchorZ - Math.cos(this.camYaw) * 5.6,
    );
    _camLookCur.set(
      anchorX + Math.sin(this.camYaw) * 3.0,
      anchorY,
      anchorZ + Math.cos(this.camYaw) * 3.0,
    );
    this.camera.lookAt(_camLookCur);
  }

  // --- Public Game State Transitions ---
  public startGame(): void {
    this.audio.unlock();
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.snapCameraBehindPlayer();
    this.showBanner('COLOMBO OPEN WORLD', 'Walk into Armory/Café · [1-5] Weapons · [V] Weather · [B] Phone', 2.8);
    this.emitHud();
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    document.body.dataset.state = 'paused';
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.audio.silenceLoops();
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.audio.unlock();
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.emitHud();
  }

  public restartGame(): void {
    this.audio.unlock();
    this.cashLkr = 3200;
    this.score = 0;
    this.elapsedSeconds = 0;
    this.bankHeistCooldown = 0;
    this.resetEntitiesForDistrict();
    this.setupMission(0);
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.snapCameraBehindPlayer();
    this.showBanner('NEW RUN — COLOMBO', 'Galle Face Drive · Ready', 1.8);
    this.emitHud();
  }

  public returnToTitle(): void {
    this.phase = 'title';
    document.body.dataset.state = 'title';
    this.audio.silenceLoops();
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.emitHud();
  }

  public toggleMute(): boolean {
    this.audio.unlock();
    const m = this.audio.toggleMute();
    this.emitHud();
    return m;
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public getDistrict(): DistrictPreset {
    return this.district;
  }

  public getStructures(): StructureRecord[] {
    return this.structures;
  }

  public getPlayerLatLng(): { lat: number; lng: number } {
    return worldToLatLng(this.playerX, this.playerZ, this.district.center);
  }

  // --- Input Binding ---
  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
      if (this.phase === 'playing') e.preventDefault();
    }
    if (!this.keysHeld.has(code)) {
      this.keysJustPressed.add(code);
    }
    this.keysHeld.add(code);

    if (this.phase === 'title' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      this.startGame();
      return;
    }

    if (code === 'KeyM') {
      this.toggleMute();
    } else if (code === 'KeyV' && this.phase === 'playing') {
      this.cycleWeather();
    } else if (this.phase === 'playing') {
      if (code === 'Digit1') this.selectWeapon('fists');
      else if (code === 'Digit2') this.selectWeapon('bat');
      else if (code === 'Digit3') this.selectWeapon('pistol');
      else if (code === 'Digit4') this.selectWeapon('smg');
      else if (code === 'Digit5') this.selectWeapon('shotgun');
      else if (code === 'Tab') this.cycleWeapon(1);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
    if (e.code === 'Space' && !this.activeVehicle && this.playerVy > 2.2) {
      this.playerVy *= 0.48;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.phase !== 'playing' || this.activeVehicle) return;
    if (e.target !== this.renderer.domElement) return;
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  };

  private onBlur = (): void => {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.pointerDragActive = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    if (e.target !== this.renderer.domElement) return;
    this.audio.unlock();
    if (e.button === 0 || e.button === 2) {
      this.pointerDragActive = true;
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;
      this.pointerDownTime = performance.now();
      this.pointerDragged = false;
      this.lastPointerX = e.clientX;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointerDragActive || this.phase !== 'playing') return;
    const dx = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    if (Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY) > 6) {
      this.pointerDragged = true;
    }
    this.camYaw -= dx * 0.0055;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (
      this.pointerDragActive &&
      e.button === 0 &&
      !this.pointerDragged &&
      performance.now() - this.pointerDownTime < 260 &&
      this.phase === 'playing'
    ) {
      this.triggerPrimaryAttack();
    }
    this.pointerDragActive = false;
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private handleResize(): void {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = Math.max(1, this.mountEl.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // --- Main Frame Loop with Software-WebGL `afterDraw()` Pacing ---
  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.stepFrame(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private applyAtmosphereToScene(dt: number): WeatherAtmosphere {
    const stepped = stepWeatherState(this.weather, dt, Math.random());
    this.weather = stepped.state;
    if (stepped.thunderTriggered && this.phase === 'playing') {
      this.audio.playThunder();
    }
    if (stepped.transitionedMode && this.phase === 'playing') {
      const lbl =
        stepped.transitionedMode === 'sunny'
          ? 'Colombo Golden Sun'
          : stepped.transitionedMode === 'overcast'
            ? 'Tropical Clouds Rolling In'
            : 'Colombo Monsoon Storm!';
      this.showBanner('WEATHER SHIFT', lbl, 2.2);
    }

    const atmo = getBlendedAtmosphere(this.weather);
    const flashBoost = this.weather.lightningFlash * 1.4;

    _colorScratch.setHex(atmo.skyHex);
    if (flashBoost > 0.05) {
      _colorScratch.lerp(new THREE.Color(0xdbeafe), Math.min(0.45, flashBoost * 0.3));
    }
    (this.scene.background as THREE.Color).copy(_colorScratch);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(_colorScratch);
    fog.density = atmo.fogDensity;

    this.sunLight.color.setHex(atmo.sunHex);
    this.sunLight.intensity = atmo.sunIntensity + flashBoost;
    this.hemiLight.color.setHex(atmo.hemiSkyHex);
    this.hemiLight.groundColor.setHex(atmo.hemiGroundHex);
    this.hemiLight.intensity = atmo.hemiIntensity + flashBoost * 0.4;
    this.oceanMat.color.setHex(atmo.oceanHex);
    this.renderer.toneMappingExposure = atmo.exposure;
    this.sunDiscMat.opacity = atmo.sunDiscOpacity;
    this.sunDisc.visible = atmo.sunDiscOpacity > 0.04;

    // Wet shiny Colombo asphalt during Monsoon Rain!
    for (const rm of this.roadMaterials) {
      rm.roughness = atmo.asphaltRoughness;
    }

    const indoorDampen = this.currentInterior ? 0.14 : 1;
    this.onAtmosphereFrame?.(dt, atmo, this.weather.lightningFlash, indoorDampen);
    return atmo;
  }

  private stepFrame(dt: number): void {
    this.waterTime += dt;
    const atmo = this.applyAtmosphereToScene(dt);

    // Animate Indian Ocean waves, Oruwa fishing boats, traffic lights, and entrance beacons
    this.oceanMesh.position.y = -0.45 + Math.sin(this.waterTime * 1.4) * 0.09;
    this.worldProps.beiraWater.position.y = 0.04 + Math.sin(this.waterTime * 1.8) * 0.025;
    for (const b of this.worldProps.boats) {
      b.mesh.position.y = b.baseY + Math.sin(this.waterTime * 1.6 + b.phase) * 0.14;
      b.mesh.rotation.z = Math.sin(this.waterTime * 1.3 + b.phase) * 0.06;
    }
    const greenPhase = Math.floor(this.waterTime / 6) % 2 === 0;
    for (const tl of this.worldProps.trafficLights) {
      tl.red.emissiveIntensity = greenPhase ? 0.15 : 1.7;
      tl.green.emissiveIntensity = greenPhase ? 1.7 : 0.15;
    }

    this.beaconRing.rotation.z += dt * 1.6;
    const pulse = 1 + Math.sin(this.waterTime * 4) * 0.1;
    this.beaconRing.scale.set(pulse, pulse, 1);

    for (const v of this.enterableViews) {
      v.doorBeacon.scale.set(pulse, pulse, 1);
      v.interiorMarker.rotation.z += dt * 1.4;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerTitle = null;
        this.bannerSubtitle = null;
      }
    }
    if (this.bankHeistCooldown > 0) {
      this.bankHeistCooldown = Math.max(0, this.bankHeistCooldown - dt);
    }

    this.camTrauma = Math.max(0, this.camTrauma - dt * 2.4);
    this.updateTracers(dt);

    if (this.phase === 'title') {
      this.titleOrbitAngle += dt * 0.14;
      const cx = Math.cos(this.titleOrbitAngle) * 66 + 10;
      const cz = Math.sin(this.titleOrbitAngle) * 62 + 12;
      this.camera.position.set(cx, 32 + Math.sin(this.titleOrbitAngle * 1.2) * 3.5, cz);
      this.camera.lookAt(12, 20, -18);
      this.updateAmbientTraffic(dt);
      this.updateParticles(dt);
      this.keysJustPressed.clear();
      return;
    }

    if (this.phase !== 'playing') {
      this.keysJustPressed.clear();
      return;
    }

    if (this.isWasted) {
      this.wastedDelayTimer -= dt;
      this.updateParticles(dt);
      this.updateCamera(dt);
      if (this.wastedDelayTimer <= 0) {
        this.phase = 'gameover';
        document.body.dataset.state = 'gameover';
        this.audio.silenceLoops();
        this.emitHud();
      }
      this.keysJustPressed.clear();
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateCamera(dt);
      this.keysJustPressed.clear();
      return;
    }

    this.elapsedSeconds += dt;
    this.weaponCooldown = Math.max(0, this.weaponCooldown - dt);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);

    // 1. Edge-triggered player actions
    this.handleActionTriggers();

    // Continuous SMG automatic fire while holding J
    if (
      this.equippedWeapon === 'smg' &&
      this.keysHeld.has('KeyJ') &&
      !this.activeVehicle &&
      this.weaponCooldown <= 0
    ) {
      this.triggerPrimaryAttack();
    }

    // 2. Advance player
    if (this.activeVehicle) {
      this.updatePlayerDriving(dt);
    } else {
      this.updatePlayerOnFoot(dt);
    }

    // 3. Check seamless walk-in building interiors & hide roof smoothly when inside
    this.updateInteriorDetection();

    // 4. Advance pickups, traffic, NPCs, wanted, missions, particles, camera
    this.updatePickups(dt);
    this.updateAmbientTraffic(dt);
    this.updateNpcs(dt);
    this.updateWantedAndMission(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    // 5. Continuous procedural Web Audio (engine + siren + monsoon rain!)
    const speedNorm = this.activeVehicle
      ? Math.min(1, Math.abs(this.activeVehicle.speed) / 28)
      : 0;
    this.audio.updateContinuous(
      dt,
      Boolean(this.activeVehicle),
      speedNorm,
      this.activeVehicle?.kind === 'tuktuk',
      this.wanted.stars,
      atmo.rainIntensity,
      Boolean(this.currentInterior),
    );

    this.sunLight.position.set(this.playerX - 48, 76, this.playerZ + 38);
    this.sunLight.target.position.set(this.playerX, 0, this.playerZ);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.keysJustPressed.clear();
  }

  private updateInteriorDetection(): void {
    let found: StructureRecord | null = null;
    if (!this.activeVehicle) {
      for (const v of this.enterableViews) {
        const inside = isPointInsideStructure(this.playerX, this.playerZ, v.struct);
        v.roofGroup.visible = !inside;
        if (inside) found = v.struct;
      }
    } else {
      for (const v of this.enterableViews) {
        v.roofGroup.visible = true;
      }
    }

    if (found?.id !== this.currentInterior?.id) {
      this.currentInterior = found;
      if (found) {
        this.showBanner(found.name.toUpperCase(), 'Press [E] to use interior service', 2.0);
      }
      this.emitHud();
    }
  }

  private updatePickups(dt: number): void {
    for (const pk of this.pickups) {
      if (pk.respawnTimer > 0) {
        pk.respawnTimer -= dt;
        if (pk.respawnTimer <= 0) {
          pk.mesh.visible = true;
        }
        continue;
      }

      const spin = pk.mesh.getObjectByName('spin');
      if (spin) {
        spin.rotation.y += dt * 2.2;
        spin.position.y = 0.85 + Math.sin(this.waterTime * 3 + pk.x) * 0.12;
      }

      if (Math.hypot(pk.x - this.playerX, pk.z - this.playerZ) < 1.85) {
        pk.mesh.visible = false;
        pk.respawnTimer = 40;
        this.audio.playCashChime();

        if (pk.kind === 'cash') {
          this.cashLkr += 1500;
          this.score += 300;
          this.spawnParticles(pk.x, 1.0, pk.z, 14, 0x4fd18b, 5, 0.85);
          this.showBanner('+LKR 1,500', 'Colombo Street Stash Collected', 1.7);
        } else if (pk.kind === 'medkit') {
          this.playerHealth = Math.min(this.maxHealth, this.playerHealth + 45);
          this.spawnParticles(pk.x, 1.0, pk.z, 14, 0xef4444, 5, 0.85);
          this.showBanner('MEDKIT COLLECTED', '+45 Health Restored', 1.7);
        } else if (pk.kind === 'armor') {
          this.playerArmor = Math.min(this.maxArmor, this.playerArmor + 50);
          this.spawnParticles(pk.x, 1.0, pk.z, 14, 0x38bdf8, 5, 0.85);
          this.showBanner('KEVLAR ARMOR', '+50 Tactical Armor', 1.7);
        } else {
          this.ammoBag = refillAllAmmo(this.ammoBag);
          this.spawnParticles(pk.x, 1.0, pk.z, 14, 0xf5b942, 5, 0.85);
          this.showBanner('AMMO CRATE', 'Pistol, SMG & Shotgun Reloaded', 1.7);
        }
        this.emitHud();
      }
    }
  }

  private handleActionTriggers(): void {
    // Interior interaction [E] takes priority when inside a walk-in building
    if (this.keysJustPressed.has('KeyE') && this.currentInterior && !this.activeVehicle) {
      this.interactInsideBuilding();
      return;
    }

    // Enter / Exit nearest vehicle with F (or E outside)
    if (this.keysJustPressed.has('KeyF') || (this.keysJustPressed.has('KeyE') && !this.currentInterior)) {
      if (this.activeVehicle) {
        const v = this.activeVehicle;
        v.isPlayerDriven = false;
        v.speed *= 0.35;
        this.activeVehicle = null;
        this.playerX = v.x - Math.cos(v.yaw) * (v.rig.halfWidth + 1.15);
        this.playerZ = v.z + Math.sin(v.yaw) * (v.rig.halfWidth + 1.15);
        this.playerY = getTerrainHeight(this.playerX, this.playerZ);
        this.playerYaw = v.yaw;
        this.playerRig.root.visible = true;
        this.audio.playImpact('light');
        this.emitHud();
      } else if (this.nearbyVehicle) {
        const v = this.nearbyVehicle;
        v.isPlayerDriven = true;
        this.activeVehicle = v;
        this.playerX = v.x;
        this.playerZ = v.z;
        this.camYaw = v.yaw;
        if (v.kind === 'police') {
          this.wanted = stepWantedSystem(this.wanted, 0, 120, true);
          this.showBanner('WANTED!', 'Police Cruiser Hijacked', 2.0);
        }
        this.audio.playHorn(v.kind === 'tuktuk');
        this.emitHud();
      }
    }

    // Sri Lankan vehicle horn [H]
    if (this.keysJustPressed.has('KeyH') && this.activeVehicle) {
      this.audio.playHorn(this.activeVehicle.kind === 'tuktuk');
    }

    // Primary Weapon Attack / Fire [J]
    if (this.keysJustPressed.has('KeyJ') && !this.activeVehicle) {
      this.triggerPrimaryAttack();
    }

    // Jump input buffer [Space]
    if (this.keysJustPressed.has('Space') && !this.activeVehicle) {
      this.jumpBufferTimer = 0.13;
    }
  }

  private updatePlayerOnFoot(dt: number): void {
    let moveForward = 0;
    let moveRight = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveForward += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveForward -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveRight += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveRight -= 1;

    if (this.keysHeld.has('KeyQ')) this.camYaw += 2.1 * dt;
    if (this.keysHeld.has('KeyR')) this.camYaw -= 2.1 * dt;

    const sprinting =
      (this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight')) && this.playerStamina > 4;
    const maxSpd = sprinting ? 9.4 : 5.6;

    const inputLen = Math.hypot(moveForward, moveRight);
    if (inputLen > 0.01) {
      const nf = moveForward / inputLen;
      const nr = moveRight / inputLen;
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const rx = -fz;
      const rz = fx;
      const dirX = fx * nf + rx * nr;
      const dirZ = fz * nf + rz * nr;

      const targetYaw = Math.atan2(dirX, dirZ);
      this.playerYaw += shortestAngleDelta(this.playerYaw, targetYaw) * (1 - Math.exp(-12 * dt));
      this.playerSpeed += (maxSpd - this.playerSpeed) * (1 - Math.exp(-11 * dt));

      if (sprinting) {
        this.playerStamina = Math.max(0, this.playerStamina - 22 * dt);
      } else {
        this.playerStamina = Math.min(100, this.playerStamina + 14 * dt);
      }
    } else {
      this.playerSpeed *= Math.exp(-14 * dt);
      if (this.playerSpeed < 0.08) this.playerSpeed = 0;
      this.playerStamina = Math.min(100, this.playerStamina + 20 * dt);
    }

    const nextX = this.playerX + Math.sin(this.playerYaw) * this.playerSpeed * dt;
    const nextZ = this.playerZ + Math.cos(this.playerYaw) * this.playerSpeed * dt;

    const col = resolveCircleAABBCollision(nextX, nextZ, 0.5, this.buildingColliders);
    // Allow walking all the way onto Galle Face sandy beach (-76) and up eastern Cinnamon Gardens hills (+112)
    this.playerX = Math.max(-76, Math.min(WORLD_PLAYABLE_RADIUS, col.x));
    this.playerZ = Math.max(-WORLD_PLAYABLE_RADIUS, Math.min(WORLD_PLAYABLE_RADIUS, col.z));

    const groundY = getTerrainHeight(this.playerX, this.playerZ);

    if (this.playerGrounded) {
      this.coyoteTimer = 0.1;
      this.playerY = groundY;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.playerVy = 7.5;
      this.playerGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.squashY = 1.18;
      this.audio.playFootstep();
      this.spawnParticles(this.playerX, groundY + 0.1, this.playerZ, 4, 0xd9c8a9, 2.4, 0.65);
    }

    if (!this.playerGrounded) {
      this.playerVy -= 21 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= groundY) {
        this.playerY = groundY;
        this.playerVy = 0;
        this.playerGrounded = true;
        this.squashY = 0.78;
        this.audio.playFootstep();
        this.spawnParticles(this.playerX, groundY + 0.08, this.playerZ, 5, 0xd9c8a9, 2.6, 0.65);
      }
    }
    this.squashY += (1 - this.squashY) * (1 - Math.exp(-14 * dt));

    const distStep = this.playerSpeed * dt;
    this.playerGait += distStep * 2.55;
    if (this.playerGrounded && this.playerSpeed > 1.2) {
      this.stepAccum += distStep;
      if (this.stepAccum >= 1.35) {
        this.stepAccum = 0;
        this.audio.playFootstep();
      }
    }

    // Melee strike hitbox window for Fists & Ceylon Cricket Bat
    let attackProgress = 0;
    if (this.attackAnimTimer > 0) {
      this.attackAnimTimer -= dt;
      attackProgress = 1 - Math.max(0, this.attackAnimTimer) / this.attackAnimDuration;
      const spec = WEAPON_BY_ID[this.equippedWeapon];
      if (
        spec.kind === 'melee' &&
        !this.meleeHitApplied &&
        attackProgress >= 0.28 &&
        attackProgress <= 0.65
      ) {
        this.applyPlayerMeleeHit(spec.damage, spec.range);
      }
    }

    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);

    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    animateHumanPose(this.playerRig, {
      gaitPhase: this.playerGait,
      speedNorm: Math.min(1, this.playerSpeed / 7.5),
      attackProgress,
      seated: false,
      hitFlash: this.playerHitFlash > 0,
      telegraphRatio: 0,
      showAimBeam: false,
      squashY: this.squashY,
      equippedWeapon: this.equippedWeapon,
      muzzleFlashActive: this.muzzleFlashTimer > 0,
    });

    // Find closest enterable vehicle within 4.4m
    this.nearbyVehicle = null;
    let bestDist = 4.4;
    for (const v of this.vehicles) {
      const dist = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (dist < bestDist) {
        bestDist = dist;
        this.nearbyVehicle = v;
      }
    }
  }

  private applyPlayerMeleeHit(damage: number, range: number): void {
    const reachX = this.playerX + Math.sin(this.playerYaw) * (range * 0.6);
    const reachZ = this.playerZ + Math.cos(this.playerYaw) * (range * 0.6);

    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const dist = Math.hypot(npc.x - reachX, npc.z - reachZ);
      if (dist < range * 0.72) {
        this.meleeHitApplied = true;
        const knock = this.equippedWeapon === 'bat' ? 11.5 : 7.5;
        this.damageNpc(npc, damage, Math.sin(this.playerYaw) * knock, Math.cos(this.playerYaw) * knock);
        break;
      }
    }
  }

  private damageNpc(npc: NpcEntity, dmg: number, knockX: number, knockZ: number): void {
    npc.hp -= dmg;
    npc.hitFlashTimer = 0.09;
    npc.vx += knockX;
    npc.vz += knockZ;
    this.hitstopTimer = 0.038;
    const shakeScale = this.accessibility.reducedShake ? 0.25 : 1;
    this.camTrauma = Math.min(1, this.camTrauma + 0.3 * shakeScale);
    this.audio.playImpact('heavy');
    this.spawnParticles(npc.x, 1.15, npc.z, 10, 0xffd670, 5.5, 0.85);

    if (npc.archetype === 'citizen' || npc.archetype === 'constable' || npc.archetype === 'tactical') {
      this.wanted = stepWantedSystem(this.wanted, 0, 55, true);
    }

    if (npc.hp <= 0 && !npc.dead) {
      npc.dead = true;
      npc.koTimer = 0.45;
      npc.hasAttackToken = false;
      this.score += npc.archetype === 'enforcer' ? 500 : 200;
      this.cashLkr += npc.archetype === 'enforcer' ? 1200 : 350;
      this.audio.playCashChime();
      this.spawnParticles(npc.x, 1.0, npc.z, 18, 0x4fd18b, 6.2, 1.0);
    }
  }

  private updatePlayerDriving(dt: number): void {
    const v = this.activeVehicle!;
    let throttle = 0;
    let steer = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) throttle += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) throttle -= 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) steer += 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) steer -= 1;

    const handbrake = this.keysHeld.has('Space');
    const boost = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');

    const topSpeed = v.kind === 'tuktuk' ? 22 : v.kind === 'bus' ? 18 : boost ? 34 : 26;
    const accel = v.kind === 'tuktuk' ? 19 : v.kind === 'bus' ? 12 : boost ? 26 : 21;

    if (throttle > 0) {
      v.speed = Math.min(topSpeed, v.speed + accel * dt);
    } else if (throttle < 0) {
      v.speed = Math.max(-9, v.speed - accel * 1.15 * dt);
    } else {
      v.speed *= Math.exp(-(handbrake ? 4.8 : 1.7) * dt);
      if (Math.abs(v.speed) < 0.15) v.speed = 0;
    }

    if (handbrake && Math.abs(v.speed) > 6) {
      v.speed *= Math.exp(-2.6 * dt);
      this.spawnParticles(v.x, 0.18, v.z, 2, 0xd8d5cc, 2.2, 0.85);
    }

    const turnRate = v.kind === 'tuktuk' ? 2.85 : v.kind === 'bus' ? 1.65 : 2.3;
    const speedFactor = Math.min(1, Math.abs(v.speed) / 4.5);
    const reverseSign = v.speed >= 0 ? 1 : -1;
    v.steerAngle += (steer * 0.55 - v.steerAngle) * (1 - Math.exp(-12 * dt));
    v.yaw += steer * turnRate * speedFactor * reverseSign * dt;

    const nx = v.x + Math.sin(v.yaw) * v.speed * dt;
    const nz = v.z + Math.cos(v.yaw) * v.speed * dt;

    const radius = Math.max(v.rig.halfWidth, v.rig.halfLength * 0.72);
    const col = resolveCircleAABBCollision(nx, nz, radius, this.buildingColliders);
    v.x = Math.max(-65.5, Math.min(WORLD_PLAYABLE_RADIUS, col.x));
    v.z = Math.max(-WORLD_PLAYABLE_RADIUS, Math.min(WORLD_PLAYABLE_RADIUS, col.z));

    if (col.collided && Math.abs(v.speed) > 7) {
      this.hitstopTimer = 0.04;
      const shakeScale = this.accessibility.reducedShake ? 0.25 : 1;
      this.camTrauma = Math.min(
        1,
        this.camTrauma + Math.min(0.65, Math.abs(v.speed) / 28) * shakeScale,
      );
      this.audio.playImpact('heavy');
      this.spawnParticles(v.x, 0.7, v.z, 14, 0xffc857, 6.5, 0.85);
      v.speed *= -0.32;
    }

    if (Math.abs(v.speed) > 7.5) {
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        if (Math.hypot(npc.x - v.x, npc.z - v.z) < radius + 0.65) {
          this.damageNpc(npc, 80, Math.sin(v.yaw) * 12, Math.cos(v.yaw) * 12);
        }
      }
    }

    const groundY = getTerrainHeight(v.x, v.z);
    v.wheelSpin += (v.speed / 0.32) * dt;
    for (const w of v.rig.wheels) w.rotation.x = v.wheelSpin;
    for (const fp of v.rig.frontWheelPivots) fp.rotation.y = v.steerAngle;
    v.rig.chassis.rotation.z = -steer * speedFactor * (v.kind === 'tuktuk' ? 0.11 : 0.055);
    v.rig.root.position.set(v.x, groundY, v.z);
    v.rig.root.rotation.y = v.yaw;

    this.playerX = v.x;
    this.playerY = groundY;
    this.playerZ = v.z;
    this.playerYaw = v.yaw;
    if (v.kind === 'tuktuk') {
      this.playerRig.root.visible = true;
      _v3A.copy(v.rig.seatOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, v.yaw);
      this.playerRig.root.position.set(v.x + _v3A.x, groundY + _v3A.y, v.z + _v3A.z);
      this.playerRig.root.rotation.y = v.yaw;
      animateHumanPose(this.playerRig, {
        gaitPhase: 0,
        speedNorm: 0,
        attackProgress: 0,
        seated: true,
        hitFlash: this.playerHitFlash > 0,
        telegraphRatio: 0,
        showAimBeam: false,
      });
    } else {
      this.playerRig.root.visible = false;
    }

    this.camYaw += shortestAngleDelta(this.camYaw, v.yaw) * (1 - Math.exp(-3.4 * dt));
  }

  private updateAmbientTraffic(dt: number): void {
    const sirenBlink = Math.floor(this.waterTime * 8) % 2 === 0;

    for (const v of this.vehicles) {
      if (v.rig.policeRedLight && v.rig.policeBlueLight) {
        const active = this.wanted.stars > 0 || v.isPlayerDriven;
        v.rig.policeRedLight.emissiveIntensity = active ? (sirenBlink ? 2.6 : 0.25) : 0.4;
        v.rig.policeBlueLight.emissiveIntensity = active ? (sirenBlink ? 0.25 : 2.6) : 0.4;
      }

      if (v.isPlayerDriven) continue;

      if (v.kind === 'police' && this.wanted.stars >= 2 && this.phase === 'playing') {
        const dx = this.playerX - v.x;
        const dz = this.playerZ - v.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 7.5) {
          const targetYaw = Math.atan2(dx, dz);
          v.yaw += shortestAngleDelta(v.yaw, targetYaw) * (1 - Math.exp(-3.2 * dt));
          v.speed = Math.min(15.5, v.speed + 10 * dt);
        } else {
          v.speed *= Math.exp(-4 * dt);
        }
      } else if (v.aiSpeed > 0) {
        const distToPlayer = Math.hypot(this.playerX - v.x, this.playerZ - v.z);
        const shouldBrake = distToPlayer < 5.2 && !this.activeVehicle;
        const targetSpd = shouldBrake ? 0 : v.aiSpeed;
        v.speed += (targetSpd - v.speed) * (1 - Math.exp(-5 * dt));

        if (v.aiLaneAxis === 'z') {
          v.yaw = v.aiDir > 0 ? 0 : Math.PI;
          if (v.z > 88) v.aiDir = -1;
          if (v.z < -88) v.aiDir = 1;
        } else {
          v.yaw = v.aiDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (v.x > 82) v.aiDir = -1;
          if (v.x < -52) v.aiDir = 1;
        }
      } else {
        v.speed *= Math.exp(-5 * dt);
      }

      const nx = v.x + Math.sin(v.yaw) * v.speed * dt;
      const nz = v.z + Math.cos(v.yaw) * v.speed * dt;
      const col = resolveCircleAABBCollision(
        nx,
        nz,
        Math.max(v.rig.halfWidth, v.rig.halfLength * 0.65),
        this.buildingColliders,
      );
      v.x = col.x;
      v.z = col.z;
      if (col.collided) v.speed *= 0.2;

      v.wheelSpin += (v.speed / 0.34) * dt;
      for (const w of v.rig.wheels) w.rotation.x = v.wheelSpin;
      v.rig.root.position.set(v.x, getTerrainHeight(v.x, v.z), v.z);
      v.rig.root.rotation.y = v.yaw;
    }
  }

  private updateNpcs(dt: number): void {
    let activeAttackers = 0;
    for (const n of this.npcs) {
      if (!n.dead && n.hasAttackToken) activeAttackers++;
    }

    for (const npc of this.npcs) {
      npc.hitFlashTimer = Math.max(0, npc.hitFlashTimer - dt);

      if (npc.dead) {
        if (npc.koTimer > 0) {
          npc.koTimer = Math.max(0, npc.koTimer - dt);
          const p = 1 - npc.koTimer / 0.45;
          npc.rig.root.rotation.x = p * (Math.PI * 0.48);
          npc.rig.root.position.y = getTerrainHeight(npc.x, npc.z) + Math.max(0.18, 0.18 * p);
        }
        continue;
      }

      const dx = this.playerX - npc.x;
      const dz = this.playerZ - npc.z;
      const dist = Math.hypot(dx, dz);

      let moveX = 0;
      let moveZ = 0;
      let moveSpeed = 0;
      let telegraphRatio = 0;
      let showAimBeam = false;
      let attackAnim = 0;

      const isPolice = npc.archetype === 'constable' || npc.archetype === 'tactical';
      const isHostile =
        (npc.archetype === 'enforcer' && dist < 24) ||
        (isPolice && this.wanted.stars >= 1 && dist < 44);

      if (npc.archetype === 'citizen') {
        if (this.wanted.stars >= 1 && dist < 14) {
          moveX = -dx / Math.max(0.1, dist);
          moveZ = -dz / Math.max(0.1, dist);
          moveSpeed = 4.6;
        } else {
          npc.wanderTimer -= dt;
          if (npc.wanderTimer <= 0) {
            npc.wanderTimer = 2.5 + Math.random() * 3.5;
            npc.wanderAngle += (Math.random() - 0.5) * 2.2;
          }
          moveX = Math.sin(npc.wanderAngle);
          moveZ = Math.cos(npc.wanderAngle);
          moveSpeed = 1.65;
        }
      } else if (isHostile) {
        if (npc.attackState === 'idle') {
          if (npc.archetype === 'constable') {
            moveX = dx / Math.max(0.1, dist);
            moveZ = dz / Math.max(0.1, dist);
            moveSpeed = 4.9;
            if (dist < 2.2 && activeAttackers < 3) {
              npc.attackState = 'windup';
              npc.attackTimer = 0.42;
              npc.hasAttackToken = true;
              activeAttackers++;
              this.audio.playTelegraph();
            }
          } else if (npc.archetype === 'tactical') {
            if (dist > 14) {
              moveX = dx / Math.max(0.1, dist);
              moveZ = dz / Math.max(0.1, dist);
              moveSpeed = 4.0;
            } else if (dist < 7) {
              moveX = -dx / Math.max(0.1, dist);
              moveZ = -dz / Math.max(0.1, dist);
              moveSpeed = 3.2;
            } else if (activeAttackers < 3) {
              npc.attackState = 'windup';
              npc.attackTimer = 0.65;
              npc.hasAttackToken = true;
              activeAttackers++;
              this.audio.playTelegraph();
            }
          } else if (npc.archetype === 'enforcer') {
            if (dist > 6.5) {
              moveX = dx / Math.max(0.1, dist);
              moveZ = dz / Math.max(0.1, dist);
              moveSpeed = 4.4;
            } else if (activeAttackers < 3) {
              npc.attackState = 'windup';
              npc.attackTimer = 0.48;
              npc.hasAttackToken = true;
              npc.lungeDirX = dx / Math.max(0.1, dist);
              npc.lungeDirZ = dz / Math.max(0.1, dist);
              activeAttackers++;
              this.audio.playTelegraph();
            }
          }
        } else if (npc.attackState === 'windup') {
          npc.attackTimer -= dt;
          npc.yaw = Math.atan2(dx, dz);
          const windTotal = npc.archetype === 'tactical' ? 0.65 : 0.45;
          telegraphRatio = 1 - Math.max(0, npc.attackTimer) / windTotal;
          showAimBeam = npc.archetype === 'tactical';
          if (npc.attackTimer <= 0) {
            npc.attackState = 'active';
            npc.attackTimer = 0.24;
            if (npc.archetype === 'tactical') {
              this.spawnParticles(npc.x, 1.35, npc.z, 8, 0x38bdf8, 8, 0.7);
              if (dist < 16) {
                this.hurtPlayer(12);
              }
            } else if (npc.archetype === 'constable' && dist < 2.6) {
              this.hurtPlayer(14);
            }
          }
        } else if (npc.attackState === 'active') {
          npc.attackTimer -= dt;
          attackAnim = 0.5;
          if (npc.archetype === 'enforcer') {
            moveX = npc.lungeDirX;
            moveZ = npc.lungeDirZ;
            moveSpeed = 12.5;
            if (dist < 1.9) {
              this.hurtPlayer(16);
              npc.attackState = 'recover';
              npc.attackTimer = 0.7;
            }
          }
          if (npc.attackTimer <= 0) {
            npc.attackState = 'recover';
            npc.attackTimer = 0.65;
          }
        } else if (npc.attackState === 'recover') {
          npc.attackTimer -= dt;
          if (npc.attackTimer <= 0) {
            npc.attackState = 'idle';
            npc.hasAttackToken = false;
          }
        }
      }

      npc.vx *= Math.exp(-9 * dt);
      npc.vz *= Math.exp(-9 * dt);
      const stepX = (moveX * moveSpeed + npc.vx) * dt;
      const stepZ = (moveZ * moveSpeed + npc.vz) * dt;

      const col = resolveCircleAABBCollision(npc.x + stepX, npc.z + stepZ, 0.48, this.buildingColliders);
      npc.x = Math.max(-72, Math.min(WORLD_PLAYABLE_RADIUS, col.x));
      npc.z = Math.max(-WORLD_PLAYABLE_RADIUS, Math.min(WORLD_PLAYABLE_RADIUS, col.z));

      if (moveSpeed > 0.25) {
        const targetYaw = Math.atan2(moveX, moveZ);
        npc.yaw += shortestAngleDelta(npc.yaw, targetYaw) * (1 - Math.exp(-9 * dt));
      }

      npc.gaitPhase += Math.hypot(stepX, stepZ) * 2.5;
      npc.rig.root.position.set(npc.x, getTerrainHeight(npc.x, npc.z), npc.z);
      npc.rig.root.rotation.y = npc.yaw;
      animateHumanPose(npc.rig, {
        gaitPhase: npc.gaitPhase,
        speedNorm: Math.min(1, moveSpeed / 6),
        attackProgress: attackAnim,
        seated: false,
        hitFlash: npc.hitFlashTimer > 0,
        telegraphRatio,
        showAimBeam,
      });
    }
  }

  private hurtPlayer(amount: number): void {
    if (this.isWasted) return;
    const scaled = this.activeVehicle ? Math.ceil(amount * 0.45) : amount;
    const res = applyArmorAndHealthDamage(this.playerHealth, this.playerArmor, scaled);
    this.playerHealth = res.health;
    this.playerArmor = res.armor;
    this.playerHitFlash = 0.14;
    this.hitstopTimer = 0.035;
    const shakeScale = this.accessibility.reducedShake ? 0.25 : 1;
    this.camTrauma = Math.min(1, this.camTrauma + 0.45 * shakeScale);
    this.audio.playImpact('heavy');
    this.spawnParticles(this.playerX, this.playerY + 1.2, this.playerZ, 10, 0xe03e3e, 5.0, 0.85);

    if (res.wasted) {
      this.isWasted = true;
      this.wastedDelayTimer = 0.55;
      this.audio.playWastedSting();
      this.showBanner('WASTED', 'Colombo General Hospital Dispatch', 1.5);
    }
    this.emitHud();
  }

  private updateWantedAndMission(dt: number): void {
    const seenByPolice = this.npcs.some(
      (n) =>
        !n.dead &&
        (n.archetype === 'constable' || n.archetype === 'tactical') &&
        Math.hypot(n.x - this.playerX, n.z - this.playerZ) < 26,
    );
    this.wanted = stepWantedSystem(this.wanted, dt, 0, seenByPolice);

    if (this.mission.type === 'drive_to') {
      const dist = Math.hypot(this.mission.targetX - this.playerX, this.mission.targetZ - this.playerZ);
      if (dist < 4.8) {
        this.completeCurrentMission();
      }
    } else if (this.mission.type === 'clear_enforcers') {
      const rem = this.npcs.filter((n) => n.archetype === 'enforcer' && !n.dead).length;
      this.mission.remainingTargets = rem;
      this.mission.objective = `Clear ${rem} Rival Enforcers [Click/J Fire · 1-5 Weapons]`;
      if (rem === 0) {
        this.completeCurrentMission();
      }
    }
  }

  private completeCurrentMission(): void {
    this.cashLkr += this.mission.rewardLkr;
    this.score += 1500;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem('gta_sl_best_score', String(this.bestScore));
      } catch {
        // Ignore storage errors
      }
    }
    this.mission.completedCount += 1;
    this.playerHealth = Math.min(this.maxHealth, this.playerHealth + 30);
    this.audio.playCashChime();
    this.spawnParticles(this.playerX, this.playerY + 1.8, this.playerZ, 24, 0xf5b942, 7.5, 1.15);
    this.showBanner(
      'MISSION PASSED!',
      `${this.mission.title} · +LKR ${this.mission.rewardLkr.toLocaleString()}`,
      3.0,
    );
    this.setupMission(this.mission.index + 1);
    this.emitHud();
  }

  private updateCamera(dt: number): void {
    const inside = Boolean(this.currentInterior);
    const distBack = this.activeVehicle
      ? this.activeVehicle.kind === 'bus'
        ? 11.5
        : 7.4
      : inside
        ? 4.1
        : 5.4;
    const heightUp = this.activeVehicle ? 3.5 : inside ? 3.35 : 2.65;
    const lookUp = this.activeVehicle ? 1.55 : 1.45;

    const anchorX = this.playerX;
    const anchorY = this.playerY + lookUp;
    const anchorZ = this.playerZ;

    _camGoal.set(
      anchorX - Math.sin(this.camYaw) * distBack,
      anchorY + heightUp - 1.2,
      anchorZ - Math.cos(this.camYaw) * distBack,
    );

    if (!inside) {
      _v3B.set(anchorX, anchorY, anchorZ);
      _rayDir.copy(_camGoal).sub(_v3B);
      const maxDist = _rayDir.length();
      if (maxDist > 0.2) {
        _rayDir.divideScalar(maxDist);
        _raycaster.set(_v3B, _rayDir);
        _raycaster.far = maxDist;
        const hits = _raycaster.intersectObjects(this.buildingMeshesForCamera, true);
        if (hits.length > 0 && hits[0].distance < maxDist) {
          const safeDist = Math.max(1.8, hits[0].distance - 0.65);
          _camGoal.copy(_v3B).addScaledVector(_rayDir, safeDist);
        }
      }
    }

    const alpha = 1 - Math.exp(-8.5 * dt);
    this.camera.position.lerp(_camGoal, alpha);

    _camLookGoal.set(
      anchorX + Math.sin(this.camYaw) * (inside ? 1.0 : 2.2),
      anchorY,
      anchorZ + Math.cos(this.camYaw) * (inside ? 1.0 : 2.2),
    );
    _camLookCur.lerp(_camLookGoal, 1 - Math.exp(-11 * dt));

    const shake = this.camTrauma * this.camTrauma;
    this.camera.position.x += (Math.random() - 0.5) * 0.42 * shake;
    this.camera.position.y += (Math.random() - 0.5) * 0.35 * shake;
    this.camera.lookAt(_camLookCur);

    const targetFov = this.activeVehicle
      ? 58 + Math.min(13, Math.abs(this.activeVehicle.speed) * 0.45)
      : 58;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private getInteriorActionLabel(): string | null {
    if (!this.currentInterior) return null;
    const kind = this.currentInterior.enterable;
    if (kind === 'armory') return 'Buy Ammo + Full Kevlar (LKR 600)';
    if (kind === 'cafe_shop') return 'Order Hot Kottu & Ceylon Tea (LKR 350)';
    if (kind === 'safehouse') return 'Rest, Clear Heat & Change Outfit';
    if (kind === 'bank_vault') {
      return this.bankHeistCooldown > 0
        ? `Vault Security Reset (${Math.ceil(this.bankHeistCooldown)}s)`
        : 'Loot Gold Vault (+LKR 12,000)';
    }
    return null;
  }

  private emitHud(): void {
    const ll = this.getPlayerLatLng();
    const speedKmh = this.activeVehicle ? Math.round(Math.abs(this.activeVehicle.speed) * 3.6) : 0;
    const atmo = getBlendedAtmosphere(this.weather);

    this.onHudUpdate({
      phase: this.phase,
      health: Math.round(this.playerHealth),
      maxHealth: this.maxHealth,
      armor: Math.round(this.playerArmor),
      maxArmor: this.maxArmor,
      stamina: Math.round(this.playerStamina),
      cashLkr: Math.round(this.cashLkr),
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScore),
      wantedStars: this.wanted.stars,
      wantedHeat: Math.round(this.wanted.heat),
      districtName: this.district.name,
      mapsSyncedCount: this.mapsSyncedCount,
      mapsStatus: this.mapsStatus,
      weatherMode: this.weather.mode,
      weatherLabel: atmo.label,
      weatherAutoCycle: this.weather.autoCycle,
      playerLat: ll.lat,
      playerLng: ll.lng,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerYaw: this.playerYaw,
      inVehicle: Boolean(this.activeVehicle),
      vehicleName: this.activeVehicle?.rig.displayName ?? '',
      speedKmh,
      nearbyVehiclePrompt:
        !this.activeVehicle && this.nearbyVehicle
          ? `Drive ${this.nearbyVehicle.rig.displayName}`
          : null,
      interiorName: this.currentInterior?.name ?? null,
      interiorActionPrompt: this.getInteriorActionLabel(),
      weapons: WEAPON_SPECS.map((spec) => ({
        id: spec.id,
        slot: spec.slot,
        name: spec.name,
        shortName: spec.shortName,
        ammo: this.ammoBag[spec.id] ?? 0,
        infiniteAmmo: spec.infiniteAmmo,
        equipped: this.equippedWeapon === spec.id,
      })),
      equippedWeaponId: this.equippedWeapon,
      mission: { ...this.mission },
      bannerTitle: this.bannerTitle,
      bannerSubtitle: this.bannerSubtitle,
      muted: this.audio.isMuted(),
      isWasted: this.isWasted,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      accessibility: { ...this.accessibility },
      minimapBuildings: this.structures.map((s) => ({
        x: s.x,
        z: s.z,
        w: s.width,
        d: s.depth,
        isLandmark: s.source === 'google_maps' || s.archetype === 'lotus_tower',
        isEnterable: Boolean(s.enterable),
      })),
      minimapVehicles: this.vehicles.map((v) => ({
        x: v.x,
        z: v.z,
        isPolice: v.kind === 'police',
      })),
      minimapEnemies: this.npcs
        .filter((n) => !n.dead && n.archetype !== 'citizen')
        .map((n) => ({ x: n.x, z: n.z })),
      minimapPickups: this.pickups
        .filter((p) => p.respawnTimer <= 0)
        .map((p) => ({ x: p.x, z: p.z, kind: p.kind })),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.textures.dispose();
    this.renderer.dispose();
  }
}
