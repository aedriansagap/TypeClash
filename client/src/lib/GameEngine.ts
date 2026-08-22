import seedrandom from 'seedrandom';
import { ThemeConfig, THEMES } from './themes';
import { Dictionary, Difficulty, GameModifiers } from './Dictionary';
import { AdaptiveDifficulty } from './AdaptiveDifficulty';
import { SoundEngine } from './SoundEngine';
import { BossConfig, BOSSES, BossDifficulty, BOSS_DIFFICULTIES, calculateBossDamage } from './bosses';

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

interface FloatingCombatNumber {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  isCrit: boolean;
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

  // Boss Mode State
  public bossEntity: BossConfig | null = null;
  public bossDifficulty: BossDifficulty = 'normal';
  public bossHp: number = 0;
  public bossMaxHp: number = 0;
  public bossPhase: 1 | 2 = 1;
  public bossShieldHp: number = 0;
  public bossShieldMaxHp: number = 0;
  public isCoopRaid: boolean = false;
  public partySize: number = 1;
  public totalBossDamageDealt: number = 0;
  public bossCastState: {
    abilityId: string;
    abilityName: string;
    warningText: string;
    progress: number;
    duration: number;
    icon: string;
  } | null = null;
  private bossAbilityTimers: Record<string, number> = {};
  private bossDamageNumbers: FloatingCombatNumber[] = [];
  public bossDialogue: { text: string; timer: number } | null = null;
  public activeVoidFog: boolean = false;
  private voidFogTimer: number = 0;
  private heatwaveTimer: number = 0;

