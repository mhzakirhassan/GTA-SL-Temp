import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectLatLngToWorld,
  worldToLatLng,
  snapStructureOffRoads,
  overlapsRoadCorridor,
  classifyPlaceTypeToArchetype,
  resolveCircleAABBCollision,
  stepWantedSystem,
  applyPlayerDamage,
  applyArmorAndHealthDamage,
  shortestAngleDelta,
  getTerrainHeight,
  buildEnterableBuildingWallColliders,
  isPointInsideStructure,
} from './worldMath';
import type { StructureRecord } from './types';

const COLOMBO_ORIGIN = { lat: 6.9271, lng: 79.8582 };

test('projectLatLngToWorld preserves compass direction and round-trips near origin', () => {
  const northEast = { lat: 6.9285, lng: 79.8598 };
  const projected = projectLatLngToWorld(northEast, COLOMBO_ORIGIN, 0.2, 96);

  assert.ok(projected.x > 0, 'East of origin should have positive X');
  assert.ok(projected.z < 0, 'North of origin should have negative Z');
  assert.ok(projected.trueDistanceMeters > 200 && projected.trueDistanceMeters < 260);

  const roundTrip = worldToLatLng(projected.x, projected.z, COLOMBO_ORIGIN, 0.2);
  assert.ok(Math.abs(roundTrip.lat - northEast.lat) < 1e-4);
  assert.ok(Math.abs(roundTrip.lng - northEast.lng) < 1e-4);
});

test('snapStructureOffRoads moves buildings off central Colombo road corridors', () => {
  assert.equal(overlapsRoadCorridor(0, 0, 6, 6), true);
  const snapped = snapStructureOffRoads(1, -2, 6, 6);
  assert.equal(overlapsRoadCorridor(snapped.x, snapped.z, 6, 6), false);
});

test('classifyPlaceTypeToArchetype maps Google Maps place types to Sri Lankan structures', () => {
  assert.equal(classifyPlaceTypeToArchetype('hotel').archetype, 'hotel_tower');
  assert.equal(classifyPlaceTypeToArchetype('buddhist_temple').archetype, 'temple_pavilion');
  assert.equal(classifyPlaceTypeToArchetype('museum').archetype, 'colonial_arcade');
  assert.equal(classifyPlaceTypeToArchetype('restaurant').archetype, 'pettah_bazaar');
  assert.equal(classifyPlaceTypeToArchetype('shopping_mall').archetype, 'commercial_plaza');
});

test('resolveCircleAABBCollision prevents penetration and slides along building face', () => {
  const buildings = [{ id: 'b1', minX: 10, maxX: 20, minZ: -5, maxZ: 5 }];
  const res = resolveCircleAABBCollision(9.5, 0, 1.0, buildings);
  assert.equal(res.collided, true);
  assert.ok(res.x <= 9.0001, 'Actor should be pushed outside minX - radius');
  assert.equal(res.z, 0);
});

test('stepWantedSystem escalates stars on crime and decays when hidden from police', () => {
  let state = { heat: 0, stars: 0, cooldownTimer: 0 };
  state = stepWantedSystem(state, 0.016, 140, true);
  assert.equal(state.stars, 2);
  assert.equal(state.cooldownTimer, 9.0);

  // Still cooling down before timer finishes
  state = stepWantedSystem(state, 4.0, 0, false);
  assert.equal(state.stars, 2);

  // Evade long enough to clear stars completely
  state = stepWantedSystem(state, 6.0, 0, false);
  state = stepWantedSystem(state, 10.0, 0, false);
  assert.equal(state.stars, 0);
  assert.equal(state.heat, 0);
});

test('applyPlayerDamage and applyArmorAndHealthDamage handle armor absorption and WASTED', () => {
  const hit1 = applyPlayerDamage(100, 45);
  assert.equal(hit1.health, 55);
  assert.equal(hit1.wasted, false);

  const lethal = applyPlayerDamage(hit1.health, 70);
  assert.equal(lethal.health, 0);
  assert.equal(lethal.wasted, true);

  const armored = applyArmorAndHealthDamage(100, 30, 50);
  assert.equal(armored.armor, 0);
  assert.equal(armored.health, 80);
  assert.equal(armored.wasted, false);
});

test('shortestAngleDelta wraps cleanly across -PI/PI seam', () => {
  const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(delta - 0.2) < 1e-6);
});

test('getTerrainHeight keeps roads flat, slopes beach west, and raises eastern highlands', () => {
  assert.equal(getTerrainHeight(0, 20), 0);
  assert.equal(getTerrainHeight(-44, 0), 0);
  assert.ok(getTerrainHeight(-72, 10) < 0, 'Beach west of seawall slopes down to ocean');
  assert.ok(getTerrainHeight(-59, 10) > 0, 'Galle Face Green has subtle coastal lawn knolls');
  assert.ok(getTerrainHeight(96, -70) > 1.5, 'Cinnamon Gardens NE hillock rises above street level');
});

test('buildEnterableBuildingWallColliders allows seamless walk-in through doorway while blocking solid walls', () => {
  const armory: StructureRecord = {
    id: 'in-armory',
    name: 'Pettah Tactical Armory',
    archetype: 'armory',
    source: 'district_landmark',
    x: 16.5,
    z: 19,
    width: 12,
    depth: 11,
    height: 6.2,
    rotationY: 0,
    lat: 6.92,
    lng: 79.85,
    enterable: 'armory',
    doorFacing: 'west',
  };
  const walls = buildEnterableBuildingWallColliders(armory);
  // Walking directly through center of west doorway (x = 10.5, z = 19) should NOT collide
  const doorPass = resolveCircleAABBCollision(10.5, 19, 0.5, walls);
  assert.equal(doorPass.collided, false);

  // Standing inside center of armory should report inside and not collide
  assert.equal(isPointInsideStructure(16.5, 19, armory), true);
  assert.equal(resolveCircleAABBCollision(16.5, 19, 0.5, walls).collided, false);

  // Walking into solid back (east) wall at x = 22.3 should collide
  const backHit = resolveCircleAABBCollision(22.3, 19, 0.5, walls);
  assert.equal(backHit.collided, true);
});
