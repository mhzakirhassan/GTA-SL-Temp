import type { WeaponId } from './types';

/**
 * Procedural Web Audio API synthesizer for GTA Sri Lanka.
 * Synthesizes engines, Tuk-Tuk horns, footsteps, punch/bat/gunshot audio,
 * monsoon rain pink-noise ambience, rolling thunder claps, sirens, and chimes.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private sirenPhase = 0;

  isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.38;
    this.masterGain.connect(this.ctx.destination);

    // Pre-generate 2 seconds of white noise for gunshots, thunder, and monsoon rain
    const sampleRate = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Continuous engine oscillator
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();

    // Continuous police siren oscillator
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 620;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);
    this.sirenOsc.start();

    // Continuous filtered monsoon rain noise loop
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1150;
    rainFilter.Q.value = 0.65;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    rainSrc.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.38, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  silenceLoops(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, now, 0.05);
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(0, now, 0.08);
  }

  updateContinuous(
    dt: number,
    inVehicle: boolean,
    speedNorm: number,
    isTukTuk: boolean,
    wantedStars: number,
    rainIntensity = 0,
    indoors = false,
  ): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.sirenOsc || !this.sirenGain) return;
    const now = this.ctx.currentTime;

    if (inVehicle) {
      const baseHz = isTukTuk ? 74 : 48;
      const spanHz = isTukTuk ? 120 : 105;
      this.engineOsc.frequency.setTargetAtTime(baseHz + speedNorm * spanHz, now, 0.06);
      this.engineGain.gain.setTargetAtTime(0.11 + speedNorm * 0.14, now, 0.06);
    } else {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
    }

    if (wantedStars > 0) {
      this.sirenPhase += dt * (2.6 + wantedStars * 0.35);
      const wail = 590 + Math.sin(this.sirenPhase) * 195;
      this.sirenOsc.frequency.setTargetAtTime(wail, now, 0.04);
      this.sirenGain.gain.setTargetAtTime(indoors ? 0.018 : 0.045, now, 0.12);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.12);
    }

    if (this.rainGain) {
      const targetRain = rainIntensity * (indoors ? 0.035 : 0.11);
      this.rainGain.gain.setTargetAtTime(targetRain, now, 0.2);
    }
  }

  playWeaponFire(weaponId: WeaponId): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    if (weaponId === 'fists' || weaponId === 'bat') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(weaponId === 'bat' ? 190 : 250, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.11);
      g.gain.setValueAtTime(weaponId === 'bat' ? 0.25 : 0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
      return;
    }

    // Filtered noise gunshot crack + low punch
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = weaponId === 'shotgun' ? 680 : weaponId === 'smg' ? 1650 : 1200;
      const g = this.ctx.createGain();
      const dur = weaponId === 'shotgun' ? 0.26 : weaponId === 'smg' ? 0.08 : 0.14;
      g.gain.setValueAtTime(weaponId === 'shotgun' ? 0.48 : weaponId === 'smg' ? 0.24 : 0.34, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    const thump = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thump.type = 'sawtooth';
    thump.frequency.setValueAtTime(weaponId === 'shotgun' ? 120 : 175, now);
    thump.frequency.exponentialRampToValueAtTime(34, now + 0.11);
    tg.gain.setValueAtTime(weaponId === 'shotgun' ? 0.32 : 0.16, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    thump.connect(tg);
    tg.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.13);
  }

  playThunder(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.36, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 1.55);
  }

  playHorn(isTukTuk: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = isTukTuk ? [440, 554] : [330, 415];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  }

  playImpact(weight: 'light' | 'heavy'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const pitchJitter = 0.92 + Math.random() * 0.16;
    osc.type = weight === 'heavy' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime((weight === 'heavy' ? 145 : 220) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + (weight === 'heavy' ? 0.22 : 0.1));
    g.gain.setValueAtTime(weight === 'heavy' ? 0.38 : 0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (weight === 'heavy' ? 0.24 : 0.11));
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playFootstep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 + Math.random() * 24, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);
    g.gain.setValueAtTime(0.075, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playTelegraph(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.18);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playCashChime(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [587.33, 880, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  playWastedSting(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.85);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.92);
  }
}
