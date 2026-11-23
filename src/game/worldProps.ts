import * as THREE from 'three';
import type { StructureRecord } from './types';
import type { GameTextureSet } from './textures';
import { getTerrainHeight, ROAD_X_LINES, ROAD_Z_LINES } from './worldMath';

export interface EnterableBuildingView {
  struct: StructureRecord;
  group: THREE.Group;
  roofGroup: THREE.Group;
  doorBeacon: THREE.Mesh;
  interiorMarker: THREE.Mesh;
}

export interface WorldPropsRig {
  group: THREE.Group;
  boats: { mesh: THREE.Group; baseY: number; phase: number }[];
  beiraWater: THREE.Mesh;
  trafficLights: { red: THREE.MeshStandardMaterial; green: THREE.MeshStandardMaterial }[];
}

function makeSignPlane(
  text: string,
  subtext: string,
  bgHex: string,
  borderHex: string,
  textHex: string,
  w = 5.4,
  h = 1.25,
): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = textHex;
  ctx.font = '800 40px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);
  ctx.fillStyle = '#f8f5ee';
  ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText(subtext, 256, 94);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
}

/**
 * Builds an enterable 1:1 walk-in Sri Lankan building with real solid walls,
 * a generous 3.5m open front doorway, glowing entrance welcome mat,
 * full interior furniture, and a detachable roofGroup that hides cleanly when
 * Kasun walks inside!
 */
