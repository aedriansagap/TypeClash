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

  // Boss BGM Multi-Voice Synthesizer
  private activeBossId: string | null = null;
  private activeBossPhase: number = 1;
  private bossBgmInterval: any = null;
  private bossPreviewTimeout: any = null;
  private bossStep: number = 0;
  public isBossBgmPlaying: boolean = false;
  public previewingBossId: string | null = null;

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

    this.stopBossBGM();

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

  // --- Boss Battle Procedural Soundtracks --- //

  private playDrumHit(type: 'kick' | 'snare' | 'hihat' | 'impact' | 'glitch', volume: number = 0.18) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const finalVol = volume * this.sfxVolume * this.bgmVolume;
    if (finalVol <= 0.0001) return;

    if (type === 'kick') {
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
      gain.gain.setValueAtTime(finalVol * 1.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'impact') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.7);
      gain.gain.setValueAtTime(finalVol * 2.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      if (this.convolver) gain.connect(this.convolver);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.7);
    } else if (type === 'glitch') {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(600 + Math.random() * 800, now);
      osc.frequency.setValueAtTime(200 + Math.random() * 400, now + 0.04);
      gain.gain.setValueAtTime(finalVol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      // Noise synthesis for snare / hi-hat
      const duration = type === 'snare' ? 0.18 : 0.05;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type === 'snare' ? 'bandpass' : 'highpass';
      filter.frequency.value = type === 'snare' ? 1400 : 8000;
      gain.gain.setValueAtTime(finalVol * (type === 'snare' ? 1.4 : 0.8), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      noise.connect(filter);
      filter.connect(gain);
      if (this.convolver && type === 'snare') gain.connect(this.convolver);
      gain.connect(this.ctx.destination);
      noise.start(now);
    }
  }

  public startBossBGM(bossId: string, phase: number = 1) {
    this.stopBGM();
    if (!this.ctx || this.isMuted) return;

    this.activeBossId = bossId;
    this.activeBossPhase = phase;
    this.bossStep = 0;
    this.isBossBgmPlaying = true;

    this.scheduleNextBossTick();
  }

  public updateBossBGMPhase(phase: number) {
    if (this.activeBossPhase === phase) return;
    this.activeBossPhase = phase;
    
    // Play transition roar / alert effect
    if (phase === 2) {
      this.playBossRoar();
      // Restart loop timer with accelerated BPM
      if (this.bossBgmInterval) {
        clearTimeout(this.bossBgmInterval);
        this.bossBgmInterval = null;
      }
      this.scheduleNextBossTick();
    }
  }

  public previewBossTrack(bossId: string, durationMs: number = 8500) {
    if (this.previewingBossId === bossId) {
      // Toggle stop
      this.stopBossBGM();
      return;
    }

    this.stopBossBGM();
    this.previewingBossId = bossId;
    this.startBossBGM(bossId, 1);

    if (this.bossPreviewTimeout) {
      clearTimeout(this.bossPreviewTimeout);
    }

    this.bossPreviewTimeout = setTimeout(() => {
      if (this.previewingBossId === bossId) {
        this.stopBossBGM();
      }
    }, durationMs);
  }

  public stopBossBGM() {
    if (this.bossBgmInterval) {
      clearTimeout(this.bossBgmInterval);
      this.bossBgmInterval = null;
    }
    if (this.bossPreviewTimeout) {
      clearTimeout(this.bossPreviewTimeout);
      this.bossPreviewTimeout = null;
    }
    this.activeBossId = null;
    this.activeBossPhase = 1;
    this.isBossBgmPlaying = false;
    this.previewingBossId = null;
  }

  private scheduleNextBossTick() {
    if (!this.isBossBgmPlaying || !this.activeBossId || !this.ctx || this.isMuted) return;

    const bossId = this.activeBossId;
    const phase = this.activeBossPhase;

    // Calculate step interval based on Boss BPM and Phase
    let baseBpm = 135;
    if (bossId === 'ignis') baseBpm = phase === 1 ? 140 : 168;
    else if (bossId === 'glitch') baseBpm = phase === 1 ? 135 : 162;
    else if (bossId === 'chronos') baseBpm = phase === 1 ? 120 : 144;

    const stepMs = Math.round((60000 / baseBpm) / 4); // 16th note tick

    // Execute current step
    this.stepBossTrack(bossId, this.bossStep, phase, stepMs / 1000);

    // Advance 16-step sequencer
    this.bossStep = (this.bossStep + 1) % 16;

    this.bossBgmInterval = setTimeout(() => {
      this.scheduleNextBossTick();
    }, stepMs);
  }

  private stepBossTrack(bossId: string, step: number, phase: number, stepDuration: number) {
    if (!this.ctx || this.isMuted) return;

    if (bossId === 'ignis') {
      this.stepIgnisTheme(step, phase, stepDuration);
    } else if (bossId === 'glitch') {
      this.stepGlitchTheme(step, phase, stepDuration);
    } else if (bossId === 'chronos') {
      this.stepChronosTheme(step, phase, stepDuration);
    }
  }

  // --- Theme 1: Ignis "Infernal Cataclysm" (Industrial Heavy Metal / Rock) --- //
  private stepIgnisTheme(step: number, phase: number, stepDuration: number) {
    const bassScale = [41.20, 41.20, 49.00, 41.20, 41.20, 55.00, 41.20, 61.74, 41.20, 41.20, 49.00, 41.20, 41.20, 73.42, 65.41, 61.74]; // E1-G1-A1-B1
    const leadScale = [164.81, 196.00, 246.94, 329.63, 392.00, 329.63, 246.94, 196.00, 146.83, 174.61, 220.00, 293.66, 349.23, 293.66, 220.00, 174.61];

    // 1. Driving Bassline (Sawtooth + Overdrive feel)
    const bassFreq = bassScale[step];
    const bassVol = 0.08 * this.bgmVolume;
    this.playTone(bassFreq, 'sawtooth', stepDuration * 0.9, bassVol);
    if (phase === 2) {
      // Phase 2 adds octave power 5th
      this.playTone(bassFreq * 1.5, 'square', stepDuration * 0.8, bassVol * 0.7);
    }

    // 2. Searing Lead Arpeggios
    if (step % 2 === 0 || phase === 2) {
      const leadFreq = leadScale[step] * (phase === 2 ? 2 : 1);
      const leadVol = 0.05 * this.bgmVolume;
      this.playTone(leadFreq, 'sawtooth', stepDuration * 1.2, leadVol, leadFreq * 1.05, 0.2, true);
    }

    // 3. Heavy Industrial Drums
    if (step === 0 || step === 8) {
      this.playDrumHit('kick', 0.22);
    } else if (phase === 2 && (step === 10 || step === 14)) {
      this.playDrumHit('kick', 0.18);
    }

    if (step === 4 || step === 12) {
      this.playDrumHit('snare', 0.2);
    }

    if (step % 2 === 0 || phase === 2) {
      this.playDrumHit('hihat', 0.08);
    }
  }

  // --- Theme 2: Glitch "Cyber Matrix Overclock" (Cyberpunk Darksynth / Chiptune) --- //
  private stepGlitchTheme(step: number, phase: number, stepDuration: number) {
    const bassPattern = [73.42, 0, 73.42, 0, 87.31, 0, 73.42, 0, 98.00, 0, 103.83, 110.00, 73.42, 0, 65.41, 69.30]; // D2 synth bass
    const leadPattern = [293.66, 349.23, 440.00, 587.33, 523.25, 440.00, 349.23, 293.66, 329.63, 392.00, 466.16, 659.25, 587.33, 466.16, 392.00, 329.63]; // 16th-note Chiptune

    // 1. Cyber Syncopated Square Bass
    const bassFreq = bassPattern[step];
    if (bassFreq > 0) {
      const bassVol = 0.09 * this.bgmVolume;
      this.playTone(bassFreq, 'square', stepDuration * 0.85, bassVol, bassFreq * 0.95);
    }

    // 2. Chiptune 16th-note Arpeggio
    const leadFreq = leadPattern[step] * (phase === 2 ? 1.5 : 1);
    const leadVol = 0.045 * this.bgmVolume;
    this.playTone(leadFreq, 'triangle', stepDuration * 0.8, leadVol, undefined, (Math.random() - 0.5) * 0.6);

    // 3. Synthwave Drums & Glitch bursts
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      this.playDrumHit('kick', 0.2);
    }

    if (step === 4 || step === 12) {
      this.playDrumHit('snare', 0.18);
    }

    if (step === 6 || step === 14 || (phase === 2 && step % 4 === 2)) {
      this.playDrumHit('glitch', 0.15);
    }

    this.playDrumHit('hihat', 0.06);
  }

  // --- Theme 3: Chronos "Temporal Apocalypse" (Cinematic Dark Cosmic Orchestral) --- //
  private stepChronosTheme(step: number, phase: number, stepDuration: number) {
    const subBass = [27.50, 27.50, 27.50, 27.50, 21.83, 21.83, 21.83, 21.83, 25.96, 25.96, 25.96, 25.96, 41.20, 41.20, 41.20, 41.20]; // A0 - F0 - G#0 - E1
    const padChords = [
      [110.00, 130.81, 164.81], // Am
      [87.31, 110.00, 130.81],  // F
      [103.83, 123.47, 164.81], // E/G#
      [82.41, 110.00, 164.81]   // Am/E
    ];

    // 1. Subterranean Sub-Bass
    if (step % 4 === 0) {
      const bassFreq = subBass[step];
      const bassVol = 0.12 * this.bgmVolume;
      this.playTone(bassFreq, 'sine', stepDuration * 3.8, bassVol);
    }

    // 2. Cosmic Ambient Pad Chords (Sustained atmospheric triad)
    if (step % 4 === 0) {
      const chordIdx = Math.floor(step / 4);
      const chord = padChords[chordIdx];
      const padVol = 0.04 * this.bgmVolume;
      chord.forEach(freq => {
        this.playTone(freq * (phase === 2 ? 2 : 1), 'sine', stepDuration * 3.5, padVol, undefined, 0, true);
      });
    }

    // 3. Apocalyptic Impacts & Cosmic Echoes
    if (step === 0 || (phase === 2 && step === 8)) {
      this.playDrumHit('impact', 0.24);
    }

    if (step === 4 || step === 12) {
      this.playDrumHit('snare', 0.14);
    }

    if (phase === 2 && step % 2 === 0) {
      // Rapid cosmic pulse
      this.playTone(440 + step * 25, 'triangle', stepDuration * 0.6, 0.03 * this.bgmVolume, undefined, (step % 4 === 0 ? -0.5 : 0.5), true);
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
    this.stopBossBGM();
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



