export class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  
  // BGM
  private bgmOscs: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private isPlayingGameplayBgm: boolean = false;
  private isPlayingMenuBgm: boolean = false;
  private menuBgmInterval: any = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser.');
    }
  }

  public async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private playTone(frequency: number, type: OscillatorType, duration: number, volume: number = 0.1, pitchSweep?: number) {
    if (!this.ctx || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    
    if (pitchSweep) {
      osc.frequency.exponentialRampToValueAtTime(pitchSweep, this.ctx.currentTime + duration);
    }

    // Envelope
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + duration * 0.1); // Attack
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); // Decay

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  public playKeystroke(correct: boolean, combo: number) {
    if (correct) {
      // Pitch goes up slightly with combo! (max +500hz)
      const baseFreq = 400;
      const comboMod = Math.min(500, combo * 10);
      this.playTone(baseFreq + comboMod, 'sine', 0.1, 0.2);
    } else {
      // Dissonant low buzz
      this.playTone(150, 'sawtooth', 0.2, 0.3, 100);
    }
  }

  public playWordComplete() {
    // Pleasant chime
    this.playTone(800, 'sine', 0.15, 0.2);
    setTimeout(() => this.playTone(1200, 'sine', 0.3, 0.2), 100);
  }

  public playGarbageSent() {
    // Whoosh / Laser
    this.playTone(1200, 'square', 0.4, 0.2, 200);
  }

  public playLifeLost() {
    // Descending harsh tone
    this.playTone(300, 'sawtooth', 0.8, 0.4, 50);
  }

  public playWin() {
    // Major arpeggio
    const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    freqs.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.5, 0.3), i * 150);
    });
  }

  public playLose() {
    // Minor descending arpeggio
    const freqs = [880, 659.25, 523.25, 440]; // A5, E5, C5, A4
    freqs.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.5, 0.3, 200), i * 200);
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
    this.playTone(baseFreq, 'sine', 0.2, 0.2);
    setTimeout(() => this.playTone(baseFreq * 1.5, 'sine', 0.4, 0.2), 150);
  }

  public playDifficultyUp() {
    // Energetic sweep up
    this.playTone(400, 'sawtooth', 0.5, 0.2, 800);
  }

  // --- Procedural BGM ---

  public startGameplayBGM() {
    this.stopBGM();
    if (!this.ctx || this.isMuted) return;
    
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    this.bgmGain.connect(this.ctx.destination);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(65.8, this.ctx.currentTime); // Slight detune

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

    // A simple chill ambient loop (C maj 7 arpeggio)
    const notes = [261.63, 329.63, 392.00, 493.88]; // C4, E4, G4, B4
    let noteIndex = 0;

    const playNextNote = () => {
      if (!this.isPlayingMenuBgm || !this.ctx || this.isMuted) return;
      this.playTone(notes[noteIndex], 'sine', 2.0, 0.05); // Soft, long sine wave
      noteIndex = (noteIndex + 1) % notes.length;
    };

    // Play first note immediately
    playNextNote();
    
    // Schedule subsequent notes
    this.menuBgmInterval = setInterval(playNextNote, 1000); // 1 note per second
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
    } else {
      // It will be restarted by the component based on game state
    }
  }
}