  // Callbacks
  public onStateChange: (state: GameState & { maxCombo: number }) => void = () => {};
  public onGarbageGenerated: (amount: number) => void = () => {};
  public onPowerUpUsed: (type: string) => void = () => {};
  public onGameOverCallback: (score: number, maxCombo: number, survived: boolean, metrics: { wpm: number, accuracy: number, garbageSent: number }) => void = () => {};
  public onMetricsUpdate: (metrics: { wpm: number, accuracy: number, garbageSent: number, lives: number, score: number }) => void = () => {};
  public onBossDamageDealt?: (damage: number, isCrit: boolean, currentHp: number) => void;
  public onBossDefeated?: (boss: BossConfig, clearTimeSeconds: number, stats: { totalDamage: number; wpm: number; maxCombo: number; accuracy: number }) => void;
  public onBossSpellCast?: (abilityId: string) => void;

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
    this.bossEntity = null;
    this.isCoopRaid = false;
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
    this.bossDamageNumbers = [];
    this.shakeIntensity = 0;
    this.frozenTimer = 0;
    this.activeVoidFog = false;
    this.heatwaveTimer = 0;
    this.lastTime = performance.now();
    this.notifyState();
    this.sound.startGameplayBGM();
    this.loop(this.lastTime);
  }

  public startBossFight(
    bossId: string, 
    difficulty: BossDifficulty = 'normal', 
    isCoop: boolean = false, 
    partySize: number = 1, 
    seed?: string
  ) {
    const boss = BOSSES[bossId] || BOSSES.ignis;
    this.bossEntity = boss;
    this.bossDifficulty = difficulty;
    this.isCoopRaid = isCoop;
    this.partySize = Math.max(1, partySize);
    
    const diffMultiplier = BOSS_DIFFICULTIES[difficulty].hpMultiplier;
    const coopMultiplier = isCoop ? 1 + (this.partySize - 1) * 0.75 : 1;
    this.bossMaxHp = Math.round(boss.baseHp * diffMultiplier * coopMultiplier);
    this.bossHp = this.bossMaxHp;
    this.bossPhase = 1;
    this.bossShieldHp = 0;
    this.bossShieldMaxHp = 0;
    this.totalBossDamageDealt = 0;
    this.bossCastState = null;
    this.bossAbilityTimers = {};
    boss.abilities.forEach(ab => {
      this.bossAbilityTimers[ab.id] = ab.cooldown * 0.4; // initial delay
    });
    this.bossDamageNumbers = [];
    this.activeVoidFog = false;
    this.heatwaveTimer = 0;
    this.bossDialogue = { text: boss.flavorQuote, timer: 4500 };
    
    this.random = seedrandom(seed || Math.random().toString());
    this.matchDuration = 180000; // 3 minutes standard boss timer
    this.baseSpeed = 0.09 * boss.wordSpeedMultiplier * BOSS_DIFFICULTIES[difficulty].speedMultiplier;
    this.state = { 
      lives: 4, combo: 0, maxCombo: 0, score: 0, isGameOver: false, 
      timeLeft: Math.ceil(this.matchDuration/1000), survived: false,
      totalKeystrokes: 0, correctKeystrokes: 0, garbageSent: 0, activePowerUp: null 
    };
    this.words = [];
    this.targetedWordId = null;
    this.timeElapsed = 0;
    this.spawnTimer = 0;
    this.lastProgressScoreLevel = 0;
    this.particles = [];
    this.shakeIntensity = 10;
    this.frozenTimer = 0;
    this.lastTime = performance.now();
    this.notifyState();
    this.sound.playBossRoar();
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

    // Boss Dialogue countdown
    if (this.bossDialogue) {
      this.bossDialogue.timer -= deltaTime;
      if (this.bossDialogue.timer <= 0) {
        this.bossDialogue = null;
      }
    }

    // Boss Environmental Effects countdown
    if (this.activeVoidFog) {
      this.voidFogTimer -= deltaTime;
      if (this.voidFogTimer <= 0) {
        this.activeVoidFog = false;
      }
    }

    if (this.heatwaveTimer > 0) {
      this.heatwaveTimer -= deltaTime;
    }

    // Update Boss Spell Timers & Casting
    if (this.bossEntity && !this.state.isGameOver) {
      if (this.bossCastState) {
        this.bossCastState.progress += deltaTime;
        if (this.bossCastState.progress >= this.bossCastState.duration) {
          const abilityId = this.bossCastState.abilityId;
          this.bossCastState = null;
          this.executeBossAbility(abilityId);
        }
      } else if (!this.isCoopRaid) {
        // In Solo Boss mode, engine manages boss AI casts
        for (const ability of this.bossEntity.abilities) {
          this.bossAbilityTimers[ability.id] -= deltaTime;
          if (this.bossAbilityTimers[ability.id] <= 0 && !this.bossCastState) {
            this.bossAbilityTimers[ability.id] = ability.cooldown;
            this.bossCastState = {
              abilityId: ability.id,
              abilityName: ability.name,
              warningText: ability.warningText,
              progress: 0,
              duration: ability.castTime,
              icon: ability.icon
            };
            this.sound.playBossCastWarning();
            this.shakeIntensity = 8;
            this.onBossSpellCast?.(ability.id);
            break;
          }
        }
      }
    }

    if (this.timeElapsed >= this.matchDuration && !this.state.isGameOver) {
      this.state.isGameOver = true;
      this.state.survived = false;
      this.notifyState();
      
      const minutes = this.timeElapsed / 60000;
      const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
      const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
      
      this.sound.stopBGM();
      this.sound.playLose();
      this.onGameOverCallback(this.state.score, this.state.maxCombo, this.state.survived, {
        wpm, accuracy, garbageSent: this.state.garbageSent
      });
      return;
    }

    // Calculate progressive difficulty score based on time, combo, and score
    const timeRatio = this.timeElapsed / this.matchDuration;
    let progressScore = timeRatio * 1.0; 
    progressScore += Math.min(0.5, this.state.combo * 0.01);
    progressScore += Math.min(0.5, this.state.score * 0.0005);
    
    // Scale speed and spawn intervals based on progressScore & heatwave
    const heatwaveBonus = this.heatwaveTimer > 0 ? 1.35 : 1.0;
    const difficultyMultiplier = (1 + progressScore) * heatwaveBonus; 
    
    if (Math.floor(progressScore) > this.lastProgressScoreLevel && !this.bossEntity) {
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

    // Update Floating Combat Numbers
    for (let i = this.bossDamageNumbers.length - 1; i >= 0; i--) {
      const fn = this.bossDamageNumbers[i];
      fn.life -= deltaTime;
      fn.y -= deltaTime * 0.04; // Drift upward
      if (fn.life <= 0) {
        this.bossDamageNumbers.splice(i, 1);
      }
    }
  }

  public executeBossAbility(abilityId: string) {
    this.shakeIntensity = 15;
    if (abilityId === 'firestorm') {
      // Summons 4 fast-falling meteors
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < 4; i++) {
        const text = Dictionary.getWord(this.random, Difficulty.HARD, undefined, 1.5);
        this.ctx.font = `24px "${this.fontFamily}", sans-serif`;

        const textWidth = this.ctx.measureText(text).width;
        const minX = textWidth / 2 + 20;
        const maxX = rect.width - (textWidth / 2) - 20;
        this.words.push({
          id: `meteor_${this.random().toString(36).substring(2, 9)}`,
          text,
          typed: '',
          x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
          y: -40 - (i * 45),
          speed: this.baseSpeed * 2.5,
          isJunk: true,
          isGolden: false,
          hasTypo: false,
          color: '#ef4444'
        });
      }
    } else if (abilityId === 'heatwave') {
      this.heatwaveTimer = 7000;
    } else if (abilityId === 'scramble_pulse') {
      this.words.forEach(w => {
        const chars = w.text.substring(w.typed.length).split('');
        for (let i = chars.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        w.text = w.typed + chars.join('');
      });
    } else if (abilityId === 'data_barrier') {
      this.bossShieldMaxHp = 800;
      this.bossShieldHp = 800;
      const rect = this.canvas.getBoundingClientRect();
      ['OVERRIDE_CORE', 'PURGE_MALWARE'].forEach((code, idx) => {
        this.words.push({
          id: `glyph_${this.random().toString(36).substring(2, 9)}`,
          text: code,
          typed: '',
          x: rect.width * (0.35 + idx * 0.3),
          y: -50 - (idx * 50),
          speed: this.baseSpeed * 1.3,
          isJunk: false,
          isGolden: true,
          hasTypo: false,
          color: '#06b6d4'
        });
      });
    } else if (abilityId === 'abyssal_fog') {
      this.activeVoidFog = true;
      this.voidFogTimer = 7000;
    } else if (abilityId === 'supernova_enrage') {
      this.loseLife();
      this.loseLife();
    }
  }

  public syncBossHp(currentHp: number, shieldHp?: number) {
    this.bossHp = currentHp;
    if (shieldHp !== undefined) this.bossShieldHp = shieldHp;
  }

  private addFloatingCombatNumber(x: number, y: number, text: string, isCrit: boolean = false, color: string = '#fcd34d') {
    this.bossDamageNumbers.push({
      x,
      y,
      text,
      life: 1000,
      maxLife: 1000,
      color,
      isCrit
    });
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
    
    // Draw Void Fog Overlay if active
    if (this.activeVoidFog) {
      const grad = this.ctx.createRadialGradient(rect.width / 2, rect.height / 2, 80, rect.width / 2, rect.height / 2, rect.width * 0.55);
      grad.addColorStop(0, 'rgba(15, 5, 29, 0.94)');
      grad.addColorStop(0.7, 'rgba(24, 9, 38, 0.7)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    if (this.frozenTimer > 0) {
      this.ctx.fillStyle = 'rgba(147, 197, 253, 0.12)';
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // --- Render Boss UI at Top --- //
    if (this.bossEntity) {
      this.renderBossHeader(rect.width);
    }

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
      this.ctx.fillStyle = isTargeted ? this.theme.wordRemaining : (word.isJunk ? this.theme.wordJunk : (word.isGolden ? '#fbbf24' : '#9ca3af'));
      if (word.isGolden && !word.hasTypo) {
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#fbbf24';
      } else if (word.isJunk) {
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#ef4444';
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

    // Draw Floating Combat Numbers
    for (const fn of this.bossDamageNumbers) {
      const alpha = Math.max(0, fn.life / fn.maxLife);
      this.ctx.globalAlpha = alpha;
      this.ctx.font = fn.isCrit ? `bold 28px "${this.fontFamily}", sans-serif` : `bold 20px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = fn.color;
      this.ctx.shadowColor = fn.isCrit ? '#ef4444' : '#000000';
      this.ctx.shadowBlur = fn.isCrit ? 10 : 4;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(fn.text, fn.x, fn.y);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;

    this.ctx.restore();
  }

  private renderBossHeader(canvasWidth: number) {
    if (!this.bossEntity) return;

    const centerX = canvasWidth / 2;
    const hpBarWidth = Math.min(520, canvasWidth * 0.85);
    const hpBarHeight = 20;
    const barX = centerX - hpBarWidth / 2;
    const barY = 28;

    // Boss Name & Title
    this.ctx.font = `bold 18px "${this.fontFamily}", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = this.bossEntity.accentColor;
    this.ctx.shadowColor = this.bossEntity.themeColor;
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(`${this.bossEntity.icon} ${this.bossEntity.name.toUpperCase()} [${this.bossDifficulty.toUpperCase()}]`, centerX, 18);
    this.ctx.shadowBlur = 0;

    // Boss HP Bar Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.strokeStyle = this.bossPhase === 2 ? '#ef4444' : 'rgba(255, 255, 255, 0.25)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(barX, barY, hpBarWidth, hpBarHeight, 10);
    this.ctx.fill();
    this.ctx.stroke();

    // HP Fill
    const hpRatio = Math.max(0, Math.min(1, this.bossHp / this.bossMaxHp));
    if (hpRatio > 0) {
      const fillGrad = this.ctx.createLinearGradient(barX, 0, barX + hpBarWidth * hpRatio, 0);
      fillGrad.addColorStop(0, this.bossEntity.themeColor);
      fillGrad.addColorStop(1, this.bossPhase === 2 ? '#ef4444' : this.bossEntity.accentColor);
      
      this.ctx.fillStyle = fillGrad;
      this.ctx.beginPath();
      this.ctx.roundRect(barX, barY, hpBarWidth * hpRatio, hpBarHeight, 10);
      this.ctx.fill();
    }

    // Shield Bar Overlay if active
    if (this.bossShieldHp > 0) {
      const shieldRatio = Math.max(0, Math.min(1, this.bossShieldHp / this.bossShieldMaxHp));
      this.ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
      this.ctx.beginPath();
      this.ctx.roundRect(barX, barY + 3, hpBarWidth * shieldRatio, hpBarHeight - 6, 6);
      this.ctx.fill();
    }

    // HP Text
    this.ctx.font = `bold 12px "${this.fontFamily}", sans-serif`;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000000';
    this.ctx.shadowBlur = 4;
    const hpText = this.bossShieldHp > 0
      ? `🛡️ BARRIER: ${this.bossShieldHp} HP | BOSS: ${this.bossHp.toLocaleString()} / ${this.bossMaxHp.toLocaleString()}`
      : `${this.bossHp.toLocaleString()} / ${this.bossMaxHp.toLocaleString()} HP (${Math.round(hpRatio * 100)}%) ${this.bossPhase === 2 ? '🔥 RAGE OVERDRIVE' : ''}`;
    this.ctx.fillText(hpText, centerX, barY + 14);
    this.ctx.shadowBlur = 0;

    // Active Cast Bar
    if (this.bossCastState) {
      const castBarWidth = hpBarWidth * 0.8;
      const castBarHeight = 12;
      const castBarX = centerX - castBarWidth / 2;
      const castBarY = barY + hpBarHeight + 8;
      const castRatio = Math.min(1, this.bossCastState.progress / this.bossCastState.duration);

      // Warning text
      this.ctx.font = `bold 13px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.fillText(`${this.bossCastState.icon} ${this.bossCastState.warningText}`, centerX, castBarY - 3);

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.beginPath();
      this.ctx.roundRect(castBarX, castBarY, castBarWidth, castBarHeight, 6);
      this.ctx.fill();

      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.roundRect(castBarX, castBarY, castBarWidth * castRatio, castBarHeight, 6);
      this.ctx.fill();
    }

    // Boss Dialogue Speech Bubble
    if (this.bossDialogue) {
      const bubbleY = this.bossCastState ? barY + hpBarHeight + 42 : barY + hpBarHeight + 22;
      this.ctx.font = `italic 14px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.shadowColor = '#000000';
      this.ctx.shadowBlur = 6;
      this.ctx.fillText(this.bossDialogue.text, centerX, bubbleY);
      this.ctx.shadowBlur = 0;
    }
  }

  public setCustomization(theme: ThemeConfig, fontFamily: string) {
    this.theme = theme;
    this.fontFamily = fontFamily;
    this.render();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.state.isGameOver) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    this.processKeyInput(e.key);
  }

  public processKeyInput(key: string) {
    if (this.state.isGameOver) return;
    
    if (key === 'Enter') {
      this.usePowerUp();
      return;
    }
    
    if (key.length !== 1) return; // Only process single printable characters
    
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
      isGolden: this.random() < 0.06,
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

      // Boss Damage Processing
      if (this.bossEntity && normalScore && !this.state.isGameOver) {
        const { damage, isCrit } = calculateBossDamage(word.text.length, this.state.combo, word.isGolden);
        this.totalBossDamageDealt += damage;
        this.sound.playBossHit(isCrit);

        if (this.bossShieldHp > 0) {
          this.bossShieldHp = Math.max(0, this.bossShieldHp - damage);
          this.addFloatingCombatNumber(word.x, word.y - 15, `-${damage} SHIELD`, isCrit, '#06b6d4');
          if (this.bossShieldHp === 0) {
            this.sound.playShieldBroken();
            this.addFloatingCombatNumber(word.x, word.y - 35, 'SHIELD BROKEN!', true, '#38bdf8');
          }
        } else {
          this.bossHp = Math.max(0, this.bossHp - damage);
          this.addFloatingCombatNumber(word.x, word.y - 15, isCrit ? `-${damage} CRIT!` : `-${damage}`, isCrit, isCrit ? '#f59e0b' : '#f8fafc');
        }

        this.onBossDamageDealt?.(damage, isCrit, this.bossHp);

        // Check Phase 2 Trigger
        if (this.bossPhase === 1 && this.bossHp <= this.bossMaxHp * 0.5 && this.bossHp > 0) {
          this.bossPhase = 2;
          this.sound.playBossRoar();
          this.shakeIntensity = 25;
          this.bossDialogue = { text: this.bossEntity.phase2Quote, timer: 5000 };
        }

        // Check Boss Defeat
        if (this.bossHp <= 0) {
          this.bossHp = 0;
          this.state.isGameOver = true;
          this.state.survived = true;
          this.sound.stopBGM();
          this.sound.playBossDefeated();
          this.bossDialogue = { text: this.bossEntity.defeatQuote, timer: 6000 };
          this.notifyState();

          const minutes = this.timeElapsed / 60000;
          const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
          const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
          const clearSeconds = Math.round(this.timeElapsed / 1000);

          this.onBossDefeated?.(this.bossEntity, clearSeconds, {
            totalDamage: this.totalBossDamageDealt,
            wpm,
            maxCombo: this.state.maxCombo,
            accuracy
          });
          return;
        }
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
      
      if (this.bossEntity && !this.state.isGameOver) {
        const nukeDamage = 600;
        this.totalBossDamageDealt += nukeDamage;
        this.bossHp = Math.max(0, this.bossHp - nukeDamage);
        const rect = this.canvas.getBoundingClientRect();
        this.addFloatingCombatNumber(rect.width / 2, 70, `-${nukeDamage} NUKE!`, true, '#f59e0b');
        this.onBossDamageDealt?.(nukeDamage, true, this.bossHp);
      }
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

