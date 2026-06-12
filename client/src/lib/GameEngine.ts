import seedrandom from 'seedrandom';
import { ThemeConfig, THEMES } from './themes';
import { Dictionary, Difficulty, GameModifiers } from './Dictionary';
import { AdaptiveDifficulty } from './AdaptiveDifficulty';
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
}

interface WordEntity {
  id: string;
  text: string;
  typed: string; // The portion of the word already typed
  x: number;
  y: number;
  speed: number;
  isJunk: boolean;
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
  };
  
  private words: WordEntity[] = [];
  private targetedWordId: string | null = null;
  
  // Difficulty Scaling
  private timeElapsed: number = 0;
  private spawnTimer: number = 0;
  private matchDuration: number = 60000; // 1 minute in ms
  private baseSpawnInterval: number = 2000; // ms
  private currentSpawnInterval: number = 2000;
  private baseSpeed: number = 0.08; // Increased base speed
  private modifiers?: GameModifiers;
  private adaptiveDifficulty: AdaptiveDifficulty;

  // Callbacks
  public onStateChange: (state: GameState & { maxCombo: number }) => void = () => {};
  public onGarbageGenerated: (amount: number) => void = () => {};
  public onGameOverCallback: (score: number, maxCombo: number, survived: boolean, metrics: { wpm: number, accuracy: number, garbageSent: number }) => void = () => {};
  public onMetricsUpdate: (metrics: { wpm: number, accuracy: number, garbageSent: number, lives: number, score: number }) => void = () => {};

  // Customization
  private theme: ThemeConfig;
  private fontFamily: string;

  constructor(canvas: HTMLCanvasElement, theme?: ThemeConfig, fontFamily?: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme || THEMES.dark;
    this.fontFamily = fontFamily || 'Inter';
    this.random = seedrandom(); // Default unseeded
    this.adaptiveDifficulty = new AdaptiveDifficulty();
    
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
      totalKeystrokes: 0, correctKeystrokes: 0, garbageSent: 0 
    };
    this.words = [];
    this.targetedWordId = null;
    this.timeElapsed = 0;
    this.spawnTimer = 0;
    this.lastTime = performance.now();
    this.notifyState();
    this.loop(this.lastTime);
  }

  public stop() {
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
      
      this.onGameOverCallback(this.state.score, this.state.maxCombo, this.state.survived, {
        wpm, accuracy, garbageSent: this.state.garbageSent
      });
      return;
    }

    // Scale difficulty over time (max 2.5x speed at the end of the minute)
    const difficultyMultiplier = 1 + (this.timeElapsed / this.matchDuration) * 1.5;
    this.currentSpawnInterval = Math.max(400, this.baseSpawnInterval / difficultyMultiplier);
    const currentSpeed = this.baseSpeed * difficultyMultiplier;

    // Spawning logic
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.currentSpawnInterval) {
      this.spawnTimer = 0;
      this.spawnWord(currentSpeed, difficultyMultiplier);
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
        this.loseLife();
      }
    }
  }

  private render() {
    const rect = this.canvas.getBoundingClientRect();
    // Clear screen
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Draw words
    this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

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
      this.ctx.fillStyle = isTargeted ? this.theme.wordRemaining : (word.isJunk ? this.theme.wordJunk : '#9ca3af');
      this.ctx.fillText(remainingText, startX + typedWidth + remainingWidth / 2, word.y);
    }
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
        
        // Word completed
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Wrong hit - break combo
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
        
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Typed a key that doesn't match any word
        this.breakCombo();
      }
    }
  }

  private async spawnWord(speed: number, difficultyMultiplier: number) {
    const rect = this.canvas.getBoundingClientRect();
    
    // Determine difficulty based on ML model
    const minutes = this.timeElapsed / 60000;
    const wpm = minutes > 0 ? (this.state.correctKeystrokes / 5) / minutes : 0;
    const accuracy = this.state.totalKeystrokes > 0 ? (this.state.correctKeystrokes / this.state.totalKeystrokes) * 100 : 100;
    
    const mlPrediction = await this.adaptiveDifficulty.predictDifficulty(wpm, accuracy, this.state.combo);
    const diff = mlPrediction.difficulty;
    const modelMods = mlPrediction.mods;
    
    const text = Dictionary.getWord(this.random, diff, this.modifiers || modelMods);
    
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
      color: '#ffffff'
    };

    this.words.push(word);
  }

  private destroyWord(id: string) {
    this.words = this.words.filter(w => w.id !== id);
    this.targetedWordId = null;
    
    // Combo & Score logic
    this.state.combo += 1;
    if (this.state.combo > this.state.maxCombo) {
      this.state.maxCombo = this.state.combo;
    }
    this.state.score += 10 * this.state.combo;
    
    // Check garbage mechanics (e.g., every 5 combo sends 1 garbage)
    if (this.state.combo > 0 && this.state.combo % 5 === 0) {
      this.state.score += 50; // Bonus score
      this.state.garbageSent += 1;
      // Send garbage (emit to network)
      this.onGarbageGenerated(1); 
    }
    
    this.notifyState();
  }

  private breakCombo() {
    this.state.combo = 0;
    this.notifyState();
  }

  private loseLife() {
    this.state.lives -= 1;
    this.state.combo = 0;
    
    if (this.state.lives <= 0) {
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
        color: '#f87171'
      });
    }
  }
}
