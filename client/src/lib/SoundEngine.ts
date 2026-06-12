export class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  
  // BGM Drone
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private isPlayingBgm: boolean = false;

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

  // --- Procedural BGM (Pulsating Drone) ---

  public startBGM() {
    if (!this.ctx || this.isMuted || this.isPlayingBgm) return;
    
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    this.droneGain.connect(this.ctx.destination);

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'square';
    this.droneOsc2.frequency.setValueAtTime(65.8, this.ctx.currentTime); // Slight detune

    this.droneOsc1.connect(this.droneGain);
    this.droneOsc2.connect(this.droneGain);

    this.droneOsc1.start();
    this.droneOsc2.start();
    this.isPlayingBgm = true;
  }

  public updateBGM(progressScore: number) {
    if (!this.ctx || !this.isPlayingBgm || !this.droneOsc1 || !this.droneOsc2 || !this.droneGain) return;
    
    // As progressScore increases (0 to ~4):
    // 1. Pitch bends up slightly (tension)
    // 2. Volume increases slightly
    const baseFreq = 65.41;
    const targetFreq = baseFreq + (progressScore * 10);
    
    this.droneOsc1.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.5);
    this.droneOsc2.frequency.setTargetAtTime(targetFreq + 0.5, this.ctx.currentTime, 0.5);
    
    const targetVol = 0.05 + Math.min(0.1, progressScore * 0.02);
    this.droneGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
  }

  public stopBGM() {
    if (this.droneOsc1) {
      this.droneOsc1.stop();
      this.droneOsc1.disconnect();
      this.droneOsc1 = null;
    }
    if (this.droneOsc2) {
      this.droneOsc2.stop();
      this.droneOsc2.disconnect();
      this.droneOsc2 = null;
    }
    if (this.droneGain) {
      this.droneGain.disconnect();
      this.droneGain = null;
    }
    this.isPlayingBgm = false;
  }
}