export function createEnterableBuildingModel(
  struct: StructureRecord,
  textures: GameTextureSet,
): EnterableBuildingView {
  const group = new THREE.Group();
  group.position.set(struct.x, 0, struct.z);

  const roofGroup = new THREE.Group();
  group.add(roofGroup);

  const w = struct.width;
  const d = struct.depth;
  const h = struct.height;
  const hw = w * 0.5;
  const hd = d * 0.5;
  const wallT = 0.45;
  const doorHalf = 1.75;
  const doorH = 3.2;
  const facing = struct.doorFacing ?? 'west';
  const kind = struct.enterable ?? 'armory';

  // Exterior & interior palettes tailored to each Sri Lankan walk-in venue
  const wallColor =
    kind === 'armory'
      ? 0x2c333f
      : kind === 'cafe_shop'
        ? 0xdcc7a4
        : kind === 'safehouse'
          ? 0xeee5d4
          : 0xd6cfc0;
  const floorColor =
    kind === 'armory'
      ? 0x1e222b
      : kind === 'cafe_shop'
        ? 0x8f4d32
        : kind === 'safehouse'
          ? 0x7c5436
          : 0xe6dfd0;
  const accentHex =
    struct.accentColor ??
    (kind === 'armory'
      ? 0xe85d3f
      : kind === 'cafe_shop'
        ? 0x2a9d8f
        : kind === 'safehouse'
          ? 0xf5b942
          : 0xd4a24c);

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.78,
    metalness: kind === 'armory' ? 0.22 : 0.05,
    bumpMap: textures.facadeConcreteBump,
    bumpScale: 0.04,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: kind === 'bank_vault' ? 0.28 : 0.72,
    metalness: kind === 'bank_vault' ? 0.18 : 0.04,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.35,
    metalness: 0.32,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.75 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.35, metalness: 0.78 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf5b942,
    roughness: 0.22,
    metalness: 0.88,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });

  // 1. Interior tiled floor (y = 0.07 so it sits cleanly above sidewalk)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.12, d - 0.1), floorMat);
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  group.add(floor);

  // Helper to build solid wall or wall with open 3.5m doorway
  const addWallSpan = (
    sx: number,
    sz: number,
    bw: number,
    bh: number,
    bd: number,
    yCenter = bh * 0.5,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
    m.position.set(sx, yCenter, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };

  // North & South walls
  for (const side of ['north', 'south'] as const) {
    const zPos = side === 'north' ? -hd + wallT * 0.5 : hd - wallT * 0.5;
    if (facing === side) {
      const segW = hw - doorHalf;
      addWallSpan(-doorHalf - segW * 0.5, zPos, segW, h, wallT);
      addWallSpan(doorHalf + segW * 0.5, zPos, segW, h, wallT);
      addWallSpan(0, zPos, doorHalf * 2, h - doorH, wallT, doorH + (h - doorH) * 0.5);
    } else {
      addWallSpan(0, zPos, w, h, wallT);
    }
  }

  // West & East walls
  for (const side of ['west', 'east'] as const) {
    const xPos = side === 'west' ? -hw + wallT * 0.5 : hw - wallT * 0.5;
    if (facing === side) {
      const segD = hd - doorHalf;
      addWallSpan(xPos, -doorHalf - segD * 0.5, wallT, h, segD);
      addWallSpan(xPos, doorHalf + segD * 0.5, wallT, h, segD);
      addWallSpan(xPos, 0, wallT, h - doorH, doorHalf * 2, doorH + (h - doorH) * 0.5);
    } else {
      addWallSpan(xPos, 0, wallT, h, d);
    }
  }

  // 2. Glowing entrance portal frame, welcome mat, and overhead "WALK IN" sign
  const doorCoordX = facing === 'west' ? -hw : facing === 'east' ? hw : 0;
  const doorCoordZ = facing === 'north' ? -hd : facing === 'south' ? hd : 0;
  const doorRotY =
    facing === 'west'
      ? -Math.PI / 2
      : facing === 'east'
        ? Math.PI / 2
        : facing === 'north'
          ? Math.PI
          : 0;

  const doorFrame = new THREE.Group();
  doorFrame.position.set(doorCoordX, 0, doorCoordZ);
  doorFrame.rotation.y = doorRotY;
  group.add(doorFrame);

  const postGeo = new THREE.BoxGeometry(0.24, doorH, 0.58);
  const postL = new THREE.Mesh(postGeo, glowMat);
  postL.position.set(-doorHalf, doorH * 0.5, 0);
  const postR = new THREE.Mesh(postGeo, glowMat);
  postR.position.set(doorHalf, doorH * 0.5, 0);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.48, 0.28, 0.62), glowMat);
  lintel.position.set(0, doorH + 0.14, 0);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 1.4, 0.18, 1.9), accentMat);
  awning.position.set(0, doorH + 0.45, 0.95);
  awning.rotation.x = 0.22;
  doorFrame.add(postL, postR, lintel, awning);

  // Pulsing ground welcome beacon right outside doorway
  const beaconGeo = new THREE.RingGeometry(0.85, 1.32, 24);
  beaconGeo.rotateX(-Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const doorBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  doorBeacon.position.set(0, 0.14, 1.65);
  doorFrame.add(doorBeacon);

  const subLabel =
    kind === 'armory'
      ? 'WALK IN · WEAPONS & ARMOR'
      : kind === 'cafe_shop'
        ? 'WALK IN · KOTTU & HEAL'
        : kind === 'safehouse'
          ? 'WALK IN · REST & WARDROBE'
          : 'WALK IN · VAULT HEIST';
  const sign = makeSignPlane(
    struct.name.toUpperCase(),
    subLabel,
    'rgba(14, 12, 18, 0.94)',
    `#${accentHex.toString(16).padStart(6, '0')}`,
    '#ffd670',
    6.4,
    1.5,
  );
  sign.position.set(0, Math.min(h - 0.5, 4.9), 0.52);
  doorFrame.add(sign);

  // 3. Detachable Roof Group (hidden smoothly while Kasun is inside!)
  const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.55, d + 0.8), wallMat);
  roofSlab.position.y = h + 0.25;
  roofSlab.castShadow = true;
  roofGroup.add(roofSlab);

  const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.65, d + 0.4), accentMat);
  parapet.position.y = h + 0.72;
  roofGroup.add(parapet);

  if (kind === 'cafe_shop' || kind === 'safehouse') {
    const hipRoof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.74, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: 0xb85232, roughness: 0.78 }),
    );
    hipRoof.rotation.y = Math.PI / 4;
    hipRoof.position.y = h + 2.2;
    roofGroup.add(hipRoof);
  }

  // 4. Rich 1:1 Interior Furnishings (oriented neatly opposite the doorway)
  const interior = new THREE.Group();
  // Rotate interior so -Z inside interior always faces the back wall opposite the door
  interior.rotation.y = doorRotY;
  group.add(interior);

  // Glowing interactive service ring inside the room
  const markerGeo = new THREE.RingGeometry(0.75, 1.15, 24);
  markerGeo.rotateX(-Math.PI / 2);
  const interiorMarker = new THREE.Mesh(
    markerGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffd670,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  interiorMarker.position.set(0, 0.16, -0.7);
  interior.add(interiorMarker);

  if (kind === 'armory') {
    // Tactical service counter + glowing display glass
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 1.0), metalMat);
    counter.position.set(0, 0.58, -2.6);
    interior.add(counter);

    const glassTop = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.14, 0.9),
      new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, roughness: 0.1 }),
    );
    glassTop.position.set(0, 1.16, -2.6);
    interior.add(glassTop);

    // Mounted weapon rack along back wall
    const rackBoard = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.4, 0.16), woodMat);
    rackBoard.position.set(0, 2.1, -hd + 0.65);
    interior.add(rackBoard);
    for (let i = -2; i <= 2; i++) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 0.14), metalMat);
      gun.position.set(i * 1.15, 2.35, -hd + 0.8);
      interior.add(gun);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), goldMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(i * 1.15, 1.75, -hd + 0.8);
      interior.add(barrel);
    }

    // Stacked tactical ammo crates on sides
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3b4d36, roughness: 0.82 });
    for (const sx of [-4.1, 4.1]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), crateMat);
      crate.position.set(sx, 0.52, -2.4);
      interior.add(crate);
    }
  } else if (kind === 'cafe_shop') {
    // Warm Kottu & Ceylon Tea bar counter + dining tables
    const bar = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.05, 1.15), woodMat);
    bar.position.set(0, 0.58, -2.8);
    interior.add(bar);

    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.85), metalMat);
    grill.position.set(-1.3, 1.16, -2.8);
    interior.add(grill);

    const teaUrn = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.62, 12), goldMat);
    teaUrn.position.set(1.5, 1.4, -2.8);
    interior.add(teaUrn);

    // 4 Bistro tables with chairs
    const tableSpots = [
      [-3.4, 1.0],
      [3.4, 1.0],
      [-3.4, -1.3],
      [3.4, -1.3],
    ];
    for (const [tx, tz] of tableSpots) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 12), woodMat);
      top.position.set(tx, 0.84, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.78, 8), metalMat);
      leg.position.set(tx, 0.44, tz);
      interior.add(top, leg);
    }
  } else if (kind === 'safehouse') {
    // Cozy Colombo coastal villa living room + rug + sofa + bed + TV
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.04, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xb83232, roughness: 0.92 }),
    );
    rug.position.set(0, 0.14, 0.2);
    interior.add(rug);

    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x264653, roughness: 0.84 });
    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 1.1), sofaMat);
    sofaBase.position.set(0, 0.36, -2.4);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.75, 0.28), sofaMat);
    sofaBack.position.set(0, 0.78, -2.85);
    interior.add(sofaBase, sofaBack);

    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 2.6), woodMat);
    bedFrame.position.set(3.6, 0.36, -2.4);
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.28, 2.45),
      new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.9 }),
    );
    mattress.position.set(3.6, 0.72, -2.4);
    interior.add(bedFrame, mattress);

    // Wardrobe locker on left
    const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.8), woodMat);
    wardrobe.position.set(-4.2, 1.18, -2.6);
    interior.add(wardrobe);
  } else {
    // Colombo Heritage Bank lobby + teller counter + gold bullion vault
    const teller = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.15, 0.95), woodMat);
    teller.position.set(0, 0.62, -1.6);
    interior.add(teller);

    // Brass teller divider bars
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), goldMat);
      bar.position.set(i * 1.05, 1.72, -1.6);
      interior.add(bar);
    }

    // Open heavy circular steel vault door + stacked gold bullion bars in back!
    const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.24, 16), metalMat);
    vaultDoor.rotation.z = Math.PI / 2;
    vaultDoor.position.set(-2.3, 1.45, -3.7);
    interior.add(vaultDoor);

    for (let g = 0; g < 6; g++) {
      const ingot = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.34), goldMat);
      ingot.position.set(
        -0.7 + (g % 3) * 0.72,
        0.24 + Math.floor(g / 3) * 0.26,
        -4.1,
      );
      interior.add(ingot);
    }
  }

  return { struct, group, roofGroup, doorBeacon, interiorMarker };
}

