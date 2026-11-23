import * as THREE from 'three';
import type { BuildingArchetype, NpcArchetype, StructureRecord, VehicleKind, WeaponId } from './types';
import type { GameTextureSet } from './textures';

export interface HumanRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftCalf: THREE.Group;
  rightCalf: THREE.Group;
  telegraphRing: THREE.Mesh;
  aimBeam: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  originalEmissives: THREE.Color[];
  shirtMaterial: THREE.MeshStandardMaterial;
  weaponModels: Partial<Record<WeaponId, THREE.Object3D>>;
  muzzleFlash: THREE.Mesh;
}

export interface VehicleRig {
  root: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Object3D[];
  frontWheelPivots: THREE.Object3D[];
  policeRedLight?: THREE.MeshStandardMaterial;
  policeBlueLight?: THREE.MeshStandardMaterial;
  halfWidth: number;
  halfLength: number;
  seatOffset: THREE.Vector3;
  displayName: string;
}

const _sharedContactGeo = new THREE.CircleGeometry(1, 20);
_sharedContactGeo.rotateX(-Math.PI / 2);

function addContactShadow(
  parent: THREE.Group,
  contactShadowMap: THREE.Texture,
  scaleX: number,
  scaleZ: number,
  opacity = 0.44,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(_sharedContactGeo, mat);
  mesh.scale.set(scaleX, 1, scaleZ);
  mesh.position.y = 0.025;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

/**
 * Creates a 1:1 human-scale (1.75m tall) articulated 3D character assembled from
 * 16 distinct anatomical parts with bottom-center ground pivot (y = 0).
 */
export function createHumanModel(
  opts: {
    role: 'player' | NpcArchetype;
    shirtColor: number;
    pantsColor: number;
    skinColor: number;
    hairColor?: number;
  },
  contactShadowMap: THREE.Texture,
): HumanRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  addContactShadow(root, contactShadowMap, 0.48, 0.48, 0.46);

  const skinMat = new THREE.MeshStandardMaterial({
    color: opts.skinColor,
    roughness: 0.65,
    metalness: 0.02,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: opts.shirtColor,
    roughness: 0.78,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: opts.pantsColor,
    roughness: 0.85,
    metalness: 0.02,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: opts.role === 'player' ? 0xf2eee6 : 0x1e2024,
    roughness: 0.55,
    metalness: 0.08,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: opts.hairColor ?? 0x171412,
    roughness: 0.72,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: opts.role === 'player' ? 0xf5b942 : 0x262930,
    roughness: 0.25,
    metalness: 0.72,
  });

  const hitMeshes: THREE.Mesh[] = [];
  const track = (m: THREE.Mesh, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    hitMeshes.push(m);
    return m;
  };

  // Pelvis / hips at y = 0.88m
  const pelvis = track(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), pantsMat));
  pelvis.position.set(0, 0.88, 0);
  bodyGroup.add(pelvis);

  // Belt with metallic buckle
  const belt = track(new THREE.Mesh(new THREE.BoxGeometry(0.355, 0.045, 0.215), accentMat), false);
  belt.position.set(0, 0.96, 0);
  bodyGroup.add(belt);

  // Sculpted upper torso (0.97m -> 1.43m)
  const torso = track(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.22), shirtMat));
  torso.position.set(0, 1.2, 0);
  bodyGroup.add(torso);

  // Collar / lapel detail
  const collar = track(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.13, 0.06, 12),
      opts.role === 'tactical' ? accentMat : shirtMat,
    ),
    false,
  );
  collar.position.set(0, 1.44, 0);
  bodyGroup.add(collar);

  // Tactical vest or gold chain accent
  if (opts.role === 'tactical' || opts.role === 'enforcer') {
    const vestMat = new THREE.MeshStandardMaterial({
      color: opts.role === 'tactical' ? 0x1b273a : 0x5c1919,
      roughness: 0.45,
      metalness: 0.25,
    });
    const vest = track(new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.36, 0.26), vestMat));
    vest.position.set(0, 1.22, 0);
    bodyGroup.add(vest);
  }

  // Head group pivoted at neck (y = 1.47m, crown reaches ~1.75m)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.47, 0);
  bodyGroup.add(headGroup);

  const neck = track(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.08, 10), skinMat), false);
  neck.position.set(0, 0.03, 0);
  headGroup.add(neck);

  const cranium = track(new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skinMat));
  cranium.scale.set(0.92, 1.08, 0.98);
  cranium.position.set(0, 0.16, 0);
  headGroup.add(cranium);

  // Subtle nose profile so forward facing reads clearly
  const nose = track(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.04), skinMat), false);
  nose.position.set(0, 0.15, 0.11);
  headGroup.add(nose);

  // Hair / Hat by archetype
  if (opts.role === 'constable') {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x3b4d36, roughness: 0.65 });
    const capCrown = track(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.075, 12), capMat));
    capCrown.position.set(0, 0.25, -0.01);
    headGroup.add(capCrown);
    const visor = track(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.11), accentMat), false);
    visor.position.set(0, 0.215, 0.09);
    headGroup.add(visor);
  } else if (opts.role === 'tactical') {
    const helmMat = new THREE.MeshStandardMaterial({ color: 0x162030, roughness: 0.3, metalness: 0.45 });
    const helmet = track(
      new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), helmMat),
    );
    helmet.position.set(0, 0.18, 0);
    headGroup.add(helmet);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.8,
    });
    const visor = track(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.06), visorMat), false);
    visor.position.set(0, 0.175, 0.1);
    headGroup.add(visor);
  } else {
    const hair = track(
      new THREE.Mesh(new THREE.SphereGeometry(0.122, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat),
    );
    hair.position.set(0, 0.18, -0.012);
    headGroup.add(hair);
    if (opts.role === 'player' || opts.role === 'enforcer') {
      const shadesMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.15, metalness: 0.85 });
      const shades = track(new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.04, 0.04), shadesMat), false);
      shades.position.set(0, 0.172, 0.105);
      headGroup.add(shades);
    }
  }

  // Arms (pivoted at shoulder y = 1.38m)
  const makeArm = (side: -1 | 1): [THREE.Group, THREE.Group] => {
    const upperPivot = new THREE.Group();
    upperPivot.position.set(side * 0.245, 1.38, 0);
    bodyGroup.add(upperPivot);

    const sleeve = track(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.26, 10), shirtMat));
    sleeve.position.set(0, -0.13, 0);
    upperPivot.add(sleeve);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.26, 0);
    upperPivot.add(forearmPivot);

    const forearm = track(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.25, 10), skinMat));
    forearm.position.set(0, -0.125, 0);
    forearmPivot.add(forearm);

    const hand = track(new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), skinMat), false);
    hand.position.set(0, -0.265, 0);
    forearmPivot.add(hand);

    // Watch on player's left wrist
    if (opts.role === 'player' && side === -1) {
      const watch = track(new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 10), accentMat), false);
      watch.position.set(0, -0.21, 0);
      forearmPivot.add(watch);
    }
    return [upperPivot, forearmPivot];
  };

  // Character faces +Z: anatomical left is +X, anatomical right is -X
  const [leftArm, leftForearm] = makeArm(1);
  const [rightArm, rightForearm] = makeArm(-1);

  // Legs (pivoted at hip y = 0.84m, soles touch y = 0.00m)
  const makeLeg = (side: -1 | 1): [THREE.Group, THREE.Group] => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.1, 0.84, 0);
    bodyGroup.add(hipPivot);

    const thigh = track(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.4, 10), pantsMat));
    thigh.position.set(0, -0.2, 0);
    hipPivot.add(thigh);

    const calfPivot = new THREE.Group();
    calfPivot.position.set(0, -0.4, 0);
    hipPivot.add(calfPivot);

    const calf = track(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.045, 0.36, 10), pantsMat));
    calf.position.set(0, -0.18, 0);
    calfPivot.add(calf);

    const shoe = track(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.22), shoeMat));
    shoe.position.set(0, -0.4, 0.045);
    calfPivot.add(shoe);

    return [hipPivot, calfPivot];
  };

  const [leftLeg, leftCalf] = makeLeg(-1);
  const [rightLeg, rightCalf] = makeLeg(1);

  // Telegraph ring for enemy charge/melee windup
  const ringGeo = new THREE.RingGeometry(0.55, 0.78, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const telegraphRing = new THREE.Mesh(ringGeo, ringMat);
  telegraphRing.position.y = 0.05;
  telegraphRing.visible = false;
  root.add(telegraphRing);

  // Laser sight telegraph beam for tactical ranged officers
  const beamGeo = new THREE.CylinderGeometry(0.025, 0.025, 14, 6);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, 7);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff2d2d,
    transparent: true,
    opacity: 0.82,
  });
  const aimBeam = new THREE.Mesh(beamGeo, beamMat);
  aimBeam.position.set(0.2, 1.32, 0.25);
  aimBeam.visible = false;
  root.add(aimBeam);

  // 3D Held Weapon Models attached cleanly to right hand (visible on player)
  const weaponModels: Partial<Record<WeaponId, THREE.Object3D>> = {};
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x20252d, roughness: 0.32, metalness: 0.8 });
  const woodBatMat = new THREE.MeshStandardMaterial({ color: 0xd9a760, roughness: 0.65 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.85 });

  // Ceylon Willow Cricket Bat
  const batGroup = new THREE.Group();
  batGroup.position.set(0, -0.27, 0.06);
  batGroup.rotation.x = Math.PI * 0.42;
  const batHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.24, 8), gripMat);
  batHandle.position.y = 0.08;
  const batBlade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.045), woodBatMat);
  batBlade.position.y = 0.48;
  batGroup.add(batHandle, batBlade);
  batGroup.visible = false;
  rightForearm.add(batGroup);
  weaponModels.bat = batGroup;

  // Colombo 9mm Pistol (rotated +90 deg X so barrel aims forward when arm raises -1.45 rad)
  const pistolGroup = new THREE.Group();
  pistolGroup.position.set(0, -0.3, 0.02);
  pistolGroup.rotation.x = Math.PI / 2;
  const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.24), gunMetal);
  pSlide.position.set(0, 0.03, 0.07);
  const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.06), gripMat);
  pGrip.position.set(0, -0.04, -0.01);
  pistolGroup.add(pSlide, pGrip);
  pistolGroup.visible = false;
  rightForearm.add(pistolGroup);
  weaponModels.pistol = pistolGroup;

  // Pettah Compact SMG
  const smgGroup = new THREE.Group();
  smgGroup.position.set(0, -0.3, 0.02);
  smgGroup.rotation.x = Math.PI / 2;
  const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.36), gunMetal);
  sBody.position.set(0, 0.03, 0.12);
  const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.055), gripMat);
  sMag.position.set(0, -0.09, 0.14);
  const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), gunMetal);
  sBarrel.rotation.x = Math.PI / 2;
  sBarrel.position.set(0, 0.04, 0.34);
  smgGroup.add(sBody, sMag, sBarrel);
  smgGroup.visible = false;
  rightForearm.add(smgGroup);
  weaponModels.smg = smgGroup;

  // Monsoon Heavy Shotgun
  const sgGroup = new THREE.Group();
  sgGroup.position.set(0, -0.29, 0.02);
  sgGroup.rotation.x = Math.PI / 2;
  const sgStock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.1, 0.28), woodBatMat);
  sgStock.position.set(0, 0.01, -0.08);
  const sgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.66, 8), gunMetal);
  sgBarrel.rotation.x = Math.PI / 2;
  sgBarrel.position.set(0, 0.05, 0.32);
  const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.065, 0.22), gripMat);
  sgPump.position.set(0, 0.01, 0.3);
  sgGroup.add(sgStock, sgBarrel, sgPump);
  sgGroup.visible = false;
  rightForearm.add(sgGroup);
  weaponModels.shotgun = sgGroup;

  // Muzzle flash burst sphere at forward firearm tip
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.92 }),
  );
  muzzleFlash.position.set(0, -0.68, 0.04);
  muzzleFlash.visible = false;
  rightForearm.add(muzzleFlash);

  const originalEmissives = hitMeshes.map((m) =>
    (m.material as THREE.MeshStandardMaterial).emissive.clone(),
  );

  return {
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftForearm,
    rightForearm,
    leftLeg,
    rightLeg,
    leftCalf,
    rightCalf,
    telegraphRing,
    aimBeam,
    hitMeshes,
    originalEmissives,
    shirtMaterial: shirtMat,
    weaponModels,
    muzzleFlash,
  };
}

