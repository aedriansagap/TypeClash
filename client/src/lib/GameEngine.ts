import seedrandom from 'seedrandom';
import { ThemeConfig, THEMES } from './themes';
import { Dictionary, Difficulty, GameModifiers } from './Dictionary';
import { AdaptiveDifficulty } from './AdaptiveDifficulty';
import { SoundEngine } from './SoundEngine';
import { BossConfig, BOSSES, BossDifficulty, BOSS_DIFFICULTIES, calculateBossDamage } from './bosses';
import { WordPack } from './wordPacks';
import { KeyStat } from './keyboardAnalytics';



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
  type: 'spark' | 'shockwave' | 'shard' | 'ember';
  size: number;
  radius?: number;
  maxRadius?: number;
  gravity?: number;
  rotation?: number;
  vRot?: number;
}

interface FloatingCombatNumber {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  isCrit: boolean;
  scale?: number;
}

interface LaserTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  private laserTracers: LaserTracer[] = [];
  private shakeIntensity: number = 0;
  private frozenTimer: number = 0;
  private screenFlashColor: string | null = null;
  private screenFlashTimer: number = 0;
  private screenFlashMaxTimer: number = 0;
  
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
  public isRaidHost: boolean = false;
  public partySize: number = 1;
  public totalBossDamageDealt: number = 0;
  public bossCastState: {
    abilityId: string;
    abilityName: string;
    warningText: string;
    progress: number;
    duration: number;
    icon: string;
    interruptible: boolean;
    interruptThreshold: number;
    damageDuringCast: number;
    interruptWordId?: string;
  } | null = null;
  public bossStunTimer: number = 0;
  public bossStunMaxTimer: number = 4000;
  public synergyMultiplier: number = 1.0;
  public isTeamOverdrive: boolean = false;
  public temporalRiftTimer: number = 0;
  public enrageWarningFired: boolean = false;
  public isBossBerserk: boolean = false;
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
  public onBossCastInterrupted?: (abilityId: string) => void;
  public onPlayerRevivedByMe?: (targetPlayerId: string) => void;

  // Custom Word Pack
  public activeWordPack: WordPack | null = null;

  // Keyboard Telemetry
  private keyStats: Map<string, { count: number; errors: number; totalLatencyMs: number }> = new Map();
  private lastKeyTime: number = 0;

  public getKeyTelemetry(): Record<string, KeyStat> {
    const res: Record<string, KeyStat> = {};
    for (const [k, s] of this.keyStats.entries()) {
      res[k] = {
        key: k,
        count: s.count,
        errors: s.errors,
        totalLatencyMs: s.totalLatencyMs,
        avgLatencyMs: s.count > 0 ? Math.round(s.totalLatencyMs / s.count) : 0,
        accuracy: s.count > 0 ? Math.max(0, Math.round(((s.count - s.errors) / s.count) * 100)) : 100
      };
    }
    return res;
  }

  // Customization
  private theme: ThemeConfig;
  private fontFamily: string;

  public setWordPack(pack: WordPack | null) {
    this.activeWordPack = pack;
  }



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
    this.keyStats.clear();
    this.lastKeyTime = 0;
    this.bossEntity = null;
    this.isCoopRaid = false;
    this.random = seedrandom(seed || Math.random().toString());

    this.modifiers = modifiers;
    this.matchDuration = durationMs;
    this.isRaidHost = false;
    this.bossStunTimer = 0;
    this.synergyMultiplier = 1.0;
    this.isTeamOverdrive = false;
    this.temporalRiftTimer = 0;
    this.enrageWarningFired = false;
    this.isBossBerserk = false;
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
    seed?: string,
    isHost: boolean = false
  ) {
    this.keyStats.clear();
    this.lastKeyTime = 0;
    const boss = BOSSES[bossId] || BOSSES.ignis;
    this.bossEntity = boss;

    this.bossDifficulty = difficulty;
    this.isCoopRaid = isCoop;
    this.isRaidHost = isHost;
    this.partySize = Math.max(1, partySize);
    this.bossStunTimer = 0;
    this.synergyMultiplier = 1.0;
    this.isTeamOverdrive = false;
    this.temporalRiftTimer = 0;
    this.enrageWarningFired = false;
    this.isBossBerserk = false;
    
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
    this.sound.startBossBGM(boss.id, 1);
    this.loop(this.lastTime);
  }

  public triggerBossCast(abilityId: string) {
    if (!this.bossEntity || this.state.isGameOver) return;
    const ability = this.bossEntity.abilities.find(a => a.id === abilityId);
    if (!ability) return;

    let interruptWordId: string | undefined = undefined;
    if (ability.interruptible) {
      const rect = this.canvas.getBoundingClientRect();
      const glyphs = ['DISRUPT', 'OVERRIDE', 'PARITY_BREAK', 'SHUTDOWN', 'SEVER_LINK', 'PURGE_THREAD'];
      const chosenGlyph = glyphs[Math.floor(this.random() * glyphs.length)];
      interruptWordId = `interrupt_${this.random().toString(36).substring(2, 9)}`;

      this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
      const textWidth = this.ctx.measureText(chosenGlyph).width;
      const minX = textWidth / 2 + 20;
      const maxX = rect.width - (textWidth / 2) - 20;

      this.words.push({
        id: interruptWordId,
        text: chosenGlyph,
        typed: '',
        x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
        y: -30,
        speed: this.baseSpeed * 0.9,
        isJunk: false,
        isGolden: true,
        hasTypo: false,
        color: '#06b6d4'
      });
    }

    this.bossCastState = {
      abilityId: ability.id,
      abilityName: ability.name,
      warningText: ability.warningText,
      progress: 0,
      duration: ability.castTime,
      icon: ability.icon,
      interruptible: !!ability.interruptible,
      interruptThreshold: ability.interruptThreshold || 600,
      damageDuringCast: 0,
      interruptWordId
    };

    this.sound.playBossCastWarning();
    this.shakeIntensity = 8;
  }

  public interruptBossCast(emitNetwork: boolean = true) {
    if (!this.bossCastState) return;
    const abilityId = this.bossCastState.abilityId;

    if (this.bossCastState.interruptWordId) {
      this.words = this.words.filter(w => w.id !== this.bossCastState!.interruptWordId);
    }

    this.bossCastState = null;
    this.bossStunTimer = 4000;
    this.bossStunMaxTimer = 4000;
    this.sound.playBossInterrupted();
    this.sound.playBossStaggered();
    this.shakeIntensity = 18;
    this.triggerScreenFlash('rgba(6, 182, 212, 0.4)', 450);
    const rect = this.canvas.getBoundingClientRect();
    this.spawnShockwave(rect.width / 2, 60, '#06b6d4', 85);
    this.spawnPopup(rect.width / 2, 70, '⚡ INTERRUPTED! BOSS STAGGERED (+50% DMG) ⚡', '#38bdf8', true);

    if (emitNetwork) {
      this.onBossCastInterrupted?.(abilityId);
    }
  }

  public spawnReviveBeacon(targetPlayerId: string, playerName: string) {
    if (this.state.isGameOver || !this.isCoopRaid) return;
    if (this.words.some(w => w.id === `revive_${targetPlayerId}`)) return;

    const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'ALLY';
    const text = `REVIVE_${cleanName}`;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
    const textWidth = this.ctx.measureText(text).width;
    const minX = textWidth / 2 + 20;
    const maxX = rect.width - (textWidth / 2) - 20;

    this.words.push({
      id: `revive_${targetPlayerId}`,
      text,
      typed: '',
      x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
      y: -40,
      speed: this.baseSpeed * 0.8,
      isJunk: false,
      isGolden: true,
      hasTypo: false,
      color: '#10b981'
    });
  }

  public removeReviveBeacon(targetPlayerId: string) {
    this.words = this.words.filter(w => w.id !== `revive_${targetPlayerId}`);
  }

  public revivePlayer(lives: number = 2) {
    this.state.lives = lives;
    this.state.isGameOver = false;
    this.state.survived = false;
    this.sound.playBossRevive();
    this.triggerScreenFlash('rgba(16, 185, 129, 0.45)', 500);
    const rect = this.canvas.getBoundingClientRect();
    this.spawnShockwave(rect.width / 2, rect.height / 2, '#10b981', 100);
    this.spawnPopup(rect.width / 2, rect.height / 2 - 40, 'REVIVED! 💚 +2 LIVES', '#10b981', true);
    this.notifyState();
    if (this.bossEntity) {
      this.sound.startBossBGM(this.bossEntity.id, this.bossPhase);
    }
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  public setTeamOverdrive(active: boolean) {
    if (this.isTeamOverdrive === active) return;
    this.isTeamOverdrive = active;
    this.synergyMultiplier = active ? 1.5 : 1.0;
    if (active) {
      this.sound.playTeamSynergy();
      this.triggerScreenFlash('rgba(251, 191, 36, 0.35)', 400);
      const rect = this.canvas.getBoundingClientRect();
      this.spawnPopup(rect.width / 2, rect.height / 2, '⚡ TEAM OVERDRIVE! (1.5x DMG) ⚡', '#fbbf24', true);
    }
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

    if (this.bossStunTimer > 0) {
      this.bossStunTimer -= deltaTime;
      if (this.bossStunTimer <= 0) {
        this.bossStunTimer = 0;
      }
    }

    if (this.temporalRiftTimer > 0) {
      this.temporalRiftTimer -= deltaTime;
    }

    // Boss Enrage 30s Warning & Berserk Mode
    if (this.bossEntity && !this.state.isGameOver) {
      const remainingMs = this.matchDuration - this.timeElapsed;
      if (remainingMs <= 30000 && !this.enrageWarningFired && remainingMs > 0) {
        this.enrageWarningFired = true;
        this.sound.playEnrageWarning();
        this.triggerScreenFlash('rgba(239, 68, 68, 0.45)', 600);
        this.bossDialogue = { text: "ENRAGE IMMINENT! SUBMIT TO OBLIVION!", timer: 4500 };
      }
      if (remainingMs <= 0 && !this.isBossBerserk) {
        this.isBossBerserk = true;
        this.shakeIntensity = 25;
        this.triggerScreenFlash('rgba(239, 68, 68, 0.75)', 1000);
        this.bossDialogue = { text: "BERSERK OVERDRIVE! PERISH!", timer: 6000 };
      }
    }

    // Update Boss Spell Timers & Casting
    if (this.bossEntity && !this.state.isGameOver) {
      if (this.bossCastState) {
        this.bossCastState.progress += deltaTime;
        if (this.bossCastState.progress >= this.bossCastState.duration) {
          const abilityId = this.bossCastState.abilityId;
          if (this.bossCastState.interruptWordId) {
            this.words = this.words.filter(w => w.id !== this.bossCastState!.interruptWordId);
          }
          this.bossCastState = null;
          this.executeBossAbility(abilityId);
        }
      } else if (this.bossStunTimer <= 0 && (!this.isCoopRaid || this.isRaidHost)) {
        // In Solo Boss mode or as Raid Host, manage boss AI casts
        const currentPhase = this.bossPhase;
        for (const ability of this.bossEntity.abilities) {
          if (ability.phase && ability.phase > currentPhase) continue;

          this.bossAbilityTimers[ability.id] -= deltaTime;
          if (this.bossAbilityTimers[ability.id] <= 0 && !this.bossCastState) {
            const cd = this.bossPhase === 2 ? ability.cooldown * 0.75 : ability.cooldown;
            this.bossAbilityTimers[ability.id] = cd;
            this.triggerBossCast(ability.id);
            this.onBossSpellCast?.(ability.id);
            break;
          }
        }
      }
    }

    if (this.timeElapsed >= this.matchDuration && !this.state.isGameOver) {
      this.state.isGameOver = true;
      this.state.survived = !this.bossEntity; // Standard match survival is victory!
      this.notifyState();
      
      const minutes = this.timeElapsed / 60000;
      const wpm = minutes > 0 ? Math.round((this.state.correctKeystrokes / 5) / minutes) : 0;
      const accuracy = this.state.totalKeystrokes > 0 ? Math.round((this.state.correctKeystrokes / this.state.totalKeystrokes) * 100) : 100;
      
      this.sound.stopHeartbeat();
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
    let progressScore = timeRatio * 1.0; 
    progressScore += Math.min(0.5, this.state.combo * 0.01);
    progressScore += Math.min(0.5, this.state.score * 0.0005);
    
    // Scale speed and spawn intervals based on progressScore, heatwave, stagger, and temporal rift
    const heatwaveBonus = this.heatwaveTimer > 0 ? 1.35 : 1.0;
    const staggerSlow = this.bossStunTimer > 0 ? 0.75 : 1.0;
    let temporalModifier = 1.0;
    if (this.temporalRiftTimer > 0) {
      temporalModifier = 0.5 + 1.2 * Math.abs(Math.sin(this.temporalRiftTimer * 0.003));
    }
    const berserkBoost = this.isBossBerserk ? 1.4 : 1.0;
    const difficultyMultiplier = (1 + progressScore) * heatwaveBonus * staggerSlow * temporalModifier * berserkBoost; 
    
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

    // Update screen flash
    if (this.screenFlashTimer > 0) {
      this.screenFlashTimer -= deltaTime;
      if (this.screenFlashTimer <= 0) {
        this.screenFlashTimer = 0;
        this.screenFlashColor = null;
      }
    }

    // Update laser tracers
    for (let i = this.laserTracers.length - 1; i >= 0; i--) {
      const tracer = this.laserTracers[i];
      tracer.life -= deltaTime;
      if (tracer.life <= 0) {
        this.laserTracers.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      if (p.type === 'shockwave') {
        const progress = 1 - (p.life / p.maxLife);
        p.radius = (p.maxRadius || 45) * Math.sin(progress * Math.PI / 2);
      } else {
        if (p.gravity) {
          p.vy += p.gravity * deltaTime;
        }
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.vx *= 0.985;
        p.vy *= 0.985;
        if (p.vRot) {
          p.rotation = (p.rotation || 0) + p.vRot * deltaTime;
        }
      }
    }

    // Update Floating Combat Numbers
    for (let i = this.bossDamageNumbers.length - 1; i >= 0; i--) {
      const fn = this.bossDamageNumbers[i];
      fn.life -= deltaTime;
      fn.y -= deltaTime * 0.045; // Drift upward
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
        const text = Dictionary.getWord(this.random, Difficulty.HARD, undefined, 1.5, this.activeWordPack?.words);
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
    } else if (abilityId === 'molten_eruption') {
      // Ignis Phase 2: Launches 4 blazing eruption words
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < 4; i++) {
        const text = Dictionary.getWord(this.random, Difficulty.HARD, undefined, 2.0, this.activeWordPack?.words);
        this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
        const textWidth = this.ctx.measureText(text).width;
        const minX = textWidth / 2 + 20;
        const maxX = rect.width - (textWidth / 2) - 20;
        this.words.push({
          id: `lava_${this.random().toString(36).substring(2, 9)}`,
          text,
          typed: '',
          x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
          y: -40 - (i * 40),
          speed: this.baseSpeed * 2.2,
          isJunk: true,
          isGolden: false,
          hasTypo: false,
          color: '#f97316'
        });
      }
      this.triggerScreenFlash('rgba(249, 115, 22, 0.35)', 400);
    } else if (abilityId === 'malware_cascade') {
      // Glitch Phase 2: Injects corrupt hex instructions
      const hexes = ['0xDEADBEEF', '0xC001CAFE', '0xBAADF00D', '0xFEEDFACE'];
      const rect = this.canvas.getBoundingClientRect();
      hexes.forEach((hex, idx) => {
        this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
        const textWidth = this.ctx.measureText(hex).width;
        const minX = textWidth / 2 + 20;
        const maxX = rect.width - (textWidth / 2) - 20;
        this.words.push({
          id: `hex_${this.random().toString(36).substring(2, 9)}`,
          text: hex,
          typed: '',
          x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
          y: -40 - (idx * 45),
          speed: this.baseSpeed * 1.6,
          isJunk: false,
          isGolden: false,
          hasTypo: false,
          color: '#ec4899'
        });
      });
      this.triggerScreenFlash('rgba(236, 72, 153, 0.35)', 400);
    } else if (abilityId === 'temporal_rift') {
      // Chronos Phase 2: Warps spacetime
      this.temporalRiftTimer = 7000;
      this.triggerScreenFlash('rgba(168, 85, 247, 0.4)', 500);
    } else if (abilityId === 'quantum_mirror') {
      // Aetheria: Inverts words
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < 3; i++) {
        const raw = Dictionary.getWord(this.random, Difficulty.EASY, undefined, 1.2, this.activeWordPack?.words);
        const reversed = raw.split('').reverse().join('');
        this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
        const textWidth = this.ctx.measureText(reversed).width;
        const minX = textWidth / 2 + 20;
        const maxX = rect.width - (textWidth / 2) - 20;
        this.words.push({
          id: `mirror_${this.random().toString(36).substring(2, 9)}`,
          text: reversed,
          typed: '',
          x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
          y: -40 - (i * 50),
          speed: this.baseSpeed * 1.2,
          isJunk: false,
          isGolden: false,
          hasTypo: false,
          color: '#06b6d4'
        });
      }
      this.triggerScreenFlash('rgba(6, 182, 212, 0.3)', 400);
    } else if (abilityId === 'memory_leak') {
      // Aetheria: Memory leak blocks
      const rect = this.canvas.getBoundingClientRect();
      const blocks = ['0x00FF', 'PURGE_HEAP', 'NULL_PTR', 'LEAK_FREE', 'GC_COLLECT'];
      blocks.forEach((blk, idx) => {
        this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
        const textWidth = this.ctx.measureText(blk).width;
        const minX = textWidth / 2 + 20;
        const maxX = rect.width - (textWidth / 2) - 20;
        this.words.push({
          id: `mem_${this.random().toString(36).substring(2, 9)}`,
          text: blk,
          typed: '',
          x: Math.max(minX, Math.min(maxX, this.random() * (maxX - minX) + minX)),
          y: -30 - (idx * 40),
          speed: this.baseSpeed * 1.7,
          isJunk: true,
          isGolden: false,
          hasTypo: false,
          color: '#10b981'
        });
      });
      this.triggerScreenFlash('rgba(16, 185, 129, 0.35)', 400);
    } else if (abilityId === 'singularity_collapse') {
      // Aetheria Phase 2 Ultimate: Gravitational implosion!
      this.loseLife();
      this.loseLife();
      this.shakeIntensity = 30;
      this.triggerScreenFlash('rgba(16, 185, 129, 0.7)', 800);
    }
  }

  public syncBossHp(currentHp: number, shieldHp?: number) {
    this.bossHp = currentHp;
    if (shieldHp !== undefined) this.bossShieldHp = shieldHp;
  }

  public triggerScreenFlash(color: string, durationMs: number = 300) {
    this.screenFlashColor = color;
    this.screenFlashTimer = durationMs;
    this.screenFlashMaxTimer = durationMs;
  }

  public spawnPopup(x: number, y: number, text: string, color: string = '#fcd34d', isCrit: boolean = false) {
    this.bossDamageNumbers.push({
      x,
      y,
      text,
      life: 950,
      maxLife: 950,
      color,
      isCrit,
      scale: isCrit ? 1.4 : 1.2
    });
  }

  public spawnSparks(x: number, y: number, color: string, count: number = 18, speedMultiplier: number = 0.25) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = (0.1 + this.random() * 0.25) * speedMultiplier;
      this.particles.push({
        x: x + (this.random() - 0.5) * 16,
        y: y + (this.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.06,
        life: 400 + this.random() * 450,
        maxLife: 850,
        color,
        type: 'spark',
        size: 2.5 + this.random() * 2,
        gravity: 0.00035
      });
    }
  }

  public spawnShockwave(x: number, y: number, color: string, maxRadius: number = 55) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 380,
      maxLife: 380,
      color,
      type: 'shockwave',
      size: 3,
      radius: 4,
      maxRadius
    });
  }

  public spawnTypoShards(x: number, y: number) {
    for (let i = 0; i < 9; i++) {
      this.particles.push({
        x: x + (this.random() - 0.5) * 24,
        y: y + (this.random() - 0.5) * 12,
        vx: (this.random() - 0.5) * 0.35,
        vy: (this.random() - 0.5) * 0.35,
        life: 350 + this.random() * 200,
        maxLife: 550,
        color: '#ef4444',
        type: 'shard',
        size: 4 + this.random() * 4,
        rotation: this.random() * Math.PI * 2,
        vRot: (this.random() - 0.5) * 0.02
      });
    }
  }

  public spawnLaserTracer(fromX: number, fromY: number, toX: number, toY: number, color: string) {
    this.laserTracers.push({
      x1: fromX,
      y1: fromY,
      x2: toX,
      y2: toY,
      life: 120,
      maxLife: 120,
      color
    });
  }

  private addFloatingCombatNumber(x: number, y: number, text: string, isCrit: boolean = false, color: string = '#fcd34d') {
    this.bossDamageNumbers.push({
      x,
      y,
      text,
      life: 1000,
      maxLife: 1000,
      color,
      isCrit,
      scale: isCrit ? 1.4 : 1.1
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

    // Draw laser tracers
    for (const tracer of this.laserTracers) {
      const alpha = Math.max(0, tracer.life / tracer.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = tracer.color;
      this.ctx.lineWidth = 2.5 * alpha;
      this.ctx.shadowColor = tracer.color;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.moveTo(tracer.x1, tracer.y1);
      this.ctx.lineTo(tracer.x2, tracer.y2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw words
    this.ctx.font = `24px "${this.fontFamily}", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (const word of this.words) {
      const isTargeted = this.targetedWordId === word.id;
      const isInterrupt = word.id.startsWith('interrupt_');
      const isRevive = word.id.startsWith('revive_');
      
      // Floating badge above special glyphs
      if (isInterrupt || isRevive) {
        this.ctx.save();
        this.ctx.font = `bold 11px "${this.fontFamily}", sans-serif`;
        this.ctx.fillStyle = isInterrupt ? '#38bdf8' : '#34d399';
        this.ctx.shadowColor = isInterrupt ? '#0284c7' : '#059669';
        this.ctx.shadowBlur = 8;
        this.ctx.fillText(isInterrupt ? '⚡ DISRUPT GLYPH' : '💚 REVIVE BEACON', word.x, word.y - 20);
        this.ctx.restore();
      }

      // Draw typed portion
      const typedText = word.typed;
      const remainingText = word.text.substring(word.typed.length);
      
      const typedWidth = this.ctx.measureText(typedText).width;
      const remainingWidth = this.ctx.measureText(remainingText).width;
      const totalWidth = typedWidth + remainingWidth;
      
      const startX = word.x - totalWidth / 2;

      // Targeting reticle around active word or special glyphs
      if (isTargeted || isInterrupt || isRevive) {
        const padX = 14;
        const padY = 8;
        const boxX = startX - padX;
        const boxY = word.y - 14 - padY / 2;
        const boxW = totalWidth + padX * 2;
        const boxH = 28 + padY;
        const cLen = 7;

        this.ctx.save();
        const reticleColor = isTargeted ? this.theme.wordTyped : (isInterrupt ? '#06b6d4' : '#10b981');
        this.ctx.strokeStyle = reticleColor;
        this.ctx.lineWidth = isTargeted ? 2 : 1.5;
        this.ctx.shadowColor = reticleColor;
        this.ctx.shadowBlur = isTargeted ? 8 : 12;

        // 4 Corner Brackets
        this.ctx.beginPath();
        // Top Left
        this.ctx.moveTo(boxX, boxY + cLen);
        this.ctx.lineTo(boxX, boxY);
        this.ctx.lineTo(boxX + cLen, boxY);
        // Top Right
        this.ctx.moveTo(boxX + boxW - cLen, boxY);
        this.ctx.lineTo(boxX + boxW, boxY);
        this.ctx.lineTo(boxX + boxW, boxY + cLen);
        // Bottom Left
        this.ctx.moveTo(boxX, boxY + boxH - cLen);
        this.ctx.lineTo(boxX, boxY + boxH);
        this.ctx.lineTo(boxX + cLen, boxY + boxH);
        // Bottom Right
        this.ctx.moveTo(boxX + boxW - cLen, boxY + boxH);
        this.ctx.lineTo(boxX + boxW, boxY + boxH);
        this.ctx.lineTo(boxX + boxW, boxY + boxH - cLen);
        this.ctx.stroke();

        // Pulsing active character cursor
        if (isTargeted && remainingText.length > 0) {
          const nextChar = remainingText[0];
          const nextCharWidth = this.ctx.measureText(nextChar).width;
          const cursorX = startX + typedWidth;
          const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.014);
          this.ctx.globalAlpha = pulse;
          this.ctx.fillStyle = this.theme.wordTyped;
          this.ctx.fillRect(cursorX, word.y + 14, Math.max(8, nextCharWidth), 3);
        }
        this.ctx.restore();
      }

      // Typed characters
      this.ctx.fillStyle = this.theme.wordTyped;
      this.ctx.fillText(typedText, startX + typedWidth / 2, word.y);
      
      // Remaining characters
      let remColor = isTargeted ? this.theme.wordRemaining : (word.isJunk ? this.theme.wordJunk : (word.isGolden ? '#fbbf24' : '#9ca3af'));
      if (isInterrupt) remColor = '#38bdf8';
      else if (isRevive) remColor = '#34d399';

      this.ctx.fillStyle = remColor;
      if (isInterrupt) {
        this.ctx.shadowBlur = 14;
        this.ctx.shadowColor = '#06b6d4';
      } else if (isRevive) {
        this.ctx.shadowBlur = 14;
        this.ctx.shadowColor = '#10b981';
      } else if (word.isGolden && !word.hasTypo) {
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

    // Draw multi-form particles
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      
      if (p.type === 'shockwave') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius || 10, 0, Math.PI * 2);
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = Math.max(1, (p.size || 3) * alpha);
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = 8;
        this.ctx.stroke();
      } else if (p.type === 'spark' || p.type === 'ember') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, Math.max(1, p.size * alpha), 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = p.type === 'spark' ? 6 : 10;
        this.ctx.fill();
      } else if (p.type === 'shard') {
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation || 0);
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(p.x, p.y, 4, 4);
      }
      this.ctx.restore();
    }

    // Draw Floating Combat Numbers & Popups
    for (const fn of this.bossDamageNumbers) {
      const alpha = Math.max(0, fn.life / fn.maxLife);
      const progress = 1 - alpha;
      const scale = (fn.scale || 1) * (progress < 0.2 ? 0.6 + (progress / 0.2) * 0.4 : 1);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(fn.x, fn.y);
      this.ctx.scale(scale, scale);
      this.ctx.font = fn.isCrit ? `bold 28px "${this.fontFamily}", sans-serif` : `bold 20px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = fn.color;
      this.ctx.shadowColor = fn.isCrit ? '#ef4444' : '#000000';
      this.ctx.shadowBlur = fn.isCrit ? 10 : 4;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(fn.text, 0, 0);
      this.ctx.restore();
    }

    // Fullscreen Screen Flash Vignette
    if (this.screenFlashTimer > 0 && this.screenFlashColor) {
      const flashAlpha = (this.screenFlashTimer / this.screenFlashMaxTimer) * 0.45;
      this.ctx.save();
      this.ctx.fillStyle = this.screenFlashColor;
      this.ctx.globalAlpha = flashAlpha;
      this.ctx.fillRect(0, 0, rect.width, rect.height);
      this.ctx.restore();
    }

    // Low-health pulsing red vignette when 1 life remains
    if (this.state.lives === 1 && !this.state.isGameOver) {
      const pulse = 0.2 + 0.14 * Math.sin(performance.now() * 0.007);
      const grad = this.ctx.createRadialGradient(rect.width / 2, rect.height / 2, rect.width * 0.35, rect.width / 2, rect.height / 2, rect.width * 0.65);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      grad.addColorStop(1, `rgba(239, 68, 68, ${pulse})`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Fever Mode (Combo >= 15) Glowing Edge Aura
    if (this.state.combo >= 15 && !this.state.isGameOver) {
      this.ctx.save();
      const feverPulse = 0.4 + 0.3 * Math.sin(performance.now() * 0.008);
      this.ctx.strokeStyle = `rgba(56, 189, 248, ${feverPulse})`;
      this.ctx.lineWidth = 6;
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 18;
      this.ctx.strokeRect(3, 3, rect.width - 6, rect.height - 6);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  private renderBossHeader(canvasWidth: number) {
    if (!this.bossEntity) return;

    const centerX = canvasWidth / 2;
    const hpBarWidth = Math.min(520, canvasWidth * 0.85);
    const hpBarHeight = 20;
    const barX = centerX - hpBarWidth / 2;
    const barY = 28;

    // Team Overdrive Banner
    if (this.isTeamOverdrive) {
      this.ctx.font = `bold 12px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.shadowColor = '#f59e0b';
      this.ctx.shadowBlur = 8;
      this.ctx.fillText('⚡ TEAM OVERDRIVE (1.5x BOSS DAMAGE) ⚡', centerX, barY - 14);
      this.ctx.shadowBlur = 0;
    }

    // Boss Name & Title
    this.ctx.font = `bold 18px "${this.fontFamily}", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = this.bossEntity.accentColor;
    this.ctx.shadowColor = this.bossEntity.themeColor;
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(`${this.bossEntity.icon} ${this.bossEntity.name.toUpperCase()} [${this.bossDifficulty.toUpperCase()}]`, centerX, this.isTeamOverdrive ? barY - 2 : 18);
    this.ctx.shadowBlur = 0;

    // Boss HP Bar Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.strokeStyle = this.bossStunTimer > 0 ? '#06b6d4' : (this.bossPhase === 2 ? '#ef4444' : 'rgba(255, 255, 255, 0.25)');
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

    // Stagger / Stun Overlay
    if (this.bossStunTimer > 0) {
      const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.012);
      this.ctx.fillStyle = `rgba(6, 182, 212, ${pulse})`;
      this.ctx.beginPath();
      this.ctx.roundRect(barX, barY, hpBarWidth, hpBarHeight, 10);
      this.ctx.fill();
    }

    // HP Text
    this.ctx.font = `bold 12px "${this.fontFamily}", sans-serif`;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000000';
    this.ctx.shadowBlur = 4;
    let hpText = this.bossShieldHp > 0
      ? `🛡️ BARRIER: ${this.bossShieldHp} HP | BOSS: ${this.bossHp.toLocaleString()} / ${this.bossMaxHp.toLocaleString()}`
      : `${this.bossHp.toLocaleString()} / ${this.bossMaxHp.toLocaleString()} HP (${Math.round(hpRatio * 100)}%) ${this.bossPhase === 2 ? '🔥 RAGE OVERDRIVE' : ''}`;
    
    if (this.bossStunTimer > 0) {
      hpText = `⚡ STAGGERED! (+50% DMG) [${(this.bossStunTimer / 1000).toFixed(1)}s] ⚡`;
    }
    this.ctx.fillText(hpText, centerX, barY + 14);
    this.ctx.shadowBlur = 0;

    // Active Cast Bar
    if (this.bossCastState) {
      const castBarWidth = hpBarWidth * 0.85;
      const castBarHeight = 14;
      const castBarX = centerX - castBarWidth / 2;
      const castBarY = barY + hpBarHeight + 8;
      const castRatio = Math.min(1, this.bossCastState.progress / this.bossCastState.duration);

      // Warning text & Interrupt progress
      this.ctx.font = `bold 12px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = this.bossCastState.interruptible ? '#38bdf8' : '#fbbf24';
      this.ctx.shadowColor = '#000';
      this.ctx.shadowBlur = 4;
      const castTitle = this.bossCastState.interruptible
        ? `${this.bossCastState.icon} ${this.bossCastState.warningText} [BURST: ${this.bossCastState.damageDuringCast}/${this.bossCastState.interruptThreshold} DMG]`
        : `${this.bossCastState.icon} ${this.bossCastState.warningText}`;
      this.ctx.fillText(castTitle, centerX, castBarY - 3);
      this.ctx.shadowBlur = 0;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.beginPath();
      this.ctx.roundRect(castBarX, castBarY, castBarWidth, castBarHeight, 6);
      this.ctx.fill();

      // Bar fill color: amber/cyan if interruptible, red if not
      this.ctx.fillStyle = this.bossCastState.interruptible ? '#f59e0b' : '#ef4444';
      this.ctx.beginPath();
      this.ctx.roundRect(castBarX, castBarY, castBarWidth * castRatio, castBarHeight, 6);
      this.ctx.fill();
    }

    // Berserk Warning
    if (this.isBossBerserk) {
      this.ctx.font = `bold 12px "${this.fontFamily}", sans-serif`;
      this.ctx.fillStyle = '#ef4444';
      this.ctx.shadowColor = '#dc2626';
      this.ctx.shadowBlur = 8;
      this.ctx.fillText('🚨 BERSERK ENRAGE ACTIVE - BURST OR WIPE! 🚨', centerX, barY + hpBarHeight + 28);
      this.ctx.shadowBlur = 0;
    }

    // Boss Dialogue Speech Bubble
    if (this.bossDialogue) {
      const bubbleY = this.bossCastState ? barY + hpBarHeight + 44 : barY + hpBarHeight + 24;
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

    // Track Keystroke Telemetry
    const cleanKey = key.toLowerCase();
    const now = performance.now();
    const latency = this.lastKeyTime > 0 ? Math.min(1000, Math.max(20, Math.round(now - this.lastKeyTime))) : 150;
    this.lastKeyTime = now;

    let kStat = this.keyStats.get(cleanKey);
    if (!kStat) {
      kStat = { count: 0, errors: 0, totalLatencyMs: 0 };
      this.keyStats.set(cleanKey, kStat);
    }
    kStat.count += 1;
    kStat.totalLatencyMs += latency;

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

        const rect = this.canvas.getBoundingClientRect();
        this.spawnLaserTracer(rect.width / 2, rect.height, target.x, target.y, this.theme.wordTyped);
        this.spawnSparks(target.x, target.y, this.theme.wordTyped, 4, 0.15);
        
        // Word completed
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Wrong hit - record error and break combo
        kStat.errors += 1;
        target.hasTypo = true;
        target.isGolden = false;
        this.sound.playKeystroke(false, 0);
        this.spawnTypoShards(target.x, target.y);
        this.spawnPopup(target.x, target.y - 20, 'MISS!', '#ef4444', false);
        this.triggerScreenFlash('rgba(239, 68, 68, 0.22)', 180);
        this.shakeIntensity = Math.max(this.shakeIntensity, 7);
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

        const rect = this.canvas.getBoundingClientRect();
        this.spawnLaserTracer(rect.width / 2, rect.height, target.x, target.y, this.theme.wordTyped);
        this.spawnSparks(target.x, target.y, this.theme.wordTyped, 4, 0.15);
        
        if (target.typed === target.text) {
          this.destroyWord(target.id);
        }
      } else {
        // Typed a key that doesn't match any word
        kStat.errors += 1;
        this.sound.playKeystroke(false, 0);
        this.triggerScreenFlash('rgba(239, 68, 68, 0.16)', 150);
        this.shakeIntensity = Math.max(this.shakeIntensity, 5);
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
    
    const text = Dictionary.getWord(this.random, diff, this.modifiers || modelMods, progressScore, this.activeWordPack?.words);
    
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
        this.spawnPopup(word.x, word.y - 25, `+${this.state.activePowerUp.toUpperCase()}!`, '#fbbf24', true);
        this.triggerScreenFlash('rgba(251, 191, 36, 0.28)', 250);
      }

      // Check Revive Beacon completion
      if (word.id.startsWith('revive_')) {
        const targetPlayerId = word.id.replace('revive_', '');
        this.sound.playBossRevive();
        this.triggerScreenFlash('rgba(16, 185, 129, 0.45)', 500);
        this.spawnShockwave(word.x, word.y, '#10b981', 85);
        this.spawnPopup(word.x, word.y - 30, 'ALLY RESCUED! 💚', '#10b981', true);
        this.onPlayerRevivedByMe?.(targetPlayerId);
      }

      // Check Interrupt Glyph word completion
      if (this.bossCastState && this.bossCastState.interruptWordId === word.id) {
        this.interruptBossCast(true);
      }

      // Boss Damage Processing
      if (this.bossEntity && normalScore && !this.state.isGameOver) {
        let totalMultiplier = this.synergyMultiplier;
        if (this.bossStunTimer > 0) {
          totalMultiplier *= 1.5; // +50% staggered vulnerability!
        }
        if (this.isBossBerserk) {
          totalMultiplier *= 0.75; // Boss enrage defense
        }
        const { damage, isCrit } = calculateBossDamage(word.text.length, this.state.combo, word.isGolden, totalMultiplier);
        this.totalBossDamageDealt += damage;
        this.sound.playBossHit(isCrit);

        // Check if damage disrupts an active cast
        if (this.bossCastState && this.bossCastState.interruptible) {
          this.bossCastState.damageDuringCast += damage;
          if (this.bossCastState.damageDuringCast >= this.bossCastState.interruptThreshold) {
            this.interruptBossCast(true);
          }
        }

        if (this.bossShieldHp > 0) {
          this.bossShieldHp = Math.max(0, this.bossShieldHp - damage);
          this.addFloatingCombatNumber(word.x, word.y - 15, `-${damage} SHIELD`, isCrit, '#06b6d4');
          if (this.bossShieldHp === 0) {
            this.sound.playShieldBroken();
            this.addFloatingCombatNumber(word.x, word.y - 35, 'SHIELD BROKEN!', true, '#38bdf8');
          }
        } else {
          this.bossHp = Math.max(0, this.bossHp - damage);
          let label = isCrit ? `-${damage} CRIT!` : `-${damage}`;
          if (this.bossStunTimer > 0) {
            label += ' (+50%)';
          } else if (this.isTeamOverdrive) {
            label += ' OVERDRIVE';
          }
          this.addFloatingCombatNumber(word.x, word.y - 15, label, isCrit, isCrit ? '#f59e0b' : (this.bossStunTimer > 0 ? '#38bdf8' : '#f8fafc'));
        }

        this.onBossDamageDealt?.(damage, isCrit, this.bossHp);

        // Check Phase 2 Trigger
        if (this.bossPhase === 1 && this.bossHp <= this.bossMaxHp * 0.5 && this.bossHp > 0) {
          this.bossPhase = 2;
          this.sound.updateBossBGMPhase(2);
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

      const burstColor = word.isJunk ? '#f87171' : (word.isGolden ? '#fbbf24' : this.theme.wordTyped);
      this.spawnShockwave(word.x, word.y, burstColor, word.isGolden ? 65 : 45);
      this.spawnSparks(word.x, word.y, burstColor, word.isGolden ? 24 : 16, word.isGolden ? 0.35 : 0.22);
    }
    const wordX = word ? word.x : this.canvas.width / 2;
    const wordY = word ? word.y : 100;
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
      
      // Dynamic Combo Milestones & Popups
      if (this.state.combo === 5) {
        this.sound.playComboMilestone(5);
        this.spawnPopup(wordX, wordY - 25, '5x COMBO!', '#38bdf8');
      } else if (this.state.combo === 10) {
        this.sound.playComboMilestone(10);
        this.spawnPopup(wordX, wordY - 30, 'FEVER MODE!', '#f59e0b', true);
        this.triggerScreenFlash('rgba(245, 158, 11, 0.22)', 220);
      } else if (this.state.combo === 25) {
        this.sound.playComboMilestone(25);
        this.spawnPopup(wordX, wordY - 35, 'UNSTOPPABLE!', '#ec4899', true);
        this.triggerScreenFlash('rgba(236, 72, 153, 0.25)', 280);
      } else if (this.state.combo === 50) {
        this.sound.playComboMilestone(50);
        this.spawnPopup(wordX, wordY - 40, 'GODLIKE!!', '#a855f7', true);
        this.triggerScreenFlash('rgba(168, 85, 247, 0.32)', 350);
      } else if (this.state.combo > 50 && this.state.combo % 25 === 0) {
        this.sound.playComboMilestone(50);
        this.spawnPopup(wordX, wordY - 35, `${this.state.combo}x STREAK!`, '#6366f1', true);
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
    this.shakeIntensity = 22;
    this.state.lives -= 1;
    this.state.combo = 0;
    this.triggerScreenFlash('rgba(239, 68, 68, 0.38)', 320);
    
    if (this.state.lives === 1) {
      this.sound.startHeartbeat();
    }
    
    if (this.state.lives <= 0) {
      this.sound.stopHeartbeat();
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
      this.shakeIntensity = 28;
      this.triggerScreenFlash('rgba(245, 158, 11, 0.42)', 400);
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
      this.triggerScreenFlash('rgba(56, 189, 248, 0.32)', 300);
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