/**
 * Builds varied Sri Lankan terrain features (sculpted sandy beach, rolling Galle Face Green
 * park knolls, Cinnamon Gardens elevated hillocks with hilltop gazebo, Beira Lake eastern
 * canal & arched footbridge, Sri Lankan Oruwa fishing boats, cricket pitch, street food carts,
 * traffic lights, bus shelters, and Colombo billboards).
 */
export function buildSriLankaTerrainAndProps(textures: GameTextureSet): WorldPropsRig {
  const group = new THREE.Group();
  const boats: { mesh: THREE.Group; baseY: number; phase: number }[] = [];
  const trafficLights: { red: THREE.MeshStandardMaterial; green: THREE.MeshStandardMaterial }[] = [];

  // 1. Sculpted Golden Sandy Beach strip along Galle Face waterfront (x = -80..-66)
  const beachGeo = new THREE.PlaneGeometry(16, 290, 8, 28);
  beachGeo.rotateX(-Math.PI / 2);
  const bPos = beachGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const wx = bPos.getX(i) - 74;
    const wz = bPos.getZ(i);
    bPos.setY(i, getTerrainHeight(wx, wz));
  }
  beachGeo.computeVertexNormals();
  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xdcc392,
    roughness: 0.94,
    metalness: 0.02,
  });
  const beachMesh = new THREE.Mesh(beachGeo, sandMat);
  beachMesh.position.set(-74, 0.01, 0);
  beachMesh.receiveShadow = true;
  group.add(beachMesh);

  // 2. Sculpted Galle Face Green Coastal Grass Park with gentle rolling knolls (-66..-50)
  const lawnGeo = new THREE.PlaneGeometry(16, 280, 10, 42);
  lawnGeo.rotateX(-Math.PI / 2);
  const lPos = lawnGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const wx = lPos.getX(i) - 58;
    const wz = lPos.getZ(i);
    lPos.setY(i, getTerrainHeight(wx, wz));
  }
  lawnGeo.computeVertexNormals();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.grassMap,
    roughness: 0.9,
    metalness: 0.02,
  });
  const lawnMesh = new THREE.Mesh(lawnGeo, grassMat);
  lawnMesh.position.set(-58, 0.02, 0);
  lawnMesh.receiveShadow = true;
  group.add(lawnMesh);

  // 3. Elevated Cinnamon Gardens & Highland Overlook Hills (NE & SE eastern terrain zones)
  const buildHillPatch = (centerX: number, centerZ: number) => {
    const hillGeo = new THREE.PlaneGeometry(46, 52, 14, 14);
    hillGeo.rotateX(-Math.PI / 2);
    const hp = hillGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const wx = hp.getX(i) + centerX;
      const wz = hp.getZ(i) + centerZ;
      hp.setY(i, getTerrainHeight(wx, wz));
    }
    hillGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hillGeo, grassMat);
    hill.position.set(centerX, 0.03, centerZ);
    hill.receiveShadow = true;
    group.add(hill);

    // Scenic Sri Lankan Hilltop Gazebo overlooking Colombo
    const gzY = getTerrainHeight(centerX + 8, centerZ);
    const gazebo = new THREE.Group();
    gazebo.position.set(centerX + 8, gzY, centerZ);
    const gBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.5, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.8 }),
    );
    gBase.position.y = 0.22;
    const gRoof = new THREE.Mesh(
      new THREE.ConeGeometry(3.8, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xb85232, roughness: 0.78 }),
    );
    gRoof.position.y = 3.8;
    gazebo.add(gBase, gRoof);
    const pMat = new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.7 });
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.9, 6), pMat);
      col.position.set(Math.cos(a) * 2.5, 1.65, Math.sin(a) * 2.5);
      gazebo.add(col);
    }
    group.add(gazebo);
  };
  buildHillPatch(100, -72);
  buildHillPatch(100, 72);

  // 4. Beira Lake Eastern Waterway + Arched Pedestrian Footbridge & Lotus Pads
  const beiraMat = new THREE.MeshPhysicalMaterial({
    color: 0x165f6e,
    roughness: 0.18,
    metalness: 0.16,
    clearcoat: 0.85,
  });
  const beiraWater = new THREE.Mesh(new THREE.PlaneGeometry(34, 76), beiraMat);
  beiraWater.rotation.x = -Math.PI / 2;
  beiraWater.position.set(96, 0.04, -4);
  group.add(beiraWater);

  // Arched wooden & gold footbridge spanning Beira Lake edge
  const bridgeWood = new THREE.MeshStandardMaterial({ color: 0x7c4e2a, roughness: 0.78 });
  const bridgeGold = new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.3, metalness: 0.7 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 4.2), bridgeWood);
  deck.position.set(86, 0.55, -4);
  group.add(deck);
  for (const rz of [-2.2, 1.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 0.14), bridgeGold);
    rail.position.set(86, 1.45, -4 + rz);
    group.add(rail);
  }
  // Floating lotus lily pads & pink buds on Beira Lake
  const padGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x2d7a46, roughness: 0.75 });
  const budGeo = new THREE.ConeGeometry(0.24, 0.32, 6);
  const budMat = new THREE.MeshStandardMaterial({ color: 0xdf4c8c, roughness: 0.45 });
  for (let i = 0; i < 14; i++) {
    const lx = 83 + (i % 4) * 5.2 + Math.sin(i * 2.1) * 1.4;
    const lz = -34 + i * 4.7;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(lx, 0.08, lz);
    group.add(pad);
    if (i % 2 === 0) {
      const bud = new THREE.Mesh(budGeo, budMat);
      bud.position.set(lx, 0.24, lz);
      group.add(bud);
    }
  }

  // 5. Galle Face Cricket Pitch & Wooden Stumps (iconic Colombo evening vibe!)
  const pitch = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 0.9 }),
  );
  pitch.position.set(-57, getTerrainHeight(-57, 6) + 0.06, 6);
  group.add(pitch);
  const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf4e4ba, roughness: 0.6 });
  for (const sz of [-1.2, 13.2]) {
    for (let s = -1; s <= 1; s++) {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), stumpMat);
      stump.position.set(-57 + s * 0.12, getTerrainHeight(-57, sz) + 0.48, sz);
      group.add(stump);
    }
  }

  // 6. Galle Face Street Food "Isso Wade" & King Coconut Carts with glowing bulbs
  const cartSpots: [number, number][] = [
    [-51.5, 24],
    [-51.5, -8],
    [-51.5, -36],
    [9.2, 10],
    [-9.2, -6],
  ];
  const cartBodyMat = new THREE.MeshStandardMaterial({ color: 0xe85d3f, roughness: 0.65 });
  const cartTopMat = new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff0b3,
    emissive: 0xffc857,
    emissiveIntensity: 1.5,
  });
  for (const [cx, cz] of cartSpots) {
    const cart = new THREE.Group();
    cart.position.set(cx, 0, cz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.1), cartBodyMat);
    base.position.y = 0.72;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.45), cartTopMat);
    canopy.position.y = 2.15;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), bulbMat);
    bulb.position.set(0, 1.98, 0.35);
    cart.add(base, canopy, bulb);
    for (const px of [-0.8, 0.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), bridgeWood);
      post.position.set(px, 1.6, 0);
      cart.add(post);
    }
    group.add(cart);
  }

  // 7. Sri Lankan Traditional Outrigger Fishing Boats (Oruwa) bobbing in the Indian Ocean!
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5c361e, roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf7efe1, roughness: 0.85, side: THREE.DoubleSide });
  const boatCoords: [number, number, number][] = [
    [-94, 0.1, 22],
    [-112, 0.1, -18],
    [-98, 0.1, -54],
    [-124, 0.1, 52],
  ];
  boatCoords.forEach(([bx, by, bz], idx) => {
    const b = new THREE.Group();
    b.position.set(bx, by, bz);
    b.rotation.y = 0.35 + idx * 0.6;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 5.2), hullMat);
    const outrigger = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.2, 8), hullMat);
    outrigger.rotation.x = Math.PI / 2;
    outrigger.position.set(2.1, -0.1, 0);
    const spar1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), bridgeWood);
    spar1.position.set(1.05, 0.15, 1.0);
    const spar2 = spar1.clone();
    spar2.position.z = -1.0;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6), bridgeWood);
    mast.position.y = 2.2;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), sailMat);
    sail.position.set(0.3, 2.3, 0.2);
    sail.rotation.y = 0.25;
    b.add(hull, outrigger, spar1, spar2, mast, sail);
    group.add(b);
    boats.push({ mesh: b, baseY: -0.12, phase: idx * 1.4 });
  });

  // 8. Colombo Intersection Traffic Lights + Bus Shelters + Iconic Billboards
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.45, metalness: 0.72 });
  for (const rx of ROAD_X_LINES) {
    for (const rz of ROAD_Z_LINES) {
      if (Math.abs(rx) > 45 || Math.abs(rz) > 45) continue;
      const redMat = new THREE.MeshStandardMaterial({
        color: 0xff2e2e,
        emissive: 0xff2222,
        emissiveIntensity: 1.6,
      });
      const greenMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x16a34a,
        emissiveIntensity: 0.3,
      });
      const tl = new THREE.Group();
      tl.position.set(rx + 7.4, 0, rz + 7.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), poleMat);
      pole.position.y = 2.6;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.42), poleMat);
      head.position.set(0, 4.9, 0);
      const rBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), redMat);
      rBulb.position.set(0, 5.18, 0.22);
      const gBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), greenMat);
      gBulb.position.set(0, 4.65, 0.22);
      tl.add(pole, head, rBulb, gBulb);
      group.add(tl);
      trafficLights.push({ red: redMat, green: greenMat });
    }
  }

  // 3 Iconic Colombo Street Billboards
  const billboards: [number, number, number, string, string, string][] = [
    [-9.5, 36, 0.35, 'CEYLON GOLD TEA', 'FINEST HIGHLAND BREW · COLOMBO', '#f5b942'],
    [9.5, -36, -0.35, 'NELUM KULUNA', 'LOTUS TOWER OBSERVATION DECK', '#df4c8c'],
    [-36, 9.5, Math.PI / 2, 'GALLE FACE GREEN', 'OCEANFRONT PROMENADE · 24/7', '#2a9d8f'],
  ];
  for (const [bx, bz, rotY, t1, t2, border] of billboards) {
    const bb = new THREE.Group();
    bb.position.set(bx, 0, bz);
    bb.rotation.y = rotY;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.4, 8), poleMat);
    stand.position.y = 2.7;
    const panel = makeSignPlane(t1, t2, 'rgba(18, 16, 24, 0.96)', border, '#ffd670', 5.2, 1.75);
    panel.position.y = 5.6;
    bb.add(stand, panel);
    group.add(bb);
  }

  return { group, boats, beiraWater, trafficLights };
}

