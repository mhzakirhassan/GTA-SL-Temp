import type { WeatherAtmosphere } from './weather';

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface CloudPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  speed: number;
  alpha: number;
}

interface SplashRing {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
}

/**
 * Lightweight 2D Canvas atmospheric weather overlay renderer.
 * Renders subtle Colombo monsoon raindrops, glass-lens splashes, drifting tropical
 * cloud bands during overcast skies, warm sun rays during sunny weather, and
 * brief lightning sheet flashes over either the main 3D viewport or the Google Map.
 */
export class WeatherCanvasOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drops: RainDrop[] = [];
  private clouds: CloudPuff[] = [];
  private splashes: SplashRing[] = [];
  private width = 1;
  private height = 1;
  private time = 0;
  private compact: boolean;

  constructor(canvas: HTMLCanvasElement, compact = false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.compact = compact;
    this.resize();
    this.seedParticles();
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth || window.innerWidth);
    const h = Math.max(1, parent?.clientHeight || window.innerHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    // Render at 1x CSS resolution for crisp, zero-overhead atmospheric compositing
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private seedParticles(): void {
    const dropCount = this.compact ? 75 : 170;
    this.drops = [];
    for (let i = 0; i < dropCount; i++) {
      this.drops.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        len: (this.compact ? 11 : 16) + Math.random() * 18,
        speed: (this.compact ? 420 : 620) + Math.random() * 340,
        alpha: 0.16 + Math.random() * 0.28,
      });
    }

    const cloudCount = this.compact ? 7 : 11;
    this.clouds = [];
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: Math.random() * (this.width + 420) - 210,
        y: (this.compact ? 0.08 : 0.03) * this.height + Math.random() * this.height * (this.compact ? 0.78 : 0.42),
        rx: (this.compact ? 120 : 185) + Math.random() * 150,
        ry: (this.compact ? 42 : 62) + Math.random() * 48,
        speed: 14 + Math.random() * 22,
        alpha: 0.07 + Math.random() * 0.09,
      });
    }

    const splashCount = this.compact ? 12 : 24;
    this.splashes = [];
    for (let i = 0; i < splashCount; i++) {
      this.splashes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        life: Math.random(),
        maxLife: 0.45 + Math.random() * 0.45,
        radius: 4 + Math.random() * 7,
      });
    }
  }

  public render(dt: number, atmo: WeatherAtmosphere, lightningFlash: number, indoorDampen = 1): void {
    this.resize();
    this.time += dt;
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    ctx.clearRect(0, 0, W, H);

    // 1. Subtle golden sun shimmer beams on Sunny Colombo days
    if (atmo.sunDiscOpacity > 0.25 && indoorDampen > 0.3) {
      const rayAlpha = (atmo.sunDiscOpacity - 0.25) * 0.075 * indoorDampen;
      const grad = ctx.createRadialGradient(W * 0.16, H * 0.14, 12, W * 0.16, H * 0.14, W * 0.52);
      grad.addColorStop(0, `rgba(255, 224, 152, ${rayAlpha.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(245, 185, 66, ${(rayAlpha * 0.35).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(245, 185, 66, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Drifting Tropical Cloud Shadows / Mist Bands (Overcast & Monsoon)
    if (atmo.cloudCover > 0.22) {
      const coverScale = Math.min(1, (atmo.cloudCover - 0.2) / 0.75) * indoorDampen;
      const tint = this.compact
        ? atmo.mode === 'monsoon'
          ? '54, 74, 102'
          : '96, 114, 136'
        : atmo.mode === 'monsoon'
          ? '155, 175, 198'
          : '212, 222, 232';
      const boost = this.compact ? 1.55 : 1.0;
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        c.x += (c.speed + atmo.windStrength * 26) * dt;
        if (c.x - c.rx > W + 80) {
          c.x = -c.rx - 40;
          c.y = Math.random() * H * (this.compact ? 0.82 : 0.48);
        }
        const alpha = Math.min(0.32, c.alpha * coverScale * boost);
        if (alpha <= 0.004) continue;
        const grad = ctx.createRadialGradient(c.x, c.y, c.ry * 0.15, c.x, c.y, c.rx);
        grad.addColorStop(0, `rgba(${tint}, ${alpha.toFixed(3)})`);
        grad.addColorStop(1, `rgba(${tint}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Monsoon Falling Rain Streaks & Subtle Lens Droplet Ripples
    const rain = atmo.rainIntensity * indoorDampen;
    if (rain > 0.03) {
      const windDx = -125 * (0.4 + atmo.windStrength * 0.9);
      const activeDrops = Math.floor(this.drops.length * Math.min(1, rain * 1.15));
      const dropRgb = this.compact ? '36, 78, 132' : '202, 224, 245';
      const dropBoost = this.compact ? 1.65 : 1.25;

      ctx.lineCap = 'round';
      ctx.lineWidth = this.compact ? 1.35 : 1.4;
      for (let i = 0; i < activeDrops; i++) {
        const d = this.drops[i];
        d.x += windDx * dt;
        d.y += d.speed * (0.75 + rain * 0.45) * dt;

        if (d.y > H + 24) {
          d.y = -20 - Math.random() * 40;
          d.x = Math.random() * (W + 180);
        }
        if (d.x < -40) {
          d.x = W + 20 + Math.random() * 60;
        }

        const streakX = (windDx / d.speed) * d.len;
        const a = Math.min(0.62, d.alpha * Math.min(1, rain) * dropBoost);
        ctx.strokeStyle = `rgba(${dropRgb}, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + streakX, d.y + d.len);
        ctx.stroke();
      }

      // Subtle monsoon surface splashes / lens droplets
      if (rain > 0.35) {
        ctx.lineWidth = 1;
        const splashRgb = this.compact ? '48, 92, 146' : '210, 232, 250';
        for (let i = 0; i < this.splashes.length; i++) {
          const s = this.splashes[i];
          s.life += dt;
          if (s.life >= s.maxLife) {
            s.life = 0;
            s.x = Math.random() * W;
            s.y = (this.compact ? 0.1 : 0.45) * H + Math.random() * H * (this.compact ? 0.85 : 0.52);
          }
          const t = s.life / s.maxLife;
          const a = (1 - t) * (this.compact ? 0.36 : 0.22) * rain;
          ctx.strokeStyle = `rgba(${splashRgb}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, s.radius * (0.4 + t), s.radius * 0.45 * (0.4 + t), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // 4. Monsoon Lightning Flash Wash
    if (lightningFlash > 0.02 && indoorDampen > 0.3) {
      const flashAlpha = Math.min(0.28, lightningFlash * 0.26 * indoorDampen);
      ctx.fillStyle = `rgba(226, 240, 255, ${flashAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
