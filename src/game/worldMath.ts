import type { AABB, BuildingArchetype, LatLng, StructureRecord } from './types';

export const METERS_PER_DEG_LAT = 110540;
export const METERS_PER_DEG_LNG_EQ = 111320;
export const WORLD_PLAYABLE_RADIUS = 116;

/**
 * Road centerlines in meters on our Colombo street grid.
 * Each road is 12m wide (half-width 6m) plus 2.5m sidewalk apron.
 */
export const ROAD_X_LINES = [-44, 0, 44] as const;
export const ROAD_Z_LINES = [-44, 0, 44] as const;
export const ROAD_HALF_WIDTH = 6.2;
export const SIDEWALK_MARGIN = 2.6;

/**
 * Projects a geographic lat/lng coordinate into 1:1 metric Three.js world space
 * (+X = East, -Z = North) relative to a Sri Lankan district origin.
 * Distant POIs are compressed smoothly into the playable district ring while
 * preserving exact compass bearing.
 */
export function projectLatLngToWorld(
  point: LatLng,
  origin: LatLng,
  metricScale = 0.16,
  maxRadius = 96,
): { x: number; z: number; trueDistanceMeters: number } {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const eastMeters = (point.lng - origin.lng) * METERS_PER_DEG_LNG_EQ * cosLat;
  const northMeters = (point.lat - origin.lat) * METERS_PER_DEG_LAT;
  const trueDistanceMeters = Math.hypot(eastMeters, northMeters);

  let x = eastMeters * metricScale;
  let z = -northMeters * metricScale;

  const r = Math.hypot(x, z);
  if (r > maxRadius && r > 0.001) {
    const clamped = maxRadius * (0.72 + 0.28 * Math.tanh(r / maxRadius));
    const factor = clamped / r;
    x *= factor;
    z *= factor;
  }

  return { x, z, trueDistanceMeters };
}

/**
 * Inverse projection from Three.js world meters back to real Sri Lanka lat/lng
 * for live GPS readout and Google Maps player marker synchronization.
 */
export function worldToLatLng(
  x: number,
  z: number,
  origin: LatLng,
  metricScale = 0.16,
): LatLng {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const eastMeters = x / metricScale;
  const northMeters = -z / metricScale;
  return {
    lat: origin.lat + northMeters / METERS_PER_DEG_LAT,
    lng: origin.lng + eastMeters / (METERS_PER_DEG_LNG_EQ * cosLat),
  };
}

/**
 * Returns true if a footprint overlaps a driveable street corridor.
 */
export function overlapsRoadCorridor(
  x: number,
  z: number,
  halfW: number,
  halfD: number,
): boolean {
  const clearance = ROAD_HALF_WIDTH + SIDEWALK_MARGIN;
  for (const rx of ROAD_X_LINES) {
    if (Math.abs(x - rx) < clearance + halfW) return true;
  }
  for (const rz of ROAD_Z_LINES) {
    if (Math.abs(z - rz) < clearance + halfD) return true;
  }
  return false;
}

/**
 * Nudges a projected Google Maps building position off the asphalt road and
 * onto the nearest adjacent Colombo city block parcel so streets stay 100% driveable.
 */
export function snapStructureOffRoads(
  x: number,
  z: number,
  halfW: number,
  halfD: number,
  westWaterEdgeX = -62,
): { x: number; z: number } {
  let sx = Math.max(westWaterEdgeX + halfW + 4, Math.min(82, x));
  let sz = Math.max(-88, Math.min(88, z));

  const clearance = ROAD_HALF_WIDTH + SIDEWALK_MARGIN;

  for (const rx of ROAD_X_LINES) {
    const dx = sx - rx;
    if (Math.abs(dx) < clearance + halfW) {
      const sign = dx >= 0 ? 1 : -1;
      sx = rx + sign * (clearance + halfW + 1.2);
    }
  }

  for (const rz of ROAD_Z_LINES) {
    const dz = sz - rz;
    if (Math.abs(dz) < clearance + halfD) {
      const sign = dz >= 0 ? 1 : -1;
      sz = rz + sign * (clearance + halfD + 1.2);
    }
  }

  return { x: sx, z: sz };
}

/**
 * Pure multi-terrain elevation function for Colombo & Sri Lanka districts:
 * - City avenues and building pads (-52 <= x <= 76) stay level at y = 0 for crisp roads & walk-in floors.
 * - Galle Face Green coastal grass strip (-64 <= x < -52) has gentle rolling sea-breeze mounds.
 * - Golden sandy beach west of seawall (x < -64) slopes softly down toward Indian Ocean surf.
 * - Cinnamon Gardens / Highland Overlook hills rise on the NE (x > 78, z < -46) and SE (x > 78, z > 46) flanks.
 */
