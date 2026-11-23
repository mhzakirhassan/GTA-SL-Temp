import * as THREE from 'three';

export interface GameTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  facadeGlassMap: THREE.CanvasTexture;
  facadeColonialMap: THREE.CanvasTexture;
  facadeBazaarMap: THREE.CanvasTexture;
  facadeConcreteBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): GameTextureSet {
  // 1. Colombo Asphalt Road Texture (sun-baked tarmac + crisp yellow center stripes + lane dashes)
  const [roadC, roadCtx] = makeCanvas(512, 512);
  roadCtx.fillStyle = '#2d3138';
  roadCtx.fillRect(0, 0, 512, 512);
  // Subtle aggregate grain
  for (let i = 0; i < 6500; i++) {
    const x = (i * 73) % 512;
    const y = (i * 197 + Math.floor(i / 7) * 13) % 512;
    const v = 36 + ((i * 29) % 24);
    roadCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    roadCtx.fillRect(x, y, 2, 2);
  }
  // White shoulder edges
  roadCtx.fillStyle = '#dcd7cb';
  roadCtx.fillRect(22, 0, 10, 512);
  roadCtx.fillRect(480, 0, 10, 512);
  // Sri Lankan double yellow center line
  roadCtx.fillStyle = '#eab308';
  roadCtx.fillRect(247, 0, 7, 512);
  roadCtx.fillRect(258, 0, 7, 512);
  // Subtle tire wear tracks
  roadCtx.fillStyle = 'rgba(18, 20, 24, 0.25)';
  roadCtx.fillRect(105, 0, 54, 512);
  roadCtx.fillRect(353, 0, 54, 512);
  const asphaltMap = finalizeTexture(roadC, maxAnisotropy, true, 1, 16);

  // 2. Asphalt / Concrete Micro-Relief Bump Map
  const [bumpC, bumpCtx] = makeCanvas(256, 256);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const x = (i * 67) % 256;
    const y = (i * 149) % 256;
    const g = 95 + ((i * 37) % 70);
    bumpCtx.fillStyle = `rgb(${g},${g},${g})`;
    bumpCtx.fillRect(x, y, 2, 2);
  }
  const asphaltBump = finalizeTexture(bumpC, maxAnisotropy, false, 6, 36);
  const facadeConcreteBump = finalizeTexture(bumpC, maxAnisotropy, false, 2, 2);

  // 3. Coastal Sidewalk Interlock Pavers (Colombo Galle Face style warm stone)
  const [swC, swCtx] = makeCanvas(256, 256);
  swCtx.fillStyle = '#c8beab';
  swCtx.fillRect(0, 0, 256, 256);
  swCtx.strokeStyle = '#9c927f';
  swCtx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    const offset = (y / 32) % 2 === 0 ? 0 : 16;
    for (let x = -16; x < 256; x += 32) {
      swCtx.fillStyle = (x + y) % 64 === 0 ? '#cec4b0' : '#c0b5a0';
      swCtx.fillRect(x + offset + 1, y + 1, 30, 30);
      swCtx.strokeRect(x + offset, y, 32, 32);
    }
  }
  const sidewalkMap = finalizeTexture(swC, maxAnisotropy, true, 18, 18);

  // 4. Modern Glass Skyscraper Curtain Wall (Twin Towers / Hotels)
  const [glC, glCtx] = makeCanvas(512, 512);
  glCtx.fillStyle = '#1e354d';
  glCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const y = row * 64;
    // Floor spandrel band
    glCtx.fillStyle = '#cfd8df';
    glCtx.fillRect(0, y, 512, 12);
    for (let col = 0; col < 8; col++) {
      const x = col * 64;
      const lit = (row * 11 + col * 7) % 5 === 0;
      const grad = glCtx.createLinearGradient(x, y + 12, x, y + 62);
      if (lit) {
        grad.addColorStop(0, '#ffd89b');
        grad.addColorStop(1, '#c89652');
      } else {
        grad.addColorStop(0, '#3a6a91');
        grad.addColorStop(1, '#1c3a56');
      }
      glCtx.fillStyle = grad;
      glCtx.fillRect(x + 4, y + 14, 56, 46);
      // Mullion frame
      glCtx.strokeStyle = '#25313e';
      glCtx.lineWidth = 3;
      glCtx.strokeRect(x + 2, y + 12, 60, 50);
    }
  }
  const facadeGlassMap = finalizeTexture(glC, maxAnisotropy, true, 2, 3);

  // 5. Colonial Whitewashed & Timber Shutter Facade (Colombo Fort / Dutch Hospital)
  const [colC, colCtx] = makeCanvas(512, 512);
  colCtx.fillStyle = '#f2ead8';
  colCtx.fillRect(0, 0, 512, 512);
  // Subtle stucco warmth
  colCtx.fillStyle = '#e5dac3';
  for (let y = 0; y < 512; y += 128) {
    colCtx.fillRect(0, y + 114, 512, 14);
  }
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + 64;
      const cy = row * 128 + 68;
      // Arched colonnade window
      colCtx.fillStyle = '#2d4739'; // Ceylon heritage green timber shutter
      colCtx.beginPath();
      colCtx.arc(cx, cy - 16, 26, Math.PI, 0);
      colCtx.lineTo(cx + 26, cy + 34);
      colCtx.lineTo(cx - 26, cy + 34);
      colCtx.closePath();
      colCtx.fill();
      // Inner glass & cream trim
      colCtx.fillStyle = '#283642';
      colCtx.fillRect(cx - 16, cy - 14, 32, 42);
      colCtx.strokeStyle = '#fcf8ee';
      colCtx.lineWidth = 3;
      colCtx.strokeRect(cx - 16, cy - 14, 32, 42);
    }
  }
  const facadeColonialMap = finalizeTexture(colC, maxAnisotropy, true, 2, 1.5);

  // 6. Pettah Red-and-Cream Striped Heritage Brick (Inspired by Jami Ul-Alfar / Pettah)
  const [bazC, bazCtx] = makeCanvas(512, 512);
  for (let y = 0; y < 512; y += 32) {
    bazCtx.fillStyle = (y / 32) % 2 === 0 ? '#a82a2a' : '#f5ece0';
    bazCtx.fillRect(0, y, 512, 32);
  }
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + 64;
      const cy = row * 128 + 72;
      bazCtx.fillStyle = '#1f2329';
      bazCtx.beginPath();
      bazCtx.arc(cx, cy - 12, 22, Math.PI, 0);
      bazCtx.lineTo(cx + 22, cy + 34);
      bazCtx.lineTo(cx - 22, cy + 34);
      bazCtx.closePath();
      bazCtx.fill();
      bazCtx.strokeStyle = '#f5ece0';
      bazCtx.lineWidth = 4;
      bazCtx.stroke();
    }
  }
  const facadeBazaarMap = finalizeTexture(bazC, maxAnisotropy, true, 2, 2);

  // 7. Tropical Galle Face Green Lawn Texture
  const [grC, grCtx] = makeCanvas(256, 256);
  grCtx.fillStyle = '#4e7c3a';
  grCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4500; i++) {
    const x = (i * 89) % 256;
    const y = (i * 137) % 256;
    grCtx.fillStyle = i % 3 === 0 ? '#5c8d45' : '#406a2f';
    grCtx.fillRect(x, y, 3, 2);
  }
  const grassMap = finalizeTexture(grC, maxAnisotropy, true, 24, 24);

  // 8. Soft Radial Contact Shadow Disc
  const [shC, shCtx] = makeCanvas(128, 128);
  const radGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  radGrad.addColorStop(0, 'rgba(0,0,0,0.68)');
  radGrad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  radGrad.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = radGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shC);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  contactShadowMap.needsUpdate = true;

  return {
    asphaltMap,
    asphaltBump,
    sidewalkMap,
    facadeGlassMap,
    facadeColonialMap,
    facadeBazaarMap,
    facadeConcreteBump,
    contactShadowMap,
    grassMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBump.dispose();
      sidewalkMap.dispose();
      facadeGlassMap.dispose();
      facadeColonialMap.dispose();
      facadeBazaarMap.dispose();
      facadeConcreteBump.dispose();
      contactShadowMap.dispose();
      grassMap.dispose();
    },
  };
}