/**
 * Builds glowing floating 3D world pickups (Cash, Medkit, Kevlar Armor, Ammo Crate).
 */
export function createPickupModel(kind: 'cash' | 'medkit' | 'armor' | 'ammo'): THREE.Group {
  const g = new THREE.Group();
  const ringColor =
    kind === 'cash'
      ? 0x4fd18b
      : kind === 'medkit'
        ? 0xef4444
        : kind === 'armor'
          ? 0x38bdf8
          : 0xf5b942;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.72, 20),
    new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);

  const item = new THREE.Group();
  item.name = 'spin';
  item.position.y = 0.85;
  g.add(item);

  const mat = new THREE.MeshStandardMaterial({
    color: ringColor,
    emissive: ringColor,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.35,
  });

  if (kind === 'cash') {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.24, 0.32), mat);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.26, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.3 }),
    );
    item.add(stack, band);
  } else if (kind === 'medkit') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.42, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.4 }),
    );
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.25), mat);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.25), mat);
    item.add(box, c1, c2);
  } else if (kind === 'armor') {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.24), mat);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.27),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }),
    );
    item.add(vest, plate);
  } else {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.38), mat);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.09, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.5 }),
    );
    lid.position.y = 0.2;
    item.add(crate, lid);
  }

  return g;
}