export function getTerrainHeight(x: number, z: number): number {
  // Keep main road corridors completely flat
  for (const rx of ROAD_X_LINES) {
    if (Math.abs(x - rx) < 9.5) return 0;
  }
  for (const rz of ROAD_Z_LINES) {
    if (Math.abs(z - rz) < 9.5) return 0;
  }

  // Western sandy beach slope toward the Indian Ocean
  if (x < -66) {
    const t = Math.min(1, (-66 - x) / 14);
    return -t * 0.65;
  }

  // Subtle coastal knolls on Galle Face Green lawn
  if (x < -53 && x >= -65) {
    const edgeFade = Math.sin(((x + 65) / 12) * Math.PI);
    const wave = 0.5 + 0.5 * Math.sin(z * 0.085);
    return edgeFade * wave * 0.68;
  }

  // Cinnamon Gardens & Highland Overlook rolling hills on Eastern outskirts (outside Beira Lake basin)
  if (x > 78 && (z < -42 || z > 42)) {
    const dx = Math.min(1, (x - 78) / 28);
    const dz = z < -42 ? Math.min(1, (-42 - z) / 26) : Math.min(1, (z - 42) / 26);
    const hill = Math.sin(dx * Math.PI * 0.5) * Math.sin(dz * Math.PI * 0.5);
    const ridge = 0.78 + 0.22 * Math.cos(x * 0.11 + z * 0.09);
    return hill * ridge * 4.4;
  }

  return 0;
}

/**
 * Maps a real Google Maps Places API (New) primaryType to a Sri Lankan
 * architectural archetype and 1:1 realistic metric dimensions.
 */
export function classifyPlaceTypeToArchetype(primaryType?: string): {
  archetype: BuildingArchetype;
  width: number;
  depth: number;
  height: number;
} {
  const t = (primaryType || '').toLowerCase();
  if (t.includes('hotel') || t.includes('lodging') || t.includes('resort')) {
    return { archetype: 'hotel_tower', width: 14, depth: 12, height: 28 };
  }
  if (
    t.includes('temple') ||
    t.includes('worship') ||
    t.includes('mosque') ||
    t.includes('church') ||
    t.includes('monument')
  ) {
    return { archetype: 'temple_pavilion', width: 12, depth: 12, height: 11 };
  }
  if (
    t.includes('museum') ||
    t.includes('government') ||
    t.includes('city_hall') ||
    t.includes('courthouse') ||
    t.includes('historical')
  ) {
    return { archetype: 'colonial_arcade', width: 15, depth: 11, height: 10.5 };
  }
  if (
    t.includes('market') ||
    t.includes('store') ||
    t.includes('restaurant') ||
    t.includes('cafe') ||
    t.includes('bakery')
  ) {
    return { archetype: 'pettah_bazaar', width: 11, depth: 10, height: 9.5 };
  }
  if (t.includes('mall') || t.includes('bank') || t.includes('corporate')) {
    return { archetype: 'commercial_plaza', width: 14, depth: 13, height: 20 };
  }
  return { archetype: 'civic_hall', width: 12, depth: 10, height: 13 };
}

/**
 * Generates perimeter AABB wall segments for an enterable walk-in building,
 * leaving a generous 3.4m wide doorway facing `doorFacing` so players walk
 * directly from the Colombo street into the furnished 3D interior.
 */
export function buildEnterableBuildingWallColliders(struct: StructureRecord): AABB[] {
  const hw = struct.width * 0.5;
  const hd = struct.depth * 0.5;
  const wallT = 0.55;
  const doorHalf = 1.75; // 3.5m clear open entrance
  const facing = struct.doorFacing ?? 'west';
  const cx = struct.x;
  const cz = struct.z;
  const walls: AABB[] = [];

  const minX = cx - hw;
  const maxX = cx + hw;
  const minZ = cz - hd;
  const maxZ = cz + hd;

  // North wall (minZ)
  if (facing === 'north') {
    walls.push(
      { id: `${struct.id}-n1`, minX, maxX: cx - doorHalf, minZ, maxZ: minZ + wallT },
      { id: `${struct.id}-n2`, minX: cx + doorHalf, maxX, minZ, maxZ: minZ + wallT },
    );
  } else {
    walls.push({ id: `${struct.id}-n`, minX, maxX, minZ, maxZ: minZ + wallT });
  }

  // South wall (maxZ)
  if (facing === 'south') {
    walls.push(
      { id: `${struct.id}-s1`, minX, maxX: cx - doorHalf, minZ: maxZ - wallT, maxZ },
      { id: `${struct.id}-s2`, minX: cx + doorHalf, maxX, minZ: maxZ - wallT, maxZ },
    );
  } else {
    walls.push({ id: `${struct.id}-s`, minX, maxX, minZ: maxZ - wallT, maxZ });
  }

  // West wall (minX)
  if (facing === 'west') {
    walls.push(
      { id: `${struct.id}-w1`, minX, maxX: minX + wallT, minZ, maxZ: cz - doorHalf },
      { id: `${struct.id}-w2`, minX, maxX: minX + wallT, minZ: cz + doorHalf, maxZ },
    );
  } else {
    walls.push({ id: `${struct.id}-w`, minX, maxX: minX + wallT, minZ, maxZ });
  }

  // East wall (maxX)
  if (facing === 'east') {
    walls.push(
      { id: `${struct.id}-e1`, minX: maxX - wallT, maxX, minZ, maxZ: cz - doorHalf },
      { id: `${struct.id}-e2`, minX: maxX - wallT, maxX, minZ: cz + doorHalf, maxZ },
    );
  } else {
    walls.push({ id: `${struct.id}-e`, minX: maxX - wallT, maxX, minZ, maxZ });
  }

  return walls;
}