/**
 * Updates articulated human limb pose from distance-synced gait phase,
 * attack curves (windup -> active -> recovery), seated driving pose, and hit flash.
 */
export function animateHumanPose(
  rig: HumanRig,
  params: {
    gaitPhase: number;
    speedNorm: number; // 0..1
    attackProgress: number; // 0 = idle, 0..1 active punch/swing curve
    seated: boolean;
    hitFlash: boolean;
    telegraphRatio: number; // 0..1
    showAimBeam: boolean;
    squashY?: number;
    equippedWeapon?: WeaponId;
    muzzleFlashActive?: boolean;
  },
): void {
  const {
    gaitPhase,
    speedNorm,
    attackProgress,
    seated,
    hitFlash,
    telegraphRatio,
    showAimBeam,
    equippedWeapon = 'fists',
    muzzleFlashActive = false,
  } = params;

  rig.telegraphRing.visible = telegraphRatio > 0.01;
  if (rig.telegraphRing.visible) {
    const s = 0.8 + telegraphRatio * 0.75;
    rig.telegraphRing.scale.set(s, 1, s);
  }
  rig.aimBeam.visible = showAimBeam;

  // Toggle equipped 3D weapon model cleanly
  const isRanged =
    equippedWeapon === 'pistol' || equippedWeapon === 'smg' || equippedWeapon === 'shotgun';
  for (const key of ['bat', 'pistol', 'smg', 'shotgun'] as const) {
    const m = rig.weaponModels[key];
    if (m) m.visible = !seated && equippedWeapon === key;
  }
  rig.muzzleFlash.visible = !seated && isRanged && muzzleFlashActive;

  const sy = params.squashY ?? 1;
  const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
  rig.bodyGroup.scale.set(sxz, sy, sxz);

  if (seated) {
    rig.bodyGroup.position.y = -0.34;
    rig.leftLeg.rotation.x = -1.35;
    rig.rightLeg.rotation.x = -1.35;
    rig.leftCalf.rotation.x = 1.25;
    rig.rightCalf.rotation.x = 1.25;
    rig.leftArm.rotation.x = -0.95;
    rig.rightArm.rotation.x = -0.95;
    rig.leftForearm.rotation.x = -0.45;
    rig.rightForearm.rotation.x = -0.45;
  } else {
    const swing = Math.sin(gaitPhase) * 0.72 * speedNorm;
    const bob = Math.abs(Math.cos(gaitPhase)) * 0.055 * speedNorm;
    const crouchDrop = telegraphRatio > 0 ? telegraphRatio * 0.14 : 0;

    rig.bodyGroup.position.y = bob - crouchDrop;
    rig.bodyGroup.rotation.x = speedNorm * 0.08 + telegraphRatio * 0.18;

    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.leftCalf.rotation.x = Math.max(0, -Math.sin(gaitPhase) * 0.75 * speedNorm);
    rig.rightCalf.rotation.x = Math.max(0, Math.sin(gaitPhase) * 0.75 * speedNorm);

    rig.leftArm.rotation.x = -swing * 0.85;
    rig.rightArm.rotation.x = isRanged ? -1.42 : swing * 0.85;
    rig.leftForearm.rotation.x = -0.22 - Math.abs(swing) * 0.35;
    rig.rightForearm.rotation.x = isRanged ? -0.14 : -0.22 - Math.abs(swing) * 0.35;

    // Ranged firearm recoil kick or melee strike windup -> snap -> recovery
    if (isRanged && attackProgress > 0) {
      const recoil = Math.sin(attackProgress * Math.PI) * 0.35;
      rig.rightArm.rotation.x = -1.42 - recoil;
      rig.bodyGroup.rotation.y = 0;
    } else if (attackProgress > 0) {
      if (attackProgress < 0.25) {
        const w = attackProgress / 0.25;
        rig.rightArm.rotation.x = 0.55 * w;
        rig.rightForearm.rotation.x = -1.1 * w;
        rig.bodyGroup.rotation.y = -0.38 * w;
      } else if (attackProgress < 0.62) {
        const a = (attackProgress - 0.25) / 0.37;
        rig.rightArm.rotation.x = 0.55 - 2.15 * a;
        rig.rightForearm.rotation.x = -1.1 + 0.9 * a;
        rig.bodyGroup.rotation.y = -0.38 + 0.86 * a;
      } else {
        const r = (attackProgress - 0.62) / 0.38;
        rig.rightArm.rotation.x = -1.6 * (1 - r);
        rig.rightForearm.rotation.x = -0.2;
        rig.bodyGroup.rotation.y = 0.48 * (1 - r);
      }
    } else {
      rig.bodyGroup.rotation.y = 0;
    }
  }

  for (let i = 0; i < rig.hitMeshes.length; i++) {
    const mat = rig.hitMeshes[i].material as THREE.MeshStandardMaterial;
    if (hitFlash) {
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = 0.75;
    } else {
      mat.emissive.copy(rig.originalEmissives[i]);
      mat.emissiveIntensity = 0.25;
    }
  }
}

