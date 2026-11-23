import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialWeatherState,
  getBlendedAtmosphere,
  getNextWeatherMode,
  setWeatherMode,
  stepWeatherState,
} from './weather';
import {
  canFireWeapon,
  consumeWeaponAmmo,
  createInitialAmmoBag,
  refillAllAmmo,
} from './weapons';

test('weather cycles Sunny -> Overcast -> Monsoon -> Sunny smoothly', () => {
  assert.equal(getNextWeatherMode('sunny'), 'overcast');
  assert.equal(getNextWeatherMode('overcast'), 'monsoon');
  assert.equal(getNextWeatherMode('monsoon'), 'sunny');

  let state = createInitialWeatherState('sunny', 10);
  // Advance past 10s cycle duration
  const step1 = stepWeatherState(state, 10.5, 0.5);
  assert.equal(step1.state.mode, 'overcast');
  assert.equal(step1.transitionedMode, 'overcast');

  // Manual override to monsoon (locked) triggers rain intensity blend and lightning
  state = setWeatherMode(step1.state, 'monsoon', false);
  assert.equal(state.mode, 'monsoon');
  assert.equal(state.transition, 0);

  let thunderSeen = false;
  for (let i = 0; i < 60; i++) {
    const res = stepWeatherState(state, 0.25, 0.2);
    state = res.state;
    if (res.thunderTriggered) thunderSeen = true;
  }
  const atmo = getBlendedAtmosphere(state);
  assert.ok(atmo.rainIntensity > 0.9, 'Monsoon should reach full rain intensity');
  assert.ok(atmo.asphaltRoughness < 0.3, 'Monsoon roads should turn glossy wet');
  assert.equal(thunderSeen, true, 'Monsoon should trigger lightning & thunder');
});

test('weapons consume ammo accurately and melee remains infinite', () => {
  let bag = createInitialAmmoBag();
  assert.equal(canFireWeapon('fists', bag), true);
  assert.equal(canFireWeapon('bat', bag), true);

  const meleeShot = consumeWeaponAmmo('bat', bag);
  assert.equal(meleeShot.fired, true);
  assert.equal(meleeShot.nextAmmo, bag);

  const initialPistol = bag.pistol;
  const pistolShot = consumeWeaponAmmo('pistol', bag);
  assert.equal(pistolShot.fired, true);
  assert.equal(pistolShot.nextAmmo.pistol, initialPistol - 1);

  bag = { ...bag, shotgun: 0 };
  assert.equal(canFireWeapon('shotgun', bag), false);
  const dryFire = consumeWeaponAmmo('shotgun', bag);
  assert.equal(dryFire.fired, false);

  const refilled = refillAllAmmo(bag);
  assert.ok(refilled.shotgun > 0, 'Armory refill restores shotgun shells');
});
