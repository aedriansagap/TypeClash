export interface BossAbility {
  id: string;
  name: string;
  description: string;
  icon: string;
  castTime: number; // ms
  cooldown: number; // ms
  warningText: string;
}

export interface BossConfig {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  themeColor: string;
  accentColor: string;
  baseHp: number;
  wordSpeedMultiplier: number;
  abilities: BossAbility[];
  titleReward: {
    id: string;
    name: string;
    description: string;
  };
  flavorQuote: string;
  phase2Quote: string;
  defeatQuote: string;
}

export type BossDifficulty = 'normal' | 'heroic' | 'mythic';

export const BOSS_DIFFICULTIES: Record<BossDifficulty, { label: string; hpMultiplier: number; speedMultiplier: number; color: string }> = {
  normal: { label: 'Normal', hpMultiplier: 1.0, speedMultiplier: 1.0, color: '#38bdf8' },
  heroic: { label: 'Heroic', hpMultiplier: 1.5, speedMultiplier: 1.25, color: '#f59e0b' },
  mythic: { label: 'Mythic', hpMultiplier: 2.2, speedMultiplier: 1.5, color: '#ef4444' }
};

export const BOSSES: Record<string, BossConfig> = {
  ignis: {
    id: 'ignis',
    name: 'Ignis, Flame Colossus',
    subtitle: 'Incinerator of the Word Realm',
    icon: '🔥',
    themeColor: '#ef4444',
    accentColor: '#f59e0b',
    baseHp: 3000,
    wordSpeedMultiplier: 1.0,
    abilities: [
      {
        id: 'firestorm',
        name: 'Meteor Firestorm',
        description: 'Summons blazing high-speed meteors that plunge rapidly down the canvas.',
        icon: '☄️',
        castTime: 3000,
        cooldown: 18000,
        warningText: '⚠️ IGNIS IS SUMMONING METEOR FIRESTORM!'
      },
      {
        id: 'heatwave',
        name: 'Infernal Heatwave',
        description: 'Superheats the battlefield, increasing all falling word speeds by 30%.',
        icon: '💨',
        castTime: 2000,
        cooldown: 25000,
        warningText: '⚠️ HEATWAVE SURGE INCOMING!'
      }
    ],
    titleReward: {
      id: 'colossus_slayer',
      name: '🔥 Colossus Slayer',
      description: 'Extinguished Ignis, The Flame Colossus'
    },
    flavorQuote: '"Your keystrokes will turn to ash before my eternal flame!"',
    phase2Quote: '"MOLTEN CORE OVERDRIVE! BURN IN PURIFYING FIRE!"',
    defeatQuote: '"My flames... extinguished by the speed of words..."'
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch, Cyber Phantom',
    subtitle: 'Corrupter of Source Code',
    icon: '⚡',
    themeColor: '#ec4899',
    accentColor: '#06b6d4',
    baseHp: 4500,
    wordSpeedMultiplier: 1.15,
    abilities: [
      {
        id: 'scramble_pulse',
        name: 'System Scramble Pulse',
        description: 'Corrupts syntax buffer, scrambling untyped characters across all active words.',
        icon: '👾',
        castTime: 3500,
        cooldown: 16000,
        warningText: '⚠️ GLITCH IS BROADCASTING SYSTEM SCRAMBLE!'
      },
      {
        id: 'data_barrier',
        name: 'Data Overload Shield',
        description: 'Deploys an invulnerable energy shield requiring emergency root override glyphs to break.',
        icon: '🛡️',
        castTime: 2500,
        cooldown: 30000,
        warningText: '⚠️ DATA BARRIER ACTIVE - TYPE OVERRIDE CODES!'
      }
    ],
    titleReward: {
      id: 'glitch_breaker',
      name: '⚡ Glitch Breaker',
      description: 'Neutralized Glitch, The Cyber Phantom'
    },
    flavorQuote: '"Syntax error detected. Initiating player termination subroutine."',
    phase2Quote: '"OVERCLOCKING PROCESSORS! RUNNING MALWARE RECURSION!"',
    defeatQuote: '"Kernel panic... fatal crash... process terminated..."'
  },
  chronos: {
    id: 'chronos',
    name: 'Chronos, Void Sovereign',
    subtitle: 'Architect of Temporal Oblivion',
    icon: '🌌',
    themeColor: '#a855f7',
    accentColor: '#fbbf24',
    baseHp: 6500,
    wordSpeedMultiplier: 1.25,
    abilities: [
      {
        id: 'abyssal_fog',
        name: 'Abyssal Void Fog',
        description: 'Obscures center view with dark cosmic fog, leaving only edge sightlines.',
        icon: '🌑',
        castTime: 3000,
        cooldown: 20000,
        warningText: '⚠️ ABYSSAL VOID FOG OBSCURING SIGHTLINES!'
      },
      {
        id: 'supernova_enrage',
        name: 'Supernova Collapse',
        description: 'Channels an apocalyptic blast. Deal 1,200 burst damage in 8 seconds to disrupt!',
        icon: '💥',
        castTime: 8000,
        cooldown: 40000,
        warningText: '🚨 CRITICAL: SUPERNOVA COLLAPSE! BURST DPS TO INTERRUPT!'
      }
    ],
    titleReward: {
      id: 'void_conqueror',
      name: '🌌 Void Conqueror',
      description: 'Conquered Chronos, Void Sovereign'
    },
    flavorQuote: '"Time bows to no one, and your time is at an end."',
    phase2Quote: '"ENTROPY CONSUMES ALL! WITNESS THE BIRTH OF THE VOID!"',
    defeatQuote: '"The continuum fractures... time flows freely once more..."'
  }
};

export function calculateBossDamage(wordLength: number, combo: number, isGolden: boolean = false): { damage: number; isCrit: boolean } {
  const baseDmg = wordLength * (16 + Math.min(combo, 50) * 3);
  if (isGolden) {
    return { damage: Math.round(baseDmg * 2.8), isCrit: true };
  }
  return { damage: Math.round(baseDmg), isCrit: false };
}