/**
 * Returns true when world point (x, z) is inside an enterable building footprint.
 */
export function isPointInsideStructure(x: number, z: number, struct: StructureRecord): boolean {
  const hw = struct.width * 0.5 - 0.35;
  const hd = struct.depth * 0.5 - 0.35;
  return (
    x >= struct.x - hw &&
    x <= struct.x + hw &&
    z >= struct.z - hd &&
    z <= struct.z + hd
  );
}

/**
 * Resolves a moving circle (1:1 human or vehicle) against static AABB buildings,
 * sliding smoothly along faces and reporting collision impact intensity.
 */
export function resolveCircleAABBCollision(
  x: number,
  z: number,
  radius: number,
  colliders: readonly AABB[],
): { x: number; z: number; collided: boolean; normalX: number; normalZ: number } {
  let outX = x;
  let outZ = z;
  let collided = false;
  let normalX = 0;
  let normalZ = 0;

  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    const closestX = Math.max(box.minX, Math.min(outX, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(outZ, box.maxZ));
    const dx = outX - closestX;
    const dz = outZ - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      collided = true;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        outX += nx * push;
        outZ += nz * push;
        normalX = nx;
        normalZ = nz;
      } else {
        // Inside the box: push out along nearest edge
        const dLeft = Math.abs(outX - box.minX);
        const dRight = Math.abs(box.maxX - outX);
        const dTop = Math.abs(outZ - box.minZ);
        const dBottom = Math.abs(box.maxZ - outZ);
        const m = Math.min(dLeft, dRight, dTop, dBottom);
        if (m === dLeft) {
          outX = box.minX - radius;
          normalX = -1;
        } else if (m === dRight) {
          outX = box.maxX + radius;
          normalX = 1;
        } else if (m === dTop) {
          outZ = box.minZ - radius;
          normalZ = -1;
        } else {
          outZ = box.maxZ + radius;
          normalZ = 1;
        }
      }
    }
  }

  return { x: outX, z: outZ, collided, normalX, normalZ };
}

export interface WantedState {
  heat: number; // 0 .. 500
  stars: number; // 0 .. 5
  cooldownTimer: number;
}

/**
 * Pure GTA Wanted-star progression & evasion cooldown state machine.
 */
export function stepWantedSystem(
  prev: WantedState,
  dt: number,
  crimeHeatDelta: number,
  seenByPolice: boolean,
): WantedState {
  let heat = Math.max(0, Math.min(500, prev.heat + crimeHeatDelta));
  let cooldownTimer = prev.cooldownTimer;

  if (crimeHeatDelta > 0 || seenByPolice) {
    cooldownTimer = 9.0; // seconds hidden before stars decay
  } else if (heat > 0) {
    cooldownTimer = Math.max(0, cooldownTimer - dt);
    if (cooldownTimer <= 0) {
      heat = Math.max(0, heat - dt * 28);
    }
  }

  const stars =
    heat <= 0
      ? 0
      : Math.min(5, Math.max(1, Math.ceil(heat / 100)));

  return { heat, stars, cooldownTimer };
}

/**
 * Applies damage to player health without any artificial floor (0 = WASTED).
 */
export function applyPlayerDamage(currentHealth: number, damage: number): {
  health: number;
  wasted: boolean;
} {
  const next = Math.max(0, currentHealth - Math.max(0, damage));
  return {
    health: next,
    wasted: next <= 0,
  };
}

/**
 * Applies incoming damage to Kevlar Armor first, spilling remainder to Health.
 */
export function applyArmorAndHealthDamage(
  currentHealth: number,
  currentArmor: number,
  damage: number,
): { health: number; armor: number; wasted: boolean } {
  const incoming = Math.max(0, damage);
  const absorbed = Math.min(Math.max(0, currentArmor), incoming);
  const nextArmor = Math.max(0, currentArmor - absorbed);
  const spill = incoming - absorbed;
  const hpRes = applyPlayerDamage(currentHealth, spill);
  return {
    health: hpRes.health,
    armor: nextArmor,
    wasted: hpRes.wasted,
  };
}

/**
 * Shortest signed angular difference (radians) from angle `a` to angle `b`.
 */
export function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}
