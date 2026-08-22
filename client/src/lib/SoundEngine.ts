export class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public sfxVolume: number = 0.8;
  public bgmVolume: number = 0.6;
  
  // BGM
  private bgmOscs: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private isPlayingGameplayBgm: boolean = false;
  private isPlayingMenuBgm: boolean = false;
  private menuBgmInterval: any = null;

  // Effects
  private convolver: ConvolverNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.setupReverb();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser.');
    }
  }

  private setupReverb() {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * 2.0; // 2 seconds
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (this.ctx.sampleRate * 0.5));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = impulse;
    
    // Create a global reverb bus
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.3; // Reverb mix
    this.convolver.connect(reverbGain);
    reverbGain.connect(this.ctx.destination);
  }

  public async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private playTone(
    frequency: number, 
    type: OscillatorType, 
    duration: number, 
    volume: number = 0.1, 
    pitchSweep?: number, 
    pan: number = 0,
    useReverb: boolean = false
  ) {
    if (!this.ctx || this.isMuted) return;

    const finalVolume = volume * this.sfxVolume;
    if (finalVolume <= 0.0001) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    let panner: StereoPannerNode | null = null;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
    }

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    
    if (pitchSweep) {
      osc.frequency.exponentialRampToValueAtTime(pitchSweep, this.ctx.currentTime + duration);
    }

    // ADSR Envelope
    const now = this.ctx.currentTime;
    const attack = duration * 0.1;
    const release = duration * 0.4;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(finalVolume, now + attack); 
    gain.gain.setValueAtTime(finalVolume, now + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration); 

    osc.connect(gain);
    
    const outputNode = panner ? panner : this.ctx.destination;
    if (panner) gain.connect(panner);
    
    if (useReverb && this.convolver) {
      if (panner) panner.connect(this.convolver);
      else gain.connect(this.convolver);
    }
    
    if (panner) panner.connect(this.ctx.destination);
    else gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  public playKeystroke(correct: boolean, combo: number) {
    if (correct) {
      const baseFreq = 400;
      const comboMod = Math.min(500, combo * 10);
      const pan = (Math.random() - 0.5) * 0.5;
      this.playTone(baseFreq + comboMod, 'sine', 0.1, 0.2, undefined, pan);
    } else {
      this.playTone(150, 'sawtooth', 0.2, 0.3, 100, 0, true);
    }
  }

  public playWordComplete() {
    this.playTone(800, 'sine', 0.15, 0.2);
    setTimeout(() => this.playTone(1200, 'sine', 0.3, 0.2, undefined, 0, true), 100);
  }

  public playGarbageSent() {
    const pan = (Math.random() - 0.5) * 1.5;
    this.playTone(1200, 'square', 0.4, 0.2, 200, pan, true);
  }

  public playLifeLost() {
    this.playTone(300, 'sawtooth', 0.8, 0.4, 50, 0, true);
  }

  public playWin() {
    const freqs = [440, 554.37, 659.25, 880];
    freqs.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.5, 0.3, undefined, 0, true), i * 150);
    });
  }

  public playLose() {
    const freqs = [880, 659.25, 523.25, 440];
    freqs.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.5, 0.3, 200, 0, true), i * 200);
    });
  }

  public playUIHover() {
    this.playTone(600, 'sine', 0.05, 0.05);
  }

  public playUIClick() {
    this.playTone(900, 'square', 0.05, 0.1);
  }

  public playComboMilestone(combo: number) {
    const baseFreq = 440 + (combo * 5);
    this.playTone(baseFreq, 'sine', 0.2, 0.2, undefined, -0.5, true);
    setTimeout(() => this.playTone(baseFreq * 1.5, 'sine', 0.4, 0.2, undefined, 0.5, true), 150);
  }

  public playDifficultyUp() {
    this.playTone(400, 'sawtooth', 0.5, 0.2, 800, 0, true);
  }

  public playPowerUpGained() {
    this.playTone(600, 'sine', 0.1, 0.2, undefined, 0, true);
    setTimeout(() => this.playTone(800, 'sine', 0.2, 0.2, undefined, 0, true), 100);
    setTimeout(() => this.playTone(1000, 'sine', 0.3, 0.2, undefined, 0, true), 200);
  }

  public playPowerUpUsed() {
    this.playTone(200, 'square', 0.5, 0.3, 50, 0, true);
  }

  // --- Procedural BGM ---

  public startGameplayBGM() {
    this.stopBGM();
    if (!this.ctx || this.isMuted) return;
    
    this.bgmGain = this.ctx.createGain();
    const initVol = 0.05 * this.bgmVolume;
    this.bgmGain.gain.setValueAtTime(initVol, this.ctx.currentTime);
    
    // Add a slight lowpass filter to BGM
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    this.bgmGain.connect(filter);
    filter.connect(this.ctx.destination);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65.41, this.ctx.currentTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(65.8, this.ctx.currentTime);

    osc1.connect(this.bgmGain);
    osc2.connect(this.bgmGain);

    osc1.start();
    osc2.start();
    
    this.bgmOscs = [osc1, osc2];
    this.isPlayingGameplayBgm = true;
  }

  public updateGameplayBGM(progressScore: number) {
    if (!this.ctx || !this.isPlayingGameplayBgm || this.bgmOscs.length < 2 || !this.bgmGain) return;
    
    const baseFreq = 65.41;
    const targetFreq = baseFreq + (progressScore * 10);
    
    this.bgmOscs[0].frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.5);
    this.bgmOscs[1].frequency.setTargetAtTime(targetFreq + 0.5, this.ctx.currentTime, 0.5);
    
    const targetVol = (0.05 + Math.min(0.1, progressScore * 0.02)) * this.bgmVolume;
    this.bgmGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
  }

  public startMenuBGM() {
    if (this.isPlayingMenuBgm || this.isPlayingGameplayBgm) return;
    this.stopBGM();
    if (!this.ctx || this.isMuted) return;
    
    this.isPlayingMenuBgm = true;

    const notes = [261.63, 329.63, 392.00, 493.88];
    let noteIndex = 0;

    const playNextNote = () => {
      if (!this.isPlayingMenuBgm || !this.ctx || this.isMuted) return;
      const noteVol = 0.05 * this.bgmVolume;
      this.playTone(notes[noteIndex], 'sine', 2.0, noteVol, undefined, (Math.random()-0.5), true);
      noteIndex = (noteIndex + 1) % notes.length;
    };

    playNextNote();
    this.menuBgmInterval = setInterval(playNextNote, 1000);
  }

  public stopBGM() {
    this.bgmOscs.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch(e) {}
    });
    this.bgmOscs = [];
    
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }

    if (this.menuBgmInterval) {
      clearInterval(this.menuBgmInterval);
      this.menuBgmInterval = null;
    }

    this.isPlayingGameplayBgm = false;
    this.isPlayingMenuBgm = false;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopBGM();
    }
  }

  public setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  public setBgmVolume(volume: number) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(0.05 * this.bgmVolume, this.ctx.currentTime, 0.1);
    }
  }

  // --- Boss Battle Sound Effects --- //

  public playBossRoar() {
    // Deep rumbling low pitch oscillator sweep
    this.playTone(110, 'sawtooth', 1.2, 0.35, 45, 0, true);
    setTimeout(() => {
      this.playTone(85, 'square', 0.8, 0.3, 35, 0, true);
    }, 150);
  }

  public playBossHit(isCrit: boolean = false) {
    if (isCrit) {
      this.playTone(587.33, 'triangle', 0.25, 0.25, 880);
      this.playTone(880, 'sine', 0.2, 0.3, 1174.66);
    } else {
      this.playTone(220, 'sawtooth', 0.12, 0.15, 140);
    }
  }

  public playBossCastWarning() {
    this.playTone(440, 'square', 0.15, 0.2, 880);
    setTimeout(() => {
      this.playTone(660, 'square', 0.2, 0.25, 1320);
    }, 120);
  }

  public playShieldBroken() {
    this.playTone(880, 'sine', 0.3, 0.3, 220);
    this.playTone(1200, 'triangle', 0.4, 0.35, 300);
  }

  public playBossDefeated() {
    // Grand orchestral triumphant chord sequence
    const chords = [
      [261.63, 329.63, 392.00], // C
      [349.23, 440.00, 523.25], // F
      [392.00, 493.88, 587.33], // G
      [523.25, 659.25, 783.99]  // High C
    ];

    chords.forEach((chord, idx) => {
      setTimeout(() => {
        chord.forEach(freq => {
          this.playTone(freq, 'triangle', 0.6, 0.25, undefined, 0, true);
          this.playTone(freq * 2, 'sine', 0.4, 0.15, undefined, 0, true);
        });
      }, idx * 280);
    });
  }
}


