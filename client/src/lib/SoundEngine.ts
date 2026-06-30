export class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  
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

    // Improved ADSR Envelope
    const now = this.ctx.currentTime;
    const attack = duration * 0.1;
    const release = duration * 0.4;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack); 
    gain.gain.setValueAtTime(volume, now + duration - release);
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
      const pan = (Math.random() - 0.5) * 0.5; // Slight random pan
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
    const pan = (Math.random() - 0.5) * 1.5; // Wider random pan for chaos
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

  // --- Procedural BGM ---

  public startGameplayBGM() {
    this.stopBGM();
    if (!this.ctx || this.isMuted) return;
    
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    
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
    
    const targetVol = 0.05 + Math.min(0.1, progressScore * 0.02);
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
      this.playTone(notes[noteIndex], 'sine', 2.0, 0.05, undefined, (Math.random()-0.5), true);
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
}
