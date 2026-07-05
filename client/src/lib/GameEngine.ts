import seedrandom from 'seedrandom';
import { ThemeConfig, THEMES } from './themes';
import { Dictionary, Difficulty, GameModifiers } from './Dictionary';
import { AdaptiveDifficulty } from './AdaptiveDifficulty';
import { SoundEngine } from './SoundEngine';
export interface GameState {
  lives: number;
  combo: number;
  score: number;
  isGameOver: boolean;
  timeLeft: number;
  survived: boolean;
  totalKeystrokes: number;
  correctKeystrokes: number;
  garbageSent: number;
  activePowerUp: 'nuke' | 'freeze' | 'scramble' | null;
}

interface WordEntity {
  id: string;
  text: string;
  typed: string; // The portion of the word already typed
  x: number;
  y: number;
  speed: number;
  isJunk: boolean;
  isGolden: boolean;
  hasTypo: boolean;
  color: string;
}

interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}


export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private lastTime: number = 0;
  
  // PRNG
  private random: seedrandom.PRNG;

  // Game State
  private state: GameState & { maxCombo: number } = {
    lives: 3,
    combo: 0,
    maxCombo: 0,
    score: 0,
    isGameOver: false,
    timeLeft: 60,
    survived: false,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    garbageSent: 0,
    activePowerUp: null
  };
  
  private words: WordEntity[] = [];
  private targetedWordId: string | null = null;
  private particles: ParticleEntity[] = [];
  private shakeIntensity: number = 0;
  private frozenTimer: number = 0;
  
  // Difficulty Scaling
  private timeElapsed: number = 0;
  private spawnTimer: number = 0;
  private matchDuration: number = 60000; // 1 minute in ms
  private baseSpawnInterval: number = 2000; // ms
  private currentSpawnInterval: number = 2000;
  private baseSpeed: number = 0.08; // Increased base speed
  private modifiers?: GameModifiers;
  private adaptiveDifficulty: AdaptiveDifficulty;
  public sound: SoundEngine;
  private lastProgressScoreLevel: number = 0;

  // Callbacks
  public onStateChange: (state: GameState & { maxCombo: number }) => void = () => {};
  public onGarbageGenerated: (amount: number) => void = () => {};
  public onPowerUpUsed: (type: string) => void = () => {};
  public onGameOverCallback: (score: number, maxCombo: number, survived: boolean, metrics: { wpm: number, accuracy: number, garbageSent: number }) => void = () => {};
  public onMetricsUpdate: (metrics: { wpm: number, accuracy: number, garbageSent: number, lives: number, score: number }) => void = () => {};

  // Customization
  private theme: ThemeConfig;
  private fontFamily: string;

  constructor(canvas: HTMLCanvasElement, theme: ThemeConfig | undefined, fontFamily: string | undefined, soundEngine: SoundEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme || THEMES.dark;
    this.fontFamily = fontFamily || 'Inter';
    this.random = seedrandom(); // Default unseeded
    this.adaptiveDifficulty = new AdaptiveDifficulty();
    this.sound = soundEngine;
    
    // Bind event listeners
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.resize = this.resize.bind(this);
    
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.handleKeyDown);
    
    this.resize();
  }

  public start(seed?: string, durationMs: number = 60000, modifiers?: GameModifiers) {
    // Initialize RNG with seed if provided, else random
    this.random = seedrandom(seed || Math.random().toString());
    
    this.modifiers = modifiers;
    this.matchDuration = durationMs;
    this.state = { 
      lives: 3, combo: 0, maxCombo: 0, score: 0, isGameOver: false, 
      timeLeft: Math.ceil(durationMs/1000), survived: false,
      totalKeystrokes: 0, correctKeystrokes: 0, garbageSent: 0, activePowerUp: null 
    };
    this.words = [];
    this.targetedWordId = null;
    this.timeElapsed = 0;
    this.spawnTimer = 0;
    this.lastProgressScoreLevel = 0;
    this.particles = [];
    this.shakeIntensity = 0;
    this.frozenTimer = 0;
    this.lastTime = performance.now();
    this.notifyState();
    this.sound.startGameplayBGM();
    this.loop(this.lastTime);
  }

  public stop() {
    this.sound.stopBGM();
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private resize() {
    // Keep canvas crisp
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  private loop(time: number) {
    if (this.state.isGameOver) return;

    const deltaTime = time - this.lastTime;
    this.lastTime = time;

    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  private update(deltaTime: number) {
    this.timeElapsed += deltaTime;
    
    const newTimeLeft = Math.max(0, Math.ceil((this.matchDuration - this.timeElapsed) / 1000));
    
    // Only notify React when the seconds tick down (improves performance)
    if (newTimeLeft !== this.state.timeLeft) {
      this.state.timeLeft = newTimeLeft;
      this.notifyState();
      
      // Emit metrics every second
      const minutes = this.timeElapsed / 60000;
      const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
      const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
      this.onMetricsUpdate({ wpm, accuracy, garbageSent: this.state.garbageSent, lives: this.state.lives, score: this.state.score });
    }

    if (this.timeElapsed >= this.matchDuration && !this.state.isGameOver) {
      this.state.isGameOver = true;
      this.state.survived = true;
      this.notifyState();
      
      const minutes = this.timeElapsed / 60000;
      const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
      const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
      
      this.sound.stopBGM();
      if (this.state.survived) {
        this.sound.playWin();
      } else {
        this.sound.playLose();
      }
      this.onGameOverCallback(this.state.score, this.state.maxCombo, this.state.survived, {
        wpm, accuracy, garbageSent: this.state.garbageSent
      });
      return;
    }

    // Calculate progressive difficulty score based on time, combo, and score
    const timeRatio = this.timeElapsed / this.matchDuration;
    let progressScore = timeRatio * 1.0; // Max 1.0 from time
    progressScore += Math.min(0.5, this.state.combo * 0.01); // Max 0.5 from combo
    progressScore += Math.min(0.5, this.state.score * 0.0005); // Max 0.5 from score
    
    // Scale speed and spawn intervals based on progressScore
    const difficultyMultiplier = 1 + progressScore; 
    
    if (Math.floor(progressScore) > this.lastProgressScoreLevel) {
      this.lastProgressScoreLevel = Math.floor(progressScore);
      this.sound.playDifficultyUp();
    }
    
    this.sound.updateGameplayBGM(progressScore);
    this.currentSpawnInterval = Math.max(400, this.baseSpawnInterval / difficultyMultiplier);
    const currentSpeed = this.baseSpeed * difficultyMultiplier;

    // Movement and Spawning is halted if frozen
    if (this.frozenTimer > 0) {
      this.frozenTimer -= deltaTime;
    } else {
      // Spawning logic
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.currentSpawnInterval) {
        this.spawnTimer = 0;
        this.spawnWord(currentSpeed, progressScore);
      }

      // Move words and check collisions
      const canvasHeight = this.canvas.getBoundingClientRect().height;
      
      for (let i = this.words.length - 1; i >= 0; i--) {
        const word = this.words[i];
        word.y += word.speed * deltaTime;

        // Word hits the bottom
        if (word.y > canvasHeight) {
          this.words.splice(i, 1);
          if (this.targetedWordId === word.id) {
            this.targetedWordId = null;
          }
          this.sound.playLifeLost();
          this.loseLife();
        }
      }
    }

    // Update game juice (shake and particles)
    if (this.shakeIntensity > 0) {
      this.shakeIntensity -= deltaTime * 0.03;
      if (this.shakeIntensity < 0) this.shakeIntensity = 0;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private render() {
    const rect = this.canvas.getBoundingClientRect();
    // Clear screen
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    
    this.ctx.save();
    if (this.shakeIntensity > 0) {
      const dx = (this.random() - 0.5) * this.shakeIntensity;
      const dy = (this.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(dx, dy);
    }
    
    // Draw words
    this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    if (this.frozenTimer > 0) {
      this.ctx.fillStyle = 'rgba(147, 197, 253, 0.1)';
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    for (const word of this.words) {
      const isTargeted = this.targetedWordId === word.id;
      
      // Draw typed portion
      const typedText = word.typed;
      const remainingText = word.text.substring(word.typed.length);
      
      const typedWidth = this.ctx.measureText(typedText).width;
      const remainingWidth = this.ctx.measureText(remainingText).width;
      const totalWidth = typedWidth + remainingWidth;
      
      const startX = word.x - totalWidth / 2;

      // Typed characters
      this.ctx.fillStyle = this.theme.wordTyped;
      this.ctx.fillText(typedText, startX + typedWidth / 2, word.y);
      
      // Remaining characters
      this.ctx.fillStyle = isTargeted ? this.theme.wordRemaining : (word.isJunk ? this.theme.wordJunk : (word.isGolden ? '#fbbf24' : '#9ca3af'));
      if (word.isGolden && !word.hasTypo) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#fbbf24';
      } else {
        this.ctx.shadowBlur = 0;
      }
      this.ctx.fillText(remainingText, startX + typedWidth + remainingWidth / 2, word.y);
      this.ctx.shadowBlur = 0;
    }

    // Draw particles
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x, p.y, 4, 4);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.restore();
  }

  public setCustomization(theme: ThemeConfig, fontFamily: string) {
    this.theme = theme;
    this.fontFamily = fontFamily;
    this.render();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.state.isGameOver) return;
    
    // Ignore meta keys
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    
    if (e.key === 'Enter') {
      this.usePowerUp();
      return;
    }
    
    const key = e.key;
    if (key.length !== 1) return; // Only process printable single characters
    
    this.state.totalKeystrokes += 1;

    if (this.targetedWordId) {
      // We are already targeting a word
      const target = this.words.find(w => w.id === this.targetedWordId);
      if (!target) {
        this.targetedWordId = null;
        return;
      }

      const expectedChar = target.text[target.typed.length];
      
      if (key === expectedChar) {
        // Correct hit
        target.typed += key;
        this.state.correctKeystrokes += 1;
        this.sound.playKeystroke(true, this.state.combo);
        
        // Word completed
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Wrong hit - break combo
        target.hasTypo = true;
        target.isGolden = false;
        this.sound.playKeystroke(false, 0);
        this.breakCombo();
      }
    } else {
      // Find a new target (lowest word that starts with the pressed key)
      const potentialTargets = this.words
        .filter(w => w.text.startsWith(key))
        .sort((a, b) => b.y - a.y); // Sort by highest Y (lowest on screen)

      if (potentialTargets.length > 0) {
        const target = potentialTargets[0];
        this.targetedWordId = target.id;
        target.typed += key;
        this.state.correctKeystrokes += 1;
        this.sound.playKeystroke(true, this.state.combo);
        
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Typed a key that doesn't match any word
        this.sound.playKeystroke(false, 0);
        this.breakCombo();
      }
    }
  }

  private async spawnWord(speed: number, progressScore: number) {
    const rect = this.canvas.getBoundingClientRect();
    
    // Determine difficulty based on ML model
    const minutes = this.timeElapsed / 60000;
    const wpm = minutes > 0 ? (this.state.correctKeystrokes / 5) / minutes : 0;
    const accuracy = this.state.totalKeystrokes > 0 ? (this.state.correctKeystrokes / this.state.totalKeystrokes) * 100 : 100;
    
    const mlPrediction = await this.adaptiveDifficulty.predictDifficulty(wpm, accuracy, this.state.combo);
    const diff = mlPrediction.difficulty;
    const modelMods = mlPrediction.mods;
    
    const text = Dictionary.getWord(this.random, diff, this.modifiers || modelMods, progressScore);
    
    // Ensure word spawns fully within horizontal bounds
    this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
    const textWidth = this.ctx.measureText(text).width;
    const padding = 20;
    const minX = textWidth / 2 + padding;
    const maxX = rect.width - (textWidth / 2) - padding;
    const x = Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX));

    const word: WordEntity = {
      id: this.random().toString(36).substring(2, 9),
      text,
      typed: '',
      x,
      y: -30, // Start above screen
      speed,
      isJunk: false,
      isGolden: this.random() < 0.05,
      hasTypo: false,
      color: '#ffffff'
    };

    this.words.push(word);
  }

  private destroyWord(id: string, normalScore: boolean = true) {
    const word = this.words.find(w => w.id === id);
    if (word) {
      if (word.isGolden && !word.hasTypo && normalScore) {
        const types: Array<'nuke' | 'freeze' | 'scramble'> = ['nuke', 'freeze', 'scramble'];
        this.state.activePowerUp = types[Math.floor(this.random() * types.length)];
        this.sound.playPowerUpGained?.();
      }
      for (let i = 0; i < 15; i++) {
        this.particles.push({
          x: word.x + (this.random() - 0.5) * 40,
          y: word.y + (this.random() - 0.5) * 20,
          vx: (this.random() - 0.5) * 0.2,
          vy: (this.random() - 0.5) * 0.2,
          life: 500 + this.random() * 500,
          maxLife: 1000,
          color: word.isJunk ? '#f87171' : this.theme.wordTyped
        });
      }
    }
    this.words = this.words.filter(w => w.id !== id);
    this.targetedWordId = null;
    this.sound.playWordComplete();
    
    if (normalScore) {
      // Combo & Score logic
      this.state.combo += 1;
      if (this.state.combo > this.state.maxCombo) {
        this.state.maxCombo = this.state.combo;
      }
      this.state.score += 10 * this.state.combo;
      
      if (this.state.combo > 0 && this.state.combo % 10 === 0) {
        this.sound.playComboMilestone(this.state.combo);
      }
      
      // Check garbage mechanics (e.g., every 5 combo sends 1 garbage)
      if (this.state.combo > 0 && this.state.combo % 5 === 0) {
        this.state.score += 50; // Bonus score
        this.state.garbageSent += 1;
        // Send garbage (emit to network)
        this.sound.playGarbageSent();
        this.onGarbageGenerated(1); 
      }
    }
    
    this.notifyState();
  }

  private breakCombo() {
    this.state.combo = 0;
    this.notifyState();
  }

  private loseLife() {
    this.shakeIntensity = 20;
    this.state.lives -= 1;
    this.state.combo = 0;
    
    if (this.state.lives <= 0) {
      this.sound.stopBGM();
      this.sound.playLose();
      this.state.isGameOver = true;
      this.state.survived = false;
      this.notifyState();
      
      const minutes = this.timeElapsed / 60000;
      const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
      const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
      
      this.onGameOverCallback(this.state.score, this.state.maxCombo, this.state.survived, {
        wpm, accuracy, garbageSent: this.state.garbageSent
      });
    } else {
      this.notifyState();
    }
  }

  private notifyState() {
    this.onStateChange({ ...this.state });
  }

  // Public method to be called from multiplayer server to receive garbage
  public receiveGarbage(amount: number) {
    this.shakeIntensity = 10;
    // Spawns junk words
    for(let i=0; i<amount; i++) {
      const rect = this.canvas.getBoundingClientRect();
      const text = Dictionary.getJunkWord(this.random);
      this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
      const textWidth = this.ctx.measureText(text).width;
      const minX = textWidth / 2 + 20;
      const maxX = rect.width - (textWidth / 2) - 20;
      
      this.words.push({
        id: this.random().toString(36).substring(2, 9),
        text,
        typed: '',
        x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
        y: this.random() * -100 - 30, // Stagger spawning above screen
        speed: this.baseSpeed * 2, // Sped up
        isJunk: true,
        isGolden: false,
        hasTypo: false,
        color: '#f87171'
      });
    }
  }

  public usePowerUp() {
    if (!this.state.activePowerUp) return;
    const type = this.state.activePowerUp;
    this.state.activePowerUp = null;
    this.sound.playPowerUpUsed?.();
    
    if (type === 'nuke') {
      const bottomWords = [...this.words].sort((a, b) => b.y - a.y).slice(0, 3);
      bottomWords.forEach(w => this.destroyWord(w.id, false));
    } else {
      this.onPowerUpUsed(type);
    }
    this.notifyState();
  }

  public receivePowerUp(type: string) {
    if (type === 'freeze') {
      this.frozenTimer = 3000;
    } else if (type === 'scramble') {
      this.words.forEach(w => {
        if (!w.isJunk) {
          const chars = w.text.substring(w.typed.length).split('');
          for (let i = chars.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [chars[i], chars[j]] = [chars[j], chars[i]];
          }
          w.text = w.typed + chars.join('');
        }
      });
    }
  }
}