/**
 * Builds composite 1:1 metric Sri Lankan vehicles (Tuk-Tuk, Coupe, City Bus, Police Cruiser).
 * Vehicle forward direction is +Z, bottom-center pivoted flush at y = 0.
 */
export function createVehicleModel(
  kind: VehicleKind,
  primaryColor: number,
  contactShadowMap: THREE.Texture,
): VehicleRig {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const wheels: THREE.Object3D[] = [];
  const frontWheelPivots: THREE.Object3D[] = [];

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: primaryColor,
    roughness: 0.28,
    metalness: 0.42,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x22262d,
    roughness: 0.55,
    metalness: 0.7,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe6ebf0,
    roughness: 0.16,
    metalness: 0.92,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2c3d,
    roughness: 0.12,
    metalness: 0.2,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.78,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x17181c,
    roughness: 0.92,
    metalness: 0.05,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8d6,
    emissive: 0xffe494,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2b2b,
    emissive: 0xd91c1c,
    emissiveIntensity: 1.1,
    roughness: 0.25,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf4c430, // Iconic Sri Lankan yellow rear registration plate
    roughness: 0.42,
    metalness: 0.15,
  });

  const makeWheel = (radius: number, width: number, x: number, y: number, z: number, isFront: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    root.add(pivot);

    const spinGroup = new THREE.Group();
    pivot.add(spinGroup);

    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rimGeo = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 10);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    spinGroup.add(rim);

    wheels.push(spinGroup);
    if (isFront) frontWheelPivots.push(pivot);
  };

  if (kind === 'tuktuk') {
    // 1:1 Colombo Three-Wheeler (2.65m long, 1.32m wide, 1.78m high)
    addContactShadow(root, contactShadowMap, 1.15, 1.65, 0.5);

    // Floor pan
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.16, 2.3), darkMetalMat);
    floor.position.set(0, 0.32, -0.05);
    floor.castShadow = true;
    chassis.add(floor);

    // Curved front cowl & nose apron
    const frontCowl = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.72, 0.62), paintMat);
    frontCowl.position.set(0, 0.74, 0.92);
    frontCowl.castShadow = true;
    chassis.add(frontCowl);

    // Front mudguard over single wheel
    const fender = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12, 1, false, 0, Math.PI),
      paintMat,
    );
    fender.rotation.z = Math.PI / 2;
    fender.position.set(0, 0.34, 1.06);
    chassis.add(fender);

    // Windshield frame & glass
    const windGlass = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.58, 0.06), glassMat);
    windGlass.position.set(0, 1.32, 0.88);
    windGlass.rotation.x = -0.18;
    chassis.add(windGlass);

    // Rear passenger tub + engine cowling
    const rearBody = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.78, 1.18), paintMat);
    rearBody.position.set(0, 0.78, -0.66);
    rearBody.castShadow = true;
    chassis.add(rearBody);

    // Cushioned bench seat
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3b2316, roughness: 0.82 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.52), seatMat);
    bench.position.set(0, 0.74, -0.58);
    chassis.add(bench);

    // Tubular roof frame posts
    const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8);
    const postPositions = [
      [-0.56, 1.34, 0.74],
      [0.56, 1.34, 0.74],
      [-0.58, 1.34, -0.25],
      [0.58, 1.34, -0.25],
      [-0.58, 1.34, -1.16],
      [0.58, 1.34, -1.16],
    ];
    for (const [px, py, pz] of postPositions) {
      const p = new THREE.Mesh(postGeo, chromeMat);
      p.position.set(px, py, pz);
      chassis.add(p);
    }

    // Taut black/cream canvas canopy roof
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.92,
      metalness: 0.02,
    });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.16, 2.08), canopyMat);
    canopy.position.set(0, 1.75, -0.18);
    canopy.castShadow = true;
    chassis.add(canopy);

    // Accent stripe & headlamp + taillights + yellow SL plate
    const headLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), headlightMat);
    headLamp.rotation.x = Math.PI / 2;
    headLamp.position.set(0, 0.78, 1.24);
    chassis.add(headLamp);

    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), tailMat);
    tailL.position.set(-0.46, 0.64, -1.26);
    chassis.add(tailL);
    const tailR = tailL.clone();
    tailR.position.x = 0.46;
    chassis.add(tailR);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.04), plateMat);
    plate.position.set(0, 0.48, -1.26);
    chassis.add(plate);

    // 3 wheels: 1 front center, 2 rear
    makeWheel(0.26, 0.15, 0, 0.26, 1.04, true);
    makeWheel(0.26, 0.16, -0.62, 0.26, -0.78, false);
    makeWheel(0.26, 0.16, 0.62, 0.26, -0.78, false);

    return {
      root,
      chassis,
      wheels,
      frontWheelPivots,
      halfWidth: 0.72,
      halfLength: 1.38,
      seatOffset: new THREE.Vector3(0, 0.56, 0.22),
      displayName: 'Colombo Tuk-Tuk',
    };
  }

  if (kind === 'bus') {
    // 1:1 Sri Lanka Private Express Bus (7.4m long, 2.35m wide, 2.95m high)
    addContactShadow(root, contactShadowMap, 1.85, 4.1, 0.52);

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.25, 7.2), paintMat);
    body.position.set(0, 1.62, 0);
    body.castShadow = true;
    chassis.add(body);

    const goldStripeMat = new THREE.MeshStandardMaterial({
      color: 0xf5b942,
      roughness: 0.32,
      metalness: 0.45,
    });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.28, 7.22), goldStripeMat);
    stripe.position.set(0, 1.32, 0);
    chassis.add(stripe);

    const windows = new THREE.Mesh(new THREE.BoxGeometry(2.33, 0.76, 6.7), glassMat);
    windows.position.set(0, 2.12, 0.08);
    chassis.add(windows);

    const roofRack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 5.4), chromeMat);
    roofRack.position.set(0, 2.82, -0.2);
    chassis.add(roofRack);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.34, 0.24), darkMetalMat);
    bumperF.position.set(0, 0.62, 3.62);
    chassis.add(bumperF);

    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.08), headlightMat);
    hlL.position.set(-0.82, 0.92, 3.62);
    chassis.add(hlL);
    const hlR = hlL.clone();
    hlR.position.x = 0.82;
    chassis.add(hlR);

    makeWheel(0.48, 0.28, -1.16, 0.48, 2.25, true);
    makeWheel(0.48, 0.28, 1.16, 0.48, 2.25, true);
    makeWheel(0.48, 0.32, -1.16, 0.48, -2.15, false);
    makeWheel(0.48, 0.32, 1.16, 0.48, -2.15, false);

    return {
      root,
      chassis,
      wheels,
      frontWheelPivots,
      halfWidth: 1.25,
      halfLength: 3.7,
      seatOffset: new THREE.Vector3(-0.62, 1.12, 2.6),
      displayName: 'Lanka Express Bus',
    };
  }

  // Sedan or Police Cruiser (4.35m long, 1.84m wide, 1.42m high)
  const isPolice = kind === 'police';
  addContactShadow(root, contactShadowMap, 1.38, 2.55, 0.5);

  const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.62, 4.25), paintMat);
  lowerBody.position.set(0, 0.62, 0);
  lowerBody.castShadow = true;
  chassis.add(lowerBody);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.52, 2.05), glassMat);
  cabin.position.set(0, 1.14, -0.18);
  cabin.castShadow = true;
  chassis.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 1.72), paintMat);
  roof.position.set(0, 1.42, -0.2);
  chassis.add(roof);

  if (isPolice) {
    const policeStripeMat = new THREE.MeshStandardMaterial({ color: 0x16468a, roughness: 0.35 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 4.27), policeStripeMat);
    band.position.set(0, 0.62, 0);
    chassis.add(band);
  } else {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.28), darkMetalMat);
    spoiler.position.set(0, 1.04, -1.98);
    chassis.add(spoiler);
  }

  // Bumpers, grille, headlights, taillights, SL plate
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.24, 0.18), darkMetalMat);
  bumperF.position.set(0, 0.38, 2.12);
  chassis.add(bumperF);

  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.06), headlightMat);
  hlL.position.set(-0.62, 0.72, 2.13);
  chassis.add(hlL);
  const hlR = hlL.clone();
  hlR.position.x = 0.62;
  chassis.add(hlR);

  const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.06), tailMat);
  tlL.position.set(-0.58, 0.74, -2.13);
  chassis.add(tlL);
  const tlR = tlL.clone();
  tlR.position.x = 0.58;
  chassis.add(tlR);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.04), plateMat);
  plate.position.set(0, 0.48, -2.14);
  chassis.add(plate);

  let policeRedLight: THREE.MeshStandardMaterial | undefined;
  let policeBlueLight: THREE.MeshStandardMaterial | undefined;
  if (isPolice) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.22), darkMetalMat);
    barBase.position.set(0, 1.49, -0.12);
    chassis.add(barBase);

    policeRedLight = new THREE.MeshStandardMaterial({
      color: 0xff2626,
      emissive: 0xff1e1e,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    policeBlueLight = new THREE.MeshStandardMaterial({
      color: 0x2684ff,
      emissive: 0x1d6eff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.2), policeRedLight);
    redPod.position.set(-0.24, 1.56, -0.12);
    chassis.add(redPod);
    const bluePod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.2), policeBlueLight);
    bluePod.position.set(0.24, 1.56, -0.12);
    chassis.add(bluePod);
  }

  makeWheel(0.34, 0.24, -0.92, 0.34, 1.32, true);
  makeWheel(0.34, 0.24, 0.92, 0.34, 1.32, true);
  makeWheel(0.34, 0.24, -0.92, 0.34, -1.32, false);
  makeWheel(0.34, 0.24, 0.92, 0.34, -1.32, false);

  return {
    root,
    chassis,
    wheels,
    frontWheelPivots,
    policeRedLight,
    policeBlueLight,
    halfWidth: 0.98,
    halfLength: 2.2,
    seatOffset: new THREE.Vector3(-0.36, 0.62, -0.1),
    displayName: isPolice ? 'Sri Lanka Police Cruiser' : 'Colombo GT Coupe',
  };
}

