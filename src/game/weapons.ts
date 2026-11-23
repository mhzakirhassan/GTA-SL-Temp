import type { WeaponId, WeaponSpec } from './types';

export const WEAPON_SPECS: readonly WeaponSpec[] = [
  {
    id: 'fists',
    slot: 1,
    name: 'Street Fists',
    shortName: 'FISTS',
    kind: 'melee',
    damage: 34,
    range: 2.3,
    cooldown: 0.36,
    pellets: 1,
    spread: 0,
    infiniteAmmo: true,
    defaultAmmo: 0,
    maxAmmo: 0,
    ammoCostLkr: 0,
    ammoPackAmount: 0,
  },
  {
    id: 'bat',
    slot: 2,
    name: 'Ceylon Cricket Bat',
    shortName: 'CRICKET BAT',
    kind: 'melee',
    damage: 58,
    range: 2.85,
    cooldown: 0.48,
    pellets: 1,
    spread: 0,
    infiniteAmmo: true,
    defaultAmmo: 0,
    maxAmmo: 0,
    ammoCostLkr: 0,
    ammoPackAmount: 0,
  },
  {
    id: 'pistol',
    slot: 3,
    name: 'Colombo 9mm Pistol',
    shortName: '9MM PISTOL',
    kind: 'ranged',
    damage: 38,
    range: 38,
    cooldown: 0.28,
    pellets: 1,
    spread: 0.025,
    infiniteAmmo: false,
    defaultAmmo: 48,
    maxAmmo: 144,
    ammoCostLkr: 500,
    ammoPackAmount: 36,
  },
  {
    id: 'smg',
    slot: 4,
    name: 'Pettah Compact SMG',
    shortName: 'PETTAH SMG',
    kind: 'ranged',
    damage: 22,
    range: 34,
    cooldown: 0.11,
    pellets: 1,
    spread: 0.065,
    infiniteAmmo: false,
    defaultAmmo: 90,
    maxAmmo: 240,
    ammoCostLkr: 800,
    ammoPackAmount: 60,
  },
  {
    id: 'shotgun',
    slot: 5,
    name: 'Monsoon Heavy Shotgun',
    shortName: 'SHOTGUN',
    kind: 'ranged',
    damage: 26,
    range: 22,
    cooldown: 0.68,
    pellets: 5,
    spread: 0.14,
    infiniteAmmo: false,
    defaultAmmo: 18,
    maxAmmo: 64,
    ammoCostLkr: 1000,
    ammoPackAmount: 16,
  },
];

export const WEAPON_BY_ID: Record<WeaponId, WeaponSpec> = {
  fists: WEAPON_SPECS[0],
  bat: WEAPON_SPECS[1],
  pistol: WEAPON_SPECS[2],
  smg: WEAPON_SPECS[3],
  shotgun: WEAPON_SPECS[4],
};

export function createInitialAmmoBag(): Record<WeaponId, number> {
  return {
    fists: 0,
    bat: 0,
    pistol: WEAPON_BY_ID.pistol.defaultAmmo,
    smg: WEAPON_BY_ID.smg.defaultAmmo,
    shotgun: WEAPON_BY_ID.shotgun.defaultAmmo,
  };
}

export function canFireWeapon(weaponId: WeaponId, ammoBag: Record<WeaponId, number>): boolean {
  const spec = WEAPON_BY_ID[weaponId];
  return spec.infiniteAmmo || (ammoBag[weaponId] ?? 0) > 0;
}

export function consumeWeaponAmmo(
  weaponId: WeaponId,
  ammoBag: Record<WeaponId, number>,
): { fired: boolean; nextAmmo: Record<WeaponId, number> } {
  const spec = WEAPON_BY_ID[weaponId];
  if (spec.infiniteAmmo) {
    return { fired: true, nextAmmo: ammoBag };
  }
  const cur = ammoBag[weaponId] ?? 0;
  if (cur <= 0) {
    return { fired: false, nextAmmo: ammoBag };
  }
  return {
    fired: true,
    nextAmmo: {
      ...ammoBag,
      [weaponId]: cur - 1,
    },
  };
}

export function refillAllAmmo(ammoBag: Record<WeaponId, number>): Record<WeaponId, number> {
  const next = { ...ammoBag };
  for (const spec of WEAPON_SPECS) {
    if (!spec.infiniteAmmo) {
      next[spec.id] = Math.min(spec.maxAmmo, (next[spec.id] ?? 0) + spec.ammoPackAmount);
    }
  }
  return next;
}