/**
 * Generates a crisp floating canvas sign sprite for Google Maps synced structures
 * so players see real Colombo landmark names directly in 3D space.
 */
function createLandmarkSignMesh(label: string, isGoogleMaps: boolean): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = isGoogleMaps ? 'rgba(16, 18, 26, 0.92)' : 'rgba(26, 20, 16, 0.88)';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = isGoogleMaps ? '#f5b942' : '#e85d3f';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 90);
  ctx.fillStyle = isGoogleMaps ? '#ffd670' : '#f8f5ee';
  ctx.font = '700 32px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const trimmed = label.length > 26 ? `${label.slice(0, 25)}…` : label;
  ctx.fillText(trimmed, 256, 48);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.35), mat);
}

/**
 * Builds composite 3–12+ part 1:1 Sri Lankan architectural landmarks and
 * Google Maps synced structures, bottom-center grounded at y = 0.
 */
export function createBuildingModel(
  struct: StructureRecord,
  textures: GameTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(struct.x, 0, struct.z);
  group.rotation.y = struct.rotationY;

  const { width: w, depth: d, height: h, archetype } = struct;

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd9d2c4,
    roughness: 0.84,
    metalness: 0.04,
    bumpMap: textures.facadeConcreteBump,
    bumpScale: 0.05,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.facadeGlassMap,
    roughness: 0.22,
    metalness: 0.55,
  });
  const colonialMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.facadeColonialMap,
    roughness: 0.76,
    metalness: 0.04,
  });
  const bazaarMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.facadeBazaarMap,
    roughness: 0.78,
    metalness: 0.04,
  });
  const terracottaMat = new THREE.MeshStandardMaterial({
    color: 0xb85232,
    roughness: 0.8,
    metalness: 0.05,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf2b949,
    roughness: 0.26,
    metalness: 0.82,
  });
  const trimDarkMat = new THREE.MeshStandardMaterial({
    color: 0x262b33,
    roughness: 0.52,
    metalness: 0.35,
  });

  if (archetype === 'lotus_tower') {
    // Iconic Nelum Kuluna (Colombo Lotus Tower)
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.52, w * 0.58, 4.5, 16), concreteMat);
    podium.position.y = 2.25;
    podium.castShadow = true;
    podium.receiveShadow = true;
    group.add(podium);

    const podiumRing = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.48, w * 0.48, 0.7, 16), goldMat);
    podiumRing.position.y = 4.65;
    group.add(podiumRing);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.0, h * 0.58, 16), concreteMat);
    stem.position.y = 4.5 + h * 0.29;
    stem.castShadow = true;
    group.add(stem);

    // Flared Lotus Bud Observation Pod
    const budY = 4.5 + h * 0.58;
    const petalMat = new THREE.MeshPhysicalMaterial({
      color: 0xdf4c8c,
      emissive: 0x6b143c,
      emissiveIntensity: 0.32,
      roughness: 0.25,
      metalness: 0.38,
      clearcoat: 0.9,
    });
    const innerPod = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 2.4, 9.5, 16), glassMat);
    innerPod.position.y = budY + 4.4;
    group.add(innerPod);

    // 8 sculpted Lotus Petals radiating around observation pod
    const petalGeo = new THREE.ConeGeometry(2.3, 10.5, 5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.position.set(Math.cos(a) * 3.1, budY + 4.8, Math.sin(a) * 3.1);
      petal.rotation.z = -Math.cos(a) * 0.24;
      petal.rotation.x = Math.sin(a) * 0.24;
      petal.castShadow = true;
      group.add(petal);
    }

    // Glowing gold crown + telecom mast spire
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.3, 2.2, 16), goldMat);
    crown.position.y = budY + 10.2;
    group.add(crown);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.75, 16, 10), chromeAccentMat());
    spire.position.y = budY + 18.5;
    group.add(spire);
  } else if (archetype === 'twin_towers') {
    // Colombo World Trade Center Twin Towers silhouette
    const podium = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), concreteMat);
    podium.position.y = 2.1;
    podium.castShadow = true;
    podium.receiveShadow = true;
    group.add(podium);

    const towerW = w * 0.4;
    const towerD = d * 0.78;
    for (const side of [-1, 1]) {
      const tx = side * (w * 0.27);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(towerW, h - 4.2, towerD), glassMat);
      shaft.position.set(tx, 4.2 + (h - 4.2) * 0.5, 0);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      group.add(shaft);

      // Architectural corner concrete fins
      const fin = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.4, 1.4, towerD + 0.4), concreteMat);
      fin.position.set(tx, h + 0.4, 0);
      group.add(fin);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 5.5, 8), trimDarkMat);
      mast.position.set(tx, h + 3.2, 0);
      group.add(mast);
    }
  } else if (archetype === 'colonial_arcade') {
    // Old Dutch Hospital / Fort Colonial Heritage Arcade
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8), concreteMat);
    plinth.position.y = 0.3;
    plinth.receiveShadow = true;
    group.add(plinth);

    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(w - 1.2, h - 2.6, d - 1.2), colonialMat);
    mainBlock.position.y = 0.6 + (h - 2.6) * 0.5;
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    group.add(mainBlock);

    // Pitched terracotta Sri Lankan hip roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.76, 3.4, 4),
      terracottaMat,
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h - 0.5;
    roof.castShadow = true;
    group.add(roof);

    // Front colonnade pillars
    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.6, 8);
    for (let i = -2; i <= 2; i++) {
      const p = new THREE.Mesh(pillarGeo, concreteMat);
      p.position.set(i * (w * 0.2), 2.4, d * 0.48);
      group.add(p);
    }
  } else if (archetype === 'pettah_bazaar') {
    // Striped Red/Cream Heritage Bazaar with corner domes & vibrant awnings
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - 1.5, d), bazaarMat);
    body.position.y = (h - 1.5) * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.9, d + 0.4), concreteMat);
    parapet.position.y = h - 1.1;
    group.add(parapet);

    // Corner heritage cupolas/domes
    const domeGeo = new THREE.SphereGeometry(1.15, 12, 10);
    const corners = [
      [-w * 0.4, -d * 0.4],
      [w * 0.4, -d * 0.4],
      [-w * 0.4, d * 0.4],
      [w * 0.4, d * 0.4],
    ];
    for (const [cx, cz] of corners) {
      const dome = new THREE.Mesh(domeGeo, goldMat);
      dome.position.set(cx, h - 0.1, cz);
      group.add(dome);
    }

    // Colorful street shopfront awning
    const awningMat = new THREE.MeshStandardMaterial({
      color: struct.accentColor ?? 0xe85d3f,
      roughness: 0.72,
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.22, 2.2), awningMat);
    awning.position.set(0, 3.1, d * 0.5 + 0.7);
    awning.rotation.x = 0.22;
    group.add(awning);
  } else if (archetype === 'temple_pavilion') {
    // Kandyan / Sri Lankan Heritage Temple Pavilion + Golden Dagoba Finial
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), concreteMat);
    base.position.y = 0.7;
    base.receiveShadow = true;
    group.add(base);

    const sanctum = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.48, d * 0.72), colonialMat);
    sanctum.position.y = 1.4 + h * 0.24;
    sanctum.castShadow = true;
    group.add(sanctum);

    // Double-tiered Kandyan terracotta roof
    const lowerRoof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, 2.8, 4), terracottaMat);
    lowerRoof.rotation.y = Math.PI / 4;
    lowerRoof.position.y = 1.4 + h * 0.48 + 1.1;
    lowerRoof.castShadow = true;
    group.add(lowerRoof);

    const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.46, 2.5, 4), terracottaMat);
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.position.y = 1.4 + h * 0.48 + 3.2;
    group.add(upperRoof);

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), goldMat);
    finial.position.y = 1.4 + h * 0.48 + 5.1;
    group.add(finial);
  } else if (archetype === 'lighthouse') {
    // Galle / Colombo Coastal White-and-Crimson Lighthouse Tower
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.48, w * 0.55, 3.2, 12), concreteMat);
    plinth.position.y = 1.6;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.68 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc9302c, roughness: 0.65 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.8, h - 6.2, 14), whiteMat);
    shaft.position.y = 3.2 + (h - 6.2) * 0.5;
    shaft.castShadow = true;
    group.add(shaft);

    const redBand = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.38, 4.2, 14), stripeMat);
    redBand.position.y = h * 0.55;
    group.add(redBand);

    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.2, 0.7, 14), trimDarkMat);
    gallery.position.y = h - 2.9;
    group.add(gallery);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 2.2, 12),
      new THREE.MeshStandardMaterial({
        color: 0xfff3b0,
        emissive: 0xffd166,
        emissiveIntensity: 1.9,
        roughness: 0.15,
      }),
    );
    lantern.position.y = h - 1.45;
    group.add(lantern);

    const dome = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.9, 12), stripeMat);
    dome.position.y = h + 0.5;
    group.add(dome);
  } else if (archetype === 'kiosk_arcade') {
    // Vibrant Pettah Street Spice & Textile Kiosk Row
    const baseDeck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), concreteMat);
    baseDeck.position.y = 0.175;
    baseDeck.receiveShadow = true;
    group.add(baseDeck);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, h - 0.6, 0.6), bazaarMat);
    backWall.position.set(0, (h - 0.6) * 0.5 + 0.3, -d * 0.4);
    backWall.castShadow = true;
    group.add(backWall);

    const stallColors = [0xe85d3f, 0xf5b942, 0x2a9d8f, 0xdf4c8c];
    for (let i = 0; i < 3; i++) {
      const sx = -w * 0.32 + i * (w * 0.32);
      const stallAwning = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.3, 0.18, d * 0.82),
        new THREE.MeshStandardMaterial({ color: stallColors[i % stallColors.length], roughness: 0.74 }),
      );
      stallAwning.position.set(sx, h - 0.4, 0.25);
      stallAwning.rotation.x = 0.18;
      stallAwning.castShadow = true;
      group.add(stallAwning);

      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.25, 1.0, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x7a4e2d, roughness: 0.8 }),
      );
      counter.position.set(sx, 0.85, d * 0.18);
      group.add(counter);
    }
  } else {
    // Hotel Tower / Commercial Plaza / Civic Hall
    const accent = new THREE.MeshStandardMaterial({
      color: struct.accentColor ?? 0x3b6e8c,
      roughness: 0.42,
      metalness: 0.3,
    });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 3.6, d + 0.6), concreteMat);
    podium.position.y = 1.8;
    podium.castShadow = true;
    podium.receiveShadow = true;
    group.add(podium);

    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.6, h - 3.6, d - 0.6),
      archetype === 'civic_hall' ? colonialMat : glassMat,
    );
    mainBody.position.y = 3.6 + (h - 3.6) * 0.5;
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    group.add(mainBody);

    // Horizontal tropical sun-louvers & crown
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 1.2, d + 0.2), accent);
    crown.position.y = h + 0.4;
    group.add(crown);

    const mechBox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, 2.1, d * 0.46), trimDarkMat);
    mechBox.position.y = h + 1.8;
    group.add(mechBox);
  }

  // Facade / rooftop landmark nameplate (clearly distinguishes real Google Maps synced structures)
  const sign = createLandmarkSignMesh(struct.name, struct.source === 'google_maps');
  sign.position.set(0, Math.min(h + 2.4, 15.5), d * 0.5 + 0.38);
  group.add(sign);

  return group;
}

function chromeAccentMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xe6ecf2,
    roughness: 0.2,
    metalness: 0.88,
  });
}

/**
 * Creates shared geometries for InstancedMesh tropical Sri Lankan coconut palms
 * with gently curved trunks, coconut clusters, and 7 sweeping arched palm fronds.
 */
export function buildCoconutPalmInstancedMeshes(
  positions: { x: number; z: number; scale: number; rotY: number }[],
): THREE.Group {
  const group = new THREE.Group();
  const count = positions.length;

  // Gently curving segmented coconut trunk
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.28, 2.2, 0.08),
    new THREE.Vector3(0.55, 4.5, 0.14),
    new THREE.Vector3(0.48, 6.4, 0.1),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 8, 0.17, 7, false);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x7c5a3f,
    roughness: 0.92,
    metalness: 0.02,
  });

  // Build 7 sweeping arched coconut fronds around crown apex (0.48, 6.4, 0.1)
  const frondPositions: number[] = [];
  const frondNormals: number[] = [];
  const frondIndices: number[] = [];
  let vertOffset = 0;

  const frondCount = 7;
  for (let f = 0; f < frondCount; f++) {
    const angle = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.12;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const perpX = -sinA;
    const perpZ = cosA;
    const lift = f % 2 === 0 ? 0.55 : 0.25;
    const length = 2.65 + (f % 3) * 0.25;

    // 4 arched spine stations -> double-sided broad leaf strip tapering to a sharp tip
    const stations = [
      { t: 0.0, y: 0.0, halfW: 0.18 },
      { t: 0.34, y: 0.42 + lift, halfW: 0.44 },
      { t: 0.72, y: 0.18 + lift * 0.4, halfW: 0.34 },
      { t: 1.0, y: -0.68, halfW: 0.04 },
    ];

    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      const r = st.t * length;
      const cx = 0.48 + cosA * r;
      const cy = 6.4 + st.y;
      const cz = 0.1 + sinA * r;
      // Left edge, spine ridge (slightly raised), right edge
      frondPositions.push(
        cx - perpX * st.halfW, cy - 0.08, cz - perpZ * st.halfW,
        cx, cy + 0.07, cz,
        cx + perpX * st.halfW, cy - 0.08, cz + perpZ * st.halfW,
      );
      frondNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }

    for (let s = 0; s < stations.length - 1; s++) {
      const row0 = vertOffset + s * 3;
      const row1 = vertOffset + (s + 1) * 3;
      // Left half & right half triangles
      frondIndices.push(row0, row1, row0 + 1, row0 + 1, row1, row1 + 1);
      frondIndices.push(row0 + 1, row1 + 1, row0 + 2, row0 + 2, row1 + 1, row1 + 2);
    }
    vertOffset += stations.length * 3;
  }

  const frondGeo = new THREE.BufferGeometry();
  frondGeo.setAttribute('position', new THREE.Float32BufferAttribute(frondPositions, 3));
  frondGeo.setAttribute('normal', new THREE.Float32BufferAttribute(frondNormals, 3));
  frondGeo.setIndex(frondIndices);
  frondGeo.computeVertexNormals();

  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x3b8434,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  // King coconut cluster right under the fronds (Sri Lankan Thambili orange-gold!)
  const cocoGeo = new THREE.SphereGeometry(0.24, 8, 8);
  cocoGeo.translate(0.48, 6.18, 0.1);
  const cocoMat = new THREE.MeshStandardMaterial({
    color: 0xd98a2b,
    roughness: 0.55,
    metalness: 0.05,
  });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, count);
  const cocos = new THREE.InstancedMesh(cocoGeo, cocoMat, count);
  trunks.castShadow = true;
  fronds.castShadow = true;
  trunks.frustumCulled = false;
  fronds.frustumCulled = false;
  cocos.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const p = positions[i];
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    fronds.setMatrixAt(i, dummy.matrix);
    cocos.setMatrixAt(i, dummy.matrix);

    // Subtle organic frond tint variation
    color.setHSL(0.30 + ((i % 5) - 2) * 0.014, 0.48, 0.34 + (i % 3) * 0.04);
    fronds.setColorAt(i, color);
  }

  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  cocos.instanceMatrix.needsUpdate = true;
  if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;

  trunks.computeBoundingSphere();
  fronds.computeBoundingSphere();
  cocos.computeBoundingSphere();

  group.add(trunks, fronds, cocos);
  return group;
}
