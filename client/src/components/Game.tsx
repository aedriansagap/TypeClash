'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faChartSimple, faBookOpen, faRightFromBracket, faBullseye, faClock, faKey, faFire, faHeart, faTrophy, faChartLine, faBolt, faVolumeHigh, faVolumeXmark, faCrown, faShieldHalved, faArrowUp, faArrowDown, faLock, faSliders, faMusic, faPalette, faCheck, faSkull, faDragon, faUsers, faCopy, faBox, faPlus, faSearch, faThumbsUp, faEye, faTag, faDownload, faUpload, faFileCode, faTrash, faCheckCircle, faKeyboard, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { motion, AnimatePresence } from 'framer-motion';
import { GameEngine, GameState } from '@/lib/GameEngine';
import { SoundEngine } from '@/lib/SoundEngine';
import { THEMES, FONTS } from '@/lib/themes';
import { BOSSES, BOSS_DIFFICULTIES, BossConfig, BossDifficulty } from '@/lib/bosses';
import { WordPack, WordPackCategory, WordPackDifficulty, WORD_PACK_CATEGORIES, OFFICIAL_WORD_PACKS, sanitizeWords, validateWordPack } from '@/lib/wordPacks';
import { KEYBOARD_LAYOUTS, KeyboardLayoutId, HeatmapMetric, KeyTelemetryMap, KeyStat, FingerId, FINGERS, calculateHandBalance, identifyBottlenecks, generateWeaknessDrillWords, getKeyHeatColor } from '@/lib/keyboardAnalytics';

import styles from './Game.module.css';



const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

export const getTierBadge = (rating: number = 1200) => {
  if (rating >= 2200) return { name: 'Grandmaster', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.2)', border: '#f43f5e', icon: faCrown };
  if (rating >= 1900) return { name: 'Diamond', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)', border: '#38bdf8', icon: faShieldHalved };
  if (rating >= 1600) return { name: 'Platinum', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.2)', border: '#2dd4bf', icon: faShieldHalved };
  if (rating >= 1300) return { name: 'Gold', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)', border: '#fbbf24', icon: faTrophy };
  if (rating >= 1000) return { name: 'Silver', color: '#cbd5e1', bg: 'rgba(203, 213, 225, 0.2)', border: '#cbd5e1', icon: faShieldHalved };
  return { name: 'Bronze', color: '#d97706', bg: 'rgba(217, 119, 6, 0.2)', border: '#d97706', icon: faShieldHalved };
};

export interface PlayerTitle {
  id: string;
  name: string;
  description: string;
  unlocked: (profile: any, rating: number) => boolean;
}

export const PLAYER_TITLES: PlayerTitle[] = [
  {
    id: 'novice',
    name: 'Novice Typer',
    description: 'Unlocked for everyone',
    unlocked: () => true
  },
  {
    id: 'speed_demon',
    name: '⚡ Speed Demon',
    description: 'Play 10+ matches',
    unlocked: (p) => (p?.totalGamesPlayed || 0) >= 10
  },
  {
    id: 'combo_maestro',
    name: '🔥 Combo Maestro',
    description: 'Reach a 25+ Max Combo streak',
    unlocked: (p) => (p?.maxCombo || 0) >= 25
  },
  {
    id: 'survivor',
    name: '🛡️ Word Survivor',
    description: 'Survive 5+ games',
    unlocked: (p) => (p?.gamesSurvived || 0) >= 5
  },
  {
    id: 'gold_contender',
    name: '👑 Gold Contender',
    description: 'Reach Gold Tier (1300+ Elo)',
    unlocked: (_, r) => r >= 1300
  },
  {
    id: 'diamond_ace',
    name: '💎 Diamond Ace',
    description: 'Reach Diamond Tier (1900+ Elo)',
    unlocked: (_, r) => r >= 1900
  },
  {
    id: 'grandmaster',
    name: '🏆 Grandmaster',
    description: 'Reach Grandmaster Tier (2200+ Elo)',
    unlocked: (_, r) => r >= 2200
  },
  {
    id: 'colossus_slayer',
    name: '🔥 Colossus Slayer',
    description: 'Defeat Ignis, The Flame Colossus',
    unlocked: (p) => (p?.personalBestScore || 0) >= 150
  },
  {
    id: 'glitch_breaker',
    name: '⚡ Glitch Breaker',
    description: 'Defeat Glitch, The Cyber Phantom',
    unlocked: (p) => (p?.personalBestScore || 0) >= 250
  },
  {
    id: 'void_conqueror',
    name: '🌌 Void Conqueror',
    description: 'Defeat Chronos, Void Sovereign',
    unlocked: (p) => (p?.personalBestScore || 0) >= 400
  }
];

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const soundEngineRef = useRef<SoundEngine | null>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  
  // Auth & Rating State
  const [authMode, setAuthMode] = useState<'SELECT' | 'GUEST' | 'LOGIN' | 'REGISTER'>('SELECT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [userRating, setUserRating] = useState<number>(1200);
  const [userTier, setUserTier] = useState<string>('Silver');
  const [userWins, setUserWins] = useState<number>(0);
  const [userLosses, setUserLosses] = useState<number>(0);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  // Game State
  const [gameState, setGameState] = useState<GameState & { maxCombo: number }>({
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
  });
  
  // UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  
  // FFA State
  const [opponents, setOpponents] = useState<{ [id: string]: { username: string, isHost?: boolean, metrics?: any, isDead?: boolean, rank?: number, score?: number, rating?: number, tier?: string } }>({});
  const [isHost, setIsHost] = useState(false);
  const [finalLeaderboard, setFinalLeaderboard] = useState<any[] | null>(null);
  const [eloChanges, setEloChanges] = useState<Record<string, { oldRating: number, newRating: number, change: number, tier: string }> | null>(null);
  const [waitingForResult, setWaitingForResult] = useState(false);
  const [playerMetrics, setPlayerMetrics] = useState<{ wpm: number, accuracy: number, garbageSent: number } | null>(null);
  const [matchHistory, setMatchHistory] = useState<{time: number, p1: number, opponent?: number}[]>([]);
  
  const [isDaily, setIsDaily] = useState(false);
  const [dailySeed, setDailySeed] = useState<string | null>(null);
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null);

  // Custom Rules
  const [matchDuration, setMatchDuration] = useState<number>(60); // in seconds
  
  // Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'GLOBAL' | 'PERSONAL' | 'RANKED' | 'RAIDS'>('GLOBAL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [raidLeaderboardData, setRaidLeaderboardData] = useState<any[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Boss Rush & Co-Op Raid State
  const [showBossModal, setShowBossModal] = useState(false);
  const [selectedBossId, setSelectedBossId] = useState<string>('ignis');
  const [selectedDifficulty, setSelectedDifficulty] = useState<BossDifficulty>('normal');
  const [isCoopRaidMode, setIsCoopRaidMode] = useState(false);
  const [raidLobbyCodeInput, setRaidLobbyCodeInput] = useState('');
  const [raidLobbyData, setRaidLobbyData] = useState<{
    roomId: string;
    bossId: string;
    bossName: string;
    difficulty: BossDifficulty;
    hostId: string;
    players: Array<{ id: string; username: string; rating: number; isReady: boolean; isHost: boolean }>;
  } | null>(null);
  const [raidTeamStats, setRaidTeamStats] = useState<Array<{ id: string; username: string; damageDealt: number; wpm: number; accuracy: number; lives: number; isDead: boolean }>>([]);
  const [bossVictoryData, setBossVictoryData] = useState<{
    boss: BossConfig;
    clearTimeSeconds: number;
    stats: { totalDamage: number; wpm: number; maxCombo: number; accuracy: number };
    rankings?: any[];
  } | null>(null);
  const [bossDefeatData, setBossDefeatData] = useState<{ bossName: string; remainingHp?: number; maxHp?: number } | null>(null);
  const [isBossFightActive, setIsBossFightActive] = useState(false);
  const [activeBossLeaderboardTab, setActiveBossLeaderboardTab] = useState<string>('all');

  // Word Pack Studio & Workshop State
  const [equippedWordPack, setEquippedWordPack] = useState<WordPack | null>(null);
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [previewPack, setPreviewPack] = useState<WordPack | null>(null);
  const [workshopPacks, setWorkshopPacks] = useState<WordPack[]>(OFFICIAL_WORD_PACKS);
  const [workshopCategory, setWorkshopCategory] = useState<string>('all');
  const [workshopSearch, setWorkshopSearch] = useState<string>('');
  const [workshopSort, setWorkshopSort] = useState<string>('popular');
  const [isWorkshopLoading, setIsWorkshopLoading] = useState(false);
  const [likedPackIds, setLikedPackIds] = useState<Set<string>>(new Set());

  // Studio Form State
  const [studioTitle, setStudioTitle] = useState('');
  const [studioDesc, setStudioDesc] = useState('');
  const [studioCategory, setStudioCategory] = useState<WordPackCategory>('coding');
  const [studioIcon, setStudioIcon] = useState('💻');
  const [studioDifficulty, setStudioDifficulty] = useState<WordPackDifficulty>('intermediate');
  const [studioTags, setStudioTags] = useState('');
  const [studioRawWords, setStudioRawWords] = useState('');
  const [studioError, setStudioError] = useState('');
  const [isPublishingPack, setIsPublishingPack] = useState(false);

  // Studio Sandbox Simulator State
  const [sandboxIndex, setSandboxIndex] = useState(0);
  const [sandboxInput, setSandboxInput] = useState('');
  const [sandboxScore, setSandboxScore] = useState(0);
  const [sandboxCompleted, setSandboxCompleted] = useState(false);

  // Keyboard Heatmap & Ergonomics State
  const [lifetimeKeyTelemetry, setLifetimeKeyTelemetry] = useState<KeyTelemetryMap>({});
  const [showHeatmapModal, setShowHeatmapModal] = useState(false);
  const [heatmapLayout, setHeatmapLayout] = useState<KeyboardLayoutId>('qwerty');
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('frequency');
  const [selectedKeyDetail, setSelectedKeyDetail] = useState<KeyStat | null>(null);
  
  // Cosmetics & Customization
  const [customization, setCustomization] = useState({ theme: 'dark', fontFamily: 'Inter' });


  const [userTitle, setUserTitle] = useState<string>('Novice Typer');
  const [hudSettings, setHudSettings] = useState<{
    showWpm: boolean;
    showAccuracy: boolean;
    showCombo: boolean;
    sfxVolume: number;
    bgmVolume: number;
  }>({
    showWpm: true,
    showAccuracy: true,
    showCombo: true,
    sfxVolume: 0.8,
    bgmVolume: 0.6
  });

  const [isMuted, setIsMuted] = useState(false);
  // Mobile Detection
  const [isMobile, setIsMobile] = useState(false);
  const [dismissedMobileWarning, setDismissedMobileWarning] = useState(false);
  
  // Auto Matchmaking
  const [isSearchingAuto, setIsSearchingAuto] = useState(false);
  const [searchRatingInfo, setSearchRatingInfo] = useState<{ rating: number, tier: string } | null>(null);

  // Profile & Chart State
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartDuration, setChartDuration] = useState<number>(60);
  const [chartMode, setChartMode] = useState<string>('vanilla');

  // Game Modifiers
  const [mods, setMods] = useState({ includeNumbers: false, includePunctuation: false, longestWords: false });
  const [leaderboardMode, setLeaderboardMode] = useState('vanilla');


  // Load from LocalStorage & Session Expiry
  useEffect(() => {
    const savedId = localStorage.getItem('typeclash_userid');
    const savedName = localStorage.getItem('typeclash_username');
    const savedIsGuest = localStorage.getItem('typeclash_isguest') === 'true';
    const savedToken = localStorage.getItem('typeclash_token');
    const savedRating = localStorage.getItem('typeclash_rating');
    const savedWins = localStorage.getItem('typeclash_wins');
    const savedLosses = localStorage.getItem('typeclash_losses');
    const savedTitle = localStorage.getItem('typeclash_title');
    const savedHud = localStorage.getItem('typeclash_hudsettings');
    
    if (savedRating) {
      const parsedRating = parseInt(savedRating, 10);
      setUserRating(parsedRating);
      setUserTier(getTierBadge(parsedRating).name);
    }
    if (savedWins) setUserWins(parseInt(savedWins, 10));
    if (savedLosses) setUserLosses(parseInt(savedLosses, 10));
    if (savedTitle) setUserTitle(savedTitle);
    if (savedHud) {
      try {
        setHudSettings(JSON.parse(savedHud));
      } catch(e) {}
    }

    const savedTelemetry = localStorage.getItem('typeclash_keyboard_telemetry');
    if (savedTelemetry) {
      try {
        setLifetimeKeyTelemetry(JSON.parse(savedTelemetry));
      } catch (e) {}
    }

    
    if (savedId && savedName && savedToken) {
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        if (isExpired) {
          handleLogout();
        } else {
          setUserId(savedId);
          setUsername(savedName);
          setIsGuest(savedIsGuest);
          
          const savedCustomization = localStorage.getItem('typeclash_customization');
          if (savedCustomization) {
            try {
              setCustomization(JSON.parse(savedCustomization));
            } catch (e) {}
          }
        }
      } catch (e) {
        handleLogout();
      }
    }

    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Global Sound Engine Initialization
    if (!soundEngineRef.current) {
      soundEngineRef.current = new SoundEngine();
    }

    
    const handleInteraction = () => {
      if (soundEngineRef.current) {
        soundEngineRef.current.init();
        soundEngineRef.current.resume();
        // Start Menu BGM only if we are not actively in a game
        if (!isPlaying && !gameState.isGameOver) {
          soundEngineRef.current.startMenuBGM();
        }
      }
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    // Initialize Game Engine
    if (canvasRef.current && !engineRef.current && soundEngineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current, THEMES[customization.theme], customization.fontFamily, soundEngineRef.current);
      engineRef.current.onStateChange = (state) => {
        setGameState(state);
        setActivePowerUp(state.activePowerUp);
      };
      
      engineRef.current.onPowerUpUsed = (type) => {
        if (socketRef.current && !isSinglePlayer) {
          socketRef.current.emit('use_powerup', type);
        }
      };
      
      engineRef.current.onGarbageGenerated = (amount) => {
        if (socketRef.current) {
          socketRef.current.emit('send_garbage', amount);
        }
      };
      
      engineRef.current.onMetricsUpdate = (metrics) => {
        setPlayerMetrics(metrics);
        if (socketRef.current && !isSinglePlayer) {
          socketRef.current.emit('player_update', metrics);
        }
        
        let topOppWpm = 0;
        setOpponents(ops => {
          Object.values(ops).forEach(op => {
             if (op.metrics && op.metrics.wpm > topOppWpm) topOppWpm = op.metrics.wpm;
          });
          return ops;
        });
        
        setMatchHistory(prev => [...prev, { time: prev.length, p1: metrics.wpm, opponent: topOppWpm }]);
      };

      engineRef.current.onBossDamageDealt = (damage, isCrit, currentHp) => {
        if (socketRef.current && isCoopRaidMode && raidLobbyData) {
          socketRef.current.emit('raid_damage_dealt', {
            roomId: raidLobbyData.roomId,
            damage,
            isCrit,
            wpm: playerMetrics?.wpm || 0,
            accuracy: playerMetrics?.accuracy || 100
          });
        }
      };

      engineRef.current.onBossDefeated = (boss, clearTimeSeconds, stats) => {
        setIsPlaying(false);
        setIsBossFightActive(false);
        setBossVictoryData({ boss, clearTimeSeconds, stats });
        if (userId && !isGuest) {
          updateCustomization(customization.theme, customization.fontFamily, boss.titleReward.name, hudSettings);
        }
      };

      engineRef.current.onBossSpellCast = (abilityId) => {
        if (socketRef.current && isCoopRaidMode && raidLobbyData) {
          socketRef.current.emit('raid_boss_spell_cast', {
            roomId: raidLobbyData.roomId,
            abilityId
          });
        }
      };

    }
  }, [isSinglePlayer, isCoopRaidMode, raidLobbyData, playerMetrics]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCustomization(THEMES[customization.theme] || THEMES.dark, customization.fontFamily);
    }
  }, [customization]);

  useEffect(() => {
    if (soundEngineRef.current) {
      soundEngineRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    // Initialize Socket Connection
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL);

      socketRef.current.on('lobby_update', (data: { players: any[] }) => {
        const ops: any = {};
        data.players.forEach(p => {
          if (p.id !== socketRef.current?.id) ops[p.id] = p;
          else setIsHost(p.isHost);
        });
        setOpponents(ops);
      });

      socketRef.current.on('game_start', (data: { seed: string, duration: number, roomId?: string, mods?: any, players?: any[] }) => {
        setWaitingForOpponent(false);
        setIsSearchingAuto(false);
        setIsSinglePlayer(false);
        setIsCoopRaidMode(false);
        setIsBossFightActive(false);
        setIsPlaying(true);
        setWaitingForResult(false);
        setPlayerMetrics(null);
        setMatchHistory([]);
        setFinalLeaderboard(null);
        setMatchDuration(data.duration);
        if (data.roomId) setCurrentRoom(data.roomId);
        
        if (data.players) {
          const ops: any = {};
          data.players.forEach(p => {
            if (p.id !== socketRef.current?.id) ops[p.id] = p;
          });
          setOpponents(ops);
        }

        if (engineRef.current) {
          engineRef.current.start(data.seed, data.duration * 1000, data.mods);
        }
      });

      socketRef.current.on('searching_for_match', (data?: { rating?: number, tier?: string }) => {
        setIsSearchingAuto(true);
        if (data && data.rating) {
          setSearchRatingInfo({ rating: data.rating, tier: data.tier || getTierBadge(data.rating).name });
        } else {
          setSearchRatingInfo({ rating: userRating, tier: userTier });
        }
      });

      socketRef.current.on('receive_garbage', (amount: number) => {
        if (engineRef.current) {
          engineRef.current.receiveGarbage(amount);
        }
      });

      socketRef.current.on('receive_powerup', (type: string) => {
        if (engineRef.current) {
          engineRef.current.receivePowerUp(type);
        }
      });

      socketRef.current.on('opponent_update', (data: { id: string, metrics: any }) => {
        setOpponents(prev => {
          if (!prev[data.id]) return prev;
          return { ...prev, [data.id]: { ...prev[data.id], metrics: data.metrics } };
        });
      });

      socketRef.current.on('player_died', (data: { id: string, rank: number, score: number }) => {
        if (data.id !== socketRef.current?.id) {
          setOpponents(prev => {
            if (!prev[data.id]) return prev;
            return { ...prev, [data.id]: { ...prev[data.id], isDead: true, rank: data.rank, score: data.score } };
          });
        }
      });

      socketRef.current.on('opponent_disconnected', (data: { id: string }) => {
        setOpponents(prev => {
          const next = { ...prev };
          delete next[data.id];
          return next;
        });
      });

      socketRef.current.on('match_result', (data: { leaderboard: any[], eloChanges?: Record<string, any> }) => {
        setWaitingForResult(false);
        setFinalLeaderboard(data.leaderboard);
        if (data.eloChanges) {
          setEloChanges(data.eloChanges);
          const myId = socketRef.current?.id;
          if (myId && data.eloChanges[myId]) {
            const myElo = data.eloChanges[myId];
            setUserRating(myElo.newRating);
            setUserTier(myElo.tier || getTierBadge(myElo.newRating).name);
            localStorage.setItem('typeclash_rating', myElo.newRating.toString());
            localStorage.setItem('typeclash_tier', (myElo.tier || getTierBadge(myElo.newRating).name));
            if (myElo.change > 0) {
              setUserWins(prev => {
                const nw = prev + 1;
                localStorage.setItem('typeclash_wins', nw.toString());
                return nw;
              });
            } else if (myElo.change < 0) {
              setUserLosses(prev => {
                const nl = prev + 1;
                localStorage.setItem('typeclash_losses', nl.toString());
                return nl;
              });
            }
          }
        }
      });

      // --- Raid Socket Events --- //
      socketRef.current.on('raid_lobby_created', (data: { roomId: string, room: any }) => {
        setRaidLobbyData({
          roomId: data.roomId,
          bossId: data.room.bossId,
          bossName: data.room.bossName,
          difficulty: data.room.difficulty,
          hostId: data.room.hostId,
          players: [{ id: socketRef.current?.id || '', username: username || 'Raid Leader', rating: userRating, isReady: true, isHost: true }]
        });
      });

      socketRef.current.on('raid_lobby_update', (data: { roomId: string, bossId: string, bossName: string, difficulty: BossDifficulty, hostId: string, players: any[] }) => {
        setRaidLobbyData({
          roomId: data.roomId,
          bossId: data.bossId,
          bossName: data.bossName,
          difficulty: data.difficulty,
          hostId: data.hostId,
          players: data.players.map(p => ({
            id: p.id,
            username: p.username,
            rating: p.rating,
            isReady: p.isReady,
            isHost: p.id === data.hostId
          }))
        });
      });

      socketRef.current.on('raid_match_start', (data: { roomId: string, seed: string, bossId: string, bossName: string, difficulty: BossDifficulty, maxHp: number, currentHp: number, partySize: number, players: any[] }) => {
        setShowBossModal(false);
        setIsSinglePlayer(false);
        setIsCoopRaidMode(true);
        setIsBossFightActive(true);
        setIsPlaying(true);
        setPlayerMetrics(null);
        setMatchHistory([]);
        setBossVictoryData(null);
        setBossDefeatData(null);
        setRaidTeamStats(data.players.map(p => ({
          id: p.id,
          username: p.username,
          damageDealt: 0,
          wpm: 0,
          accuracy: 100,
          lives: 4,
          isDead: false
        })));

        if (engineRef.current) {
          engineRef.current.startBossFight(data.bossId, data.difficulty, true, data.partySize, data.seed);
        }
      });

      socketRef.current.on('raid_boss_hp_sync', (data: { currentHp: number, maxHp: number, shieldHp: number, dealerId: string, dealerName: string, damage: number, isCrit: boolean }) => {
        if (engineRef.current) {
          engineRef.current.syncBossHp(data.currentHp, data.shieldHp);
        }
      });

      socketRef.current.on('raid_team_stats_sync', (data: { players: any[] }) => {
        setRaidTeamStats(data.players.map(p => ({
          id: p.id,
          username: p.username,
          damageDealt: p.damageDealt || 0,
          wpm: p.wpm || 0,
          accuracy: p.accuracy || 100,
          lives: p.lives ?? 4,
          isDead: p.isDead || false
        })));
      });

      socketRef.current.on('raid_boss_spell_trigger', (data: { abilityId: string, shieldHp: number }) => {
        if (engineRef.current) {
          engineRef.current.executeBossAbility(data.abilityId);
          if (data.shieldHp) engineRef.current.bossShieldHp = data.shieldHp;
        }
      });

      socketRef.current.on('raid_player_down', (data: { id: string, username: string }) => {
        setRaidTeamStats(prev => prev.map(p => p.id === data.id ? { ...p, isDead: true, lives: 0 } : p));
      });

      socketRef.current.on('raid_victory_all', (data: { bossId: string, bossName: string, difficulty: BossDifficulty, clearTimeSeconds: number, totalTeamDamage: number, rankings: any[] }) => {
        setIsPlaying(false);
        setIsBossFightActive(false);
        const boss = BOSSES[data.bossId] || BOSSES.ignis;
        const myStats = data.rankings.find(r => r.id === socketRef.current?.id);
        setBossVictoryData({
          boss,
          clearTimeSeconds: data.clearTimeSeconds,
          stats: {
            totalDamage: myStats?.damageDealt || 0,
            wpm: myStats?.wpm || 0,
            maxCombo: 0,
            accuracy: myStats?.accuracy || 100
          },
          rankings: data.rankings
        });
        if (userId && !isGuest) {
          updateCustomization(customization.theme, customization.fontFamily, boss.titleReward.name, hudSettings);
        }
      });

      socketRef.current.on('raid_defeat_all', (data: { bossId: string, bossName: string, remainingBossHp: number, maxHp: number }) => {
        setIsPlaying(false);
        setIsBossFightActive(false);
        setBossDefeatData({
          bossName: data.bossName,
          remainingHp: data.remainingBossHp,
          maxHp: data.maxHp
        });
      });

      socketRef.current.on('raid_error', (data: { message: string }) => {
        alert(data.message);
      });

      socketRef.current.on('waiting_for_result', () => {

        setWaitingForResult(true);
      });

      socketRef.current.on('room_error', (data: { message: string }) => {
        alert(data.message);
        setWaitingForOpponent(false);
        setCurrentRoom('');
      });
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Update Game Over Callback when state changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.onGameOverCallback = async (score, maxCombo, survived, metrics) => {
        // Collect match key telemetry into lifetime state
        const matchTelemetry = engineRef.current?.getKeyTelemetry();
        if (matchTelemetry && Object.keys(matchTelemetry).length > 0) {
          setLifetimeKeyTelemetry(prev => {
            const updated: KeyTelemetryMap = { ...prev };
            for (const [k, stat] of Object.entries(matchTelemetry)) {
              if (!updated[k]) {
                updated[k] = { ...stat };
              } else {
                const cur = updated[k];
                const newCount = cur.count + stat.count;
                const newErrors = cur.errors + stat.errors;
                const newTotalTime = cur.totalLatencyMs + stat.totalLatencyMs;
                updated[k] = {
                  key: k,
                  count: newCount,
                  errors: newErrors,
                  totalLatencyMs: newTotalTime,
                  avgLatencyMs: newCount > 0 ? Math.round(newTotalTime / newCount) : 0,
                  accuracy: newCount > 0 ? Math.max(0, Math.round(((newCount - newErrors) / newCount) * 100)) : 100
                };
              }
            }
            localStorage.setItem('typeclash_keyboard_telemetry', JSON.stringify(updated));
            return updated;
          });
        }

        if (isSinglePlayer) {
          setPlayerMetrics(metrics);
          if (userId) {
            let modeStr = 'vanilla';
            if (isDaily && dailySeed) {
              modeStr = `daily_${dailySeed}`;
            } else {
              const modArr = [];
              if (mods.includeNumbers) modArr.push('numbers');
              if (mods.includePunctuation) modArr.push('punctuation');
              if (mods.longestWords) modArr.push('long_words');
              if (modArr.length > 0) modeStr = modArr.join('_');
            }

            fetch(`${SERVER_URL}/api/score`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, score, maxCombo, matchDuration, survived, mode: modeStr, isPvP: false })
            }).catch(console.error);
          }
        } else if (!isSinglePlayer && socketRef.current) {
          socketRef.current.emit('game_over', { score, maxCombo, survived, metrics });
        }
      };
    }
  }, [isSinglePlayer, userId, matchDuration, isDaily, dailySeed, mods]);


  // Auto Matchmaking Timeout Fallback
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isSearchingAuto) {
      timeout = setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.emit('cancel_match');
        }
        setIsSearchingAuto(false);
        
        setIsSinglePlayer(true);
        setIsPlaying(true);
        setPlayerMetrics(null);
        setMatchHistory([]);
        setGameState(prev => ({...prev, isGameOver: false}));
        
        if (engineRef.current) {
          engineRef.current.start(Math.random().toString(), matchDuration * 1000, mods);
        }
        
        alert("Matchmaking timeout: Expanding pool or opponent offline. Starting a Single Player practice match!");
      }, 15000);
    }
    return () => clearTimeout(timeout);
  }, [isSearchingAuto, matchDuration, mods]);

  const handleAuth = async (endpoint: string) => {
    if (!username.trim()) return;
    setAuthError('');
    setIsAuthLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (data.error) setAuthError(data.error);
      else {
        setUserId(data.id);
        setIsGuest(data.isGuest);
        localStorage.setItem('typeclash_userid', data.id);
        localStorage.setItem('typeclash_username', data.username);
        localStorage.setItem('typeclash_isguest', data.isGuest.toString());
        localStorage.setItem('typeclash_token', data.token);
        
        if (data.rating !== undefined) {
          setUserRating(data.rating);
          const tierName = data.tier || getTierBadge(data.rating).name;
          setUserTier(tierName);
          localStorage.setItem('typeclash_rating', data.rating.toString());
          localStorage.setItem('typeclash_tier', tierName);
        }
        if (data.wins !== undefined) {
          setUserWins(data.wins);
          localStorage.setItem('typeclash_wins', data.wins.toString());
        }
        if (data.losses !== undefined) {
          setUserLosses(data.losses);
          localStorage.setItem('typeclash_losses', data.losses.toString());
        }
        if (data.customization) {
          setCustomization(data.customization);
          localStorage.setItem('typeclash_customization', JSON.stringify(data.customization));
        }
      }
    } catch(e) {
      setAuthError('Failed to connect to server');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const mockEmail = prompt("Enter your Google Account email:", username ? `${username}@gmail.com` : "player@gmail.com");
      if (!mockEmail) {
        setIsAuthLoading(false);
        return;
      }

      const res = await fetch(`${SERVER_URL}/api/auth/oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          oauthId: `google_${mockEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: mockEmail,
          username: mockEmail.split('@')[0],
          guestUserId: isGuest ? userId : null
        })
      });

      const data = await res.json();
      if (data.error) setAuthError(data.error);
      else {
        setUserId(data.id);
        setUsername(data.username);
        setIsGuest(false);
        localStorage.setItem('typeclash_userid', data.id);
        localStorage.setItem('typeclash_username', data.username);
        localStorage.setItem('typeclash_isguest', 'false');
        localStorage.setItem('typeclash_token', data.token);
        
        if (data.rating !== undefined) {
          setUserRating(data.rating);
          const tierName = data.tier || getTierBadge(data.rating).name;
          setUserTier(tierName);
          localStorage.setItem('typeclash_rating', data.rating.toString());
          localStorage.setItem('typeclash_tier', tierName);
        }
        if (data.wins !== undefined) {
          setUserWins(data.wins);
          localStorage.setItem('typeclash_wins', data.wins.toString());
        }
        if (data.losses !== undefined) {
          setUserLosses(data.losses);
          localStorage.setItem('typeclash_losses', data.losses.toString());
        }
        if (data.customization) {
          if (data.customization.theme && data.customization.fontFamily) {
            setCustomization({ theme: data.customization.theme, fontFamily: data.customization.fontFamily });
          }
          if (data.customization.title) setUserTitle(data.customization.title);
          if (data.customization.hudSettings) setHudSettings(prev => ({ ...prev, ...data.customization.hudSettings }));
        }
      }
    } catch (e) {
      setAuthError('OAuth authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };


  const handleLogout = () => {
    localStorage.removeItem('typeclash_userid');
    localStorage.removeItem('typeclash_username');
    localStorage.removeItem('typeclash_isguest');
    localStorage.removeItem('typeclash_token');
    localStorage.removeItem('typeclash_customization');
    localStorage.removeItem('typeclash_rating');
    localStorage.removeItem('typeclash_tier');
    localStorage.removeItem('typeclash_wins');
    localStorage.removeItem('typeclash_losses');
    setUserId(null);
    setUsername('');
    setPassword('');
    setIsGuest(false);
    setUserRating(1200);
    setUserTier('Silver');
    setUserWins(0);
    setUserLosses(0);
    setAuthMode('SELECT');
  };

  const loadChartData = async (duration: number = chartDuration, mode: string = chartMode) => {
    if (!userId) return;
    try {
      setChartDuration(duration);
      setChartMode(mode);
      const res = await fetch(`${SERVER_URL}/api/leaderboard/personal/${userId}/${duration}/${mode}`);
      const data = await res.json();
      // Data comes newest first, reverse for chronological chart
      const formatted = data.reverse().map((d: any, idx: number) => ({
        name: `G${idx + 1}`,
        score: d.score,
        combo: d.maxCombo,
        date: new Date(d.date).toLocaleDateString()
      }));
      setChartData(formatted);
    } catch (err) {
      console.error('Failed to load chart data:', err);
    }
  };

  const loadProfile = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/profile/${userId}`);
      const data = await res.json();
      setProfileData(data);
      if (data.rating !== undefined) {
        setUserRating(data.rating);
        setUserTier(data.tier || getTierBadge(data.rating).name);
      }
      if (data.wins !== undefined) setUserWins(data.wins);
      if (data.losses !== undefined) setUserLosses(data.losses);
      if (data.customization) {
        if (data.customization.theme && data.customization.fontFamily) {
          setCustomization({ theme: data.customization.theme, fontFamily: data.customization.fontFamily });
        }
        if (data.customization.title) {
          setUserTitle(data.customization.title);
        }
        if (data.customization.hudSettings) {
          setHudSettings(prev => ({ ...prev, ...data.customization.hudSettings }));
          if (soundEngineRef.current) {
            soundEngineRef.current.setSfxVolume(data.customization.hudSettings.sfxVolume ?? 0.8);
            soundEngineRef.current.setBgmVolume(data.customization.hudSettings.bgmVolume ?? 0.6);
          }
        }
      }
      await loadChartData(chartDuration, chartMode);
      setShowProfile(true);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const updateCustomization = async (
    newTheme: string = customization.theme, 
    newFont: string = customization.fontFamily,
    newTitle: string = userTitle,
    newHud: typeof hudSettings = hudSettings
  ) => {
    const nextCustomization = { theme: newTheme, fontFamily: newFont };
    setCustomization(nextCustomization);
    setUserTitle(newTitle);
    setHudSettings(newHud);
    
    if (soundEngineRef.current) {
      soundEngineRef.current.setSfxVolume(newHud.sfxVolume);
      soundEngineRef.current.setBgmVolume(newHud.bgmVolume);
    }
    
    localStorage.setItem('typeclash_customization', JSON.stringify(nextCustomization));
    localStorage.setItem('typeclash_title', newTitle);
    localStorage.setItem('typeclash_hudsettings', JSON.stringify(newHud));
    
    if (userId && !isGuest) {
      try {
        await fetch(`${SERVER_URL}/api/profile/customization`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId, 
            ...nextCustomization, 
            title: newTitle, 
            hudSettings: newHud 
          })
        });
      } catch (err) {
        console.error('Failed to update customization on server');
      }
    }
  };


  const loadLeaderboard = async (tab: 'GLOBAL' | 'PERSONAL' | 'RANKED' | 'RAIDS', mode: string = leaderboardMode, duration: number = matchDuration, bossFilter: string = activeBossLeaderboardTab) => {
    setLeaderboardTab(tab);
    setLeaderboardMode(mode);
    setMatchDuration(duration);
    setActiveBossLeaderboardTab(bossFilter);
    setIsLeaderboardLoading(true);
    try {
      if (tab === 'RAIDS') {
        const filterPath = bossFilter && bossFilter !== 'all' ? `/${bossFilter}` : '';
        const res = await fetch(`${SERVER_URL}/api/leaderboard/raids${filterPath}`);
        const data = await res.json();
        setRaidLeaderboardData(data);
        setShowLeaderboard(true);
        return;
      }

      let url = `${SERVER_URL}/api/leaderboard/${duration}/${mode}`;
      if (tab === 'PERSONAL') {
        url = `${SERVER_URL}/api/leaderboard/personal/${userId}/${duration}/${mode}`;
      } else if (tab === 'RANKED') {
        url = `${SERVER_URL}/api/leaderboard/ranked`;
      }
        
      const res = await fetch(url);
      const data = await res.json();
      setLeaderboardData(data);
      setShowLeaderboard(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  // Boss Rush Actions
  const startSoloBossFight = (bossId: string = selectedBossId, difficulty: BossDifficulty = selectedDifficulty) => {
    setShowBossModal(false);
    setIsSinglePlayer(true);
    setIsCoopRaidMode(false);
    setIsBossFightActive(true);
    setIsPlaying(true);
    setWaitingForOpponent(false);
    setFinalLeaderboard(null);
    setBossVictoryData(null);
    setBossDefeatData(null);
    setMatchHistory([]);
    setPlayerMetrics(null);
    setGameState(prev => ({ ...prev, isGameOver: false }));

    if (engineRef.current) {
      engineRef.current.startBossFight(bossId, difficulty, false, 1);
    }
  };

  const createRaidLobby = (bossId: string = selectedBossId, difficulty: BossDifficulty = selectedDifficulty) => {
    const boss = BOSSES[bossId] || BOSSES.ignis;
    socketRef.current?.emit('create_raid_lobby', {
      bossId,
      bossName: boss.name,
      difficulty,
      userId,
      username: username || 'Raid Leader',
      rating: userRating,
      customWords: equippedWordPack?.words,
      wordPackTitle: equippedWordPack?.title
    });
  };

  const joinRaidLobby = (code: string) => {
    if (!code.trim()) return;
    socketRef.current?.emit('join_raid_lobby', {
      roomId: code.trim().toUpperCase(),
      userId,
      username: username || 'Raider',
      rating: userRating
    });
  };

  const toggleRaidReady = () => {
    if (raidLobbyData) {
      socketRef.current?.emit('toggle_raid_ready', { roomId: raidLobbyData.roomId });
    }
  };

  const startRaidMatch = () => {
    if (raidLobbyData) {
      socketRef.current?.emit('start_raid_match', { roomId: raidLobbyData.roomId });
    }
  };

  const leaveRaidLobby = () => {
    setRaidLobbyData(null);
    socketRef.current?.disconnect();
    socketRef.current = io(SERVER_URL);
  };

  // --- Word Pack Workshop & Studio Actions --- //

  const loadWorkshopPacks = async (cat = workshopCategory, q = workshopSearch, s = workshopSort) => {
    setIsWorkshopLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/wordpacks?category=${cat}&search=${encodeURIComponent(q)}&sort=${s}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setWorkshopPacks(data);
        } else {
          setWorkshopPacks(OFFICIAL_WORD_PACKS);
        }
      } else {
        setWorkshopPacks(OFFICIAL_WORD_PACKS);
      }
    } catch (e) {
      setWorkshopPacks(OFFICIAL_WORD_PACKS);
    } finally {
      setIsWorkshopLoading(false);
    }
  };

  const handleEquipPack = (pack: WordPack | null) => {
    if (pack) {
      if (equippedWordPack?.id === pack.id) {
        // Toggle unequip
        setEquippedWordPack(null);
        localStorage.removeItem('typeclash_equipped_wordpack');
        if (engineRef.current) engineRef.current.setWordPack(null);
      } else {
        setEquippedWordPack(pack);
        localStorage.setItem('typeclash_equipped_wordpack', JSON.stringify(pack));
        if (engineRef.current) engineRef.current.setWordPack(pack);
      }
    } else {
      setEquippedWordPack(null);
      localStorage.removeItem('typeclash_equipped_wordpack');
      if (engineRef.current) engineRef.current.setWordPack(null);
    }
  };

  const handleLikePack = async (packId: string) => {
    if (likedPackIds.has(packId)) return;
    setLikedPackIds(prev => new Set(prev).add(packId));
    setWorkshopPacks(prev => prev.map(p => p.id === packId ? { ...p, likesCount: (p.likesCount || 0) + 1 } : p));
    try {
      await fetch(`${SERVER_URL}/api/wordpacks/${packId}/like`, { method: 'POST' });
    } catch (e) {}
  };

  const handleSaveCustomPack = async (publishToCommunity: boolean) => {
    setStudioError('');
    const rawSanitized = sanitizeWords(studioRawWords);
    const packPayload: Partial<WordPack> = {
      title: studioTitle,
      description: studioDesc,
      category: studioCategory,
      icon: studioIcon,
      color: '#38bdf8',
      difficulty: studioDifficulty,
      tags: studioTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      words: rawSanitized,
      author: username || 'Community Typer',
      authorId: userId || undefined
    };

    const validation = validateWordPack(packPayload);
    if (!validation.valid) {
      setStudioError(validation.error || 'Invalid word pack configuration.');
      return;
    }

    setIsPublishingPack(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/wordpacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packPayload)
      });
      const data = await res.json();
      if (res.ok && data.pack) {
        handleEquipPack(data.pack);
        setShowStudioModal(false);
        loadWorkshopPacks();
      } else {
        // Fallback local creation
        const localPack: WordPack = {
          id: `pack_local_${Date.now()}`,
          title: studioTitle.trim(),
          description: studioDesc.trim(),
          category: studioCategory,
          icon: studioIcon,
          color: '#38bdf8',
          difficulty: studioDifficulty,
          tags: studioTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
          words: rawSanitized,
          author: username || 'Community Typer',
          isOfficial: false,
          likesCount: 1,
          playsCount: 0,
          createdAt: new Date().toISOString()
        };
        handleEquipPack(localPack);
        setShowStudioModal(false);
      }
    } catch (e) {
      setStudioError('Network error saving pack.');
    } finally {
      setIsPublishingPack(false);
    }
  };

  const handleExportPack = (pack: WordPack) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pack, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${pack.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_wordpack.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportPackJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.title) setStudioTitle(parsed.title);
        if (parsed.description) setStudioDesc(parsed.description);
        if (parsed.category) setStudioCategory(parsed.category);
        if (parsed.icon) setStudioIcon(parsed.icon);
        if (parsed.difficulty) setStudioDifficulty(parsed.difficulty);
        if (parsed.tags && Array.isArray(parsed.tags)) setStudioTags(parsed.tags.join(', '));
        if (parsed.words && Array.isArray(parsed.words)) setStudioRawWords(parsed.words.join('\n'));
      } catch (err) {
        setStudioError('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  // --- Keyboard Heatmap & Ergonomics Actions --- //

  const startWeaknessDrill = (keys: string[]) => {
    const drillWords = generateWeaknessDrillWords(keys, 30);
    const drillPack: WordPack = {
      id: `drill_${Date.now()}`,
      title: `🎯 Weakness Drill (${keys.map(k => k.toUpperCase()).join(', ')})`,
      description: `Targeted precision drill for problem keys: ${keys.map(k => k.toUpperCase()).join(', ')}`,
      category: 'literature',
      icon: '🎯',
      color: '#ef4444',
      difficulty: 'intermediate',
      tags: ['drill', 'weakness', 'ergonomics'],
      words: drillWords,
      author: 'Ergonomics AI',
      isOfficial: false,
      likesCount: 0,
      playsCount: 0,
      createdAt: new Date().toISOString()
    };

    handleEquipPack(drillPack);
    setShowHeatmapModal(false);
    playSinglePlayer();
  };

  const resetKeyboardTelemetry = () => {
    if (confirm('Are you sure you want to reset all keyboard ergonomics and accuracy telemetry?')) {
      setLifetimeKeyTelemetry({});
      localStorage.removeItem('typeclash_keyboard_telemetry');
    }
  };

  const createRoom = () => {

    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCurrentRoom(randomId);
    setWaitingForOpponent(true);
    socketRef.current?.emit('join_room', { 
      roomId: randomId, 
      duration: matchDuration, 
      userId, 
      username, 
      mods,
      customWords: equippedWordPack?.words,
      wordPackTitle: equippedWordPack?.title
    });
  };


  const joinRoom = () => {
    if (roomCode.trim() !== '') {
      setCurrentRoom(roomCode.toUpperCase());
      setWaitingForOpponent(true);
      socketRef.current?.emit('join_room', { roomId: roomCode.toUpperCase(), userId, username });
    }
  };

  const playSinglePlayer = () => {
    setIsDaily(false);
    setDailySeed(null);
    setIsSinglePlayer(true);
    setIsPlaying(true);
    setPlayerMetrics(null);
    setMatchHistory([]);
    setGameState(prev => ({...prev, isGameOver: false}));
    if (engineRef.current) {
      engineRef.current.setWordPack(equippedWordPack);
      engineRef.current.start(Math.random().toString(), matchDuration * 1000, mods);
    }
  };


  const playDailyRun = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/daily`);
      const data = await res.json();
      setDailySeed(data.seed);
      setIsDaily(true);
      setMatchDuration(60);
      setMods({ includeNumbers: true, includePunctuation: true, longestWords: false });
      
      setIsSinglePlayer(true);
      setIsPlaying(true);
      setPlayerMetrics(null);
      setMatchHistory([]);
      setGameState(prev => ({...prev, isGameOver: false}));
      
      engineRef.current?.start(data.seed, 60000, { includeNumbers: true, includePunctuation: true, longestWords: false });
    } catch (e) {
      console.error(e);
    }
  };

  const findMatch = () => {
    socketRef.current?.emit('find_match', { duration: matchDuration, userId, username, mods });
  };

  const cancelMatch = () => {
    socketRef.current?.emit('cancel_match');
    setIsSearchingAuto(false);
  };

  const returnToMenu = () => {
    soundEngineRef.current?.startMenuBGM();
    setIsPlaying(false);
    setIsSinglePlayer(false);
    setCurrentRoom('');
    setRoomCode('');
    setWaitingForOpponent(false);
            setWaitingForResult(false);
    setIsSearchingAuto(false);
    setPlayerMetrics(null);
    setMatchHistory([]);
        setGameState(prev => ({...prev, isGameOver: false}));
    if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.connect();
    }
  };

  return (
    <div className={styles.container} style={{ background: THEMES[customization.theme]?.background || THEMES.dark.background, transition: 'background 0.5s ease', fontFamily: customization.fontFamily }}>
      {/* Mobile Warning */}
      {isMobile && !dismissedMobileWarning && (
        <div className={styles.overlay} style={{ zIndex: 100 }}>
          <div className={styles.multiplayerBox} style={{ maxWidth: '90%', textAlign: 'center' }}>
            <h2 className={styles.title} style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Mobile Detected</h2>
            <p style={{ fontSize: '1.2rem', marginBottom: '2rem', lineHeight: '1.5', color: '#e2e8f0' }}>
              TypeClash is a fast-paced competitive typing game that requires a <strong>physical keyboard</strong> to play. Mobile touch-keyboards will not activate during gameplay. If you are on a tablet or phone, please connect a Bluetooth keyboard for the best experience!
            </p>
            <button className={styles.btn} onClick={() => setDismissedMobileWarning(true)}>Continue Anyway</button>
          </div>
        </div>
      )}

      {/* HUD overlay */}
      <AnimatePresence>
      {(isPlaying || gameState.isGameOver) && (
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className={styles.hud}
          style={{ position: 'relative' }}
        >
          {activePowerUp && (
            <div className={styles.statPanel} style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', borderColor: '#fbbf24', background: 'rgba(251, 191, 36, 0.15)', boxShadow: '0 0 15px rgba(251, 191, 36, 0.2)' }}>
              <div className={styles.statItem}>
                <div className={styles.statHeader} style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FontAwesomeIcon icon={faFire} className={styles.iconPulse} />
                  Power-Up Ready
                </div>
                <div className={styles.statValue} style={{ fontSize: '1.2rem', color: '#fbbf24' }}>
                  {activePowerUp.toUpperCase()} [ENTER]
                </div>
              </div>
            </div>
          )}

          <div className={styles.statPanel}>
            <div className={styles.statItem}>
              <div className={styles.statHeader}><FontAwesomeIcon icon={faBullseye} style={{ fontSize: 16 }} /> Score</div>
              <motion.div key={gameState.score} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={styles.statValue}>
                {gameState.score}
              </motion.div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statHeader}><FontAwesomeIcon icon={faClock} style={{ fontSize: 16 }} /> Time</div>
              <motion.div 
                animate={gameState.timeLeft <= 10 ? { scale: [1, 1.1, 1], color: ['#f8fafc', '#ef4444', '#f8fafc'] } : {}}
                transition={{ repeat: gameState.timeLeft <= 10 ? Infinity : 0, duration: 0.5 }}
                className={styles.statValue} style={{ color: gameState.timeLeft <= 10 ? '#ef4444' : '#f8fafc' }}>
                {gameState.timeLeft}s
              </motion.div>
            </div>
            {hudSettings.showWpm && playerMetrics && (
              <div className={styles.statItem}>
                <div className={styles.statHeader}><FontAwesomeIcon icon={faBolt} style={{ fontSize: 16, color: '#38bdf8' }} /> WPM</div>
                <div className={styles.statValue} style={{ color: '#38bdf8' }}>{playerMetrics.wpm}</div>
              </div>
            )}
            {hudSettings.showAccuracy && playerMetrics && (
              <div className={styles.statItem}>
                <div className={styles.statHeader}><FontAwesomeIcon icon={faChartLine} style={{ fontSize: 16, color: '#4ade80' }} /> Acc</div>
                <div className={styles.statValue} style={{ color: '#4ade80' }}>{playerMetrics.accuracy}%</div>
              </div>
            )}
            {currentRoom && (
              <div className={styles.statItem}>
                <div className={styles.statHeader}><FontAwesomeIcon icon={faKey} style={{ fontSize: 16 }} /> Room</div>
                <div className={styles.statValue}>{currentRoom}</div>
              </div>
            )}
          </div>
          
          <div className={styles.statPanel}>
            {hudSettings.showCombo && (
              <div className={styles.statItem} style={{ color: gameState.combo > 5 ? '#fcd34d' : 'inherit' }}>
                <div className={styles.statHeader} style={{ color: gameState.combo > 5 ? '#fde68a' : '#94a3b8' }}><FontAwesomeIcon icon={faFire} style={{ fontSize: 16 }} /> Combo</div>
                <motion.div key={gameState.combo} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={styles.statValue} style={{ color: gameState.combo > 5 ? '#fcd34d' : '#f8fafc' }}>
                  x{gameState.combo}
                </motion.div>
              </div>
            )}
            <div className={styles.statItem}>
              <div className={styles.statHeader}><FontAwesomeIcon icon={faHeart} style={{ fontSize: 16 }} /> Lives</div>
              <div className={styles.statValue} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <AnimatePresence>
                  {Array.from({ length: Math.max(0, gameState.lives) }).map((_, i) => (
                    <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <FontAwesomeIcon icon={faHeart} style={{ fontSize: 24, color: "#ef4444" }} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Opponents Sidebar for FFA */}
      {!isSinglePlayer && (isPlaying || gameState.isGameOver) && Object.keys(opponents).length > 0 && (
        <div style={{ position: 'absolute', right: 20, top: 100, width: 280, background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 15, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 10, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FontAwesomeIcon icon={faBolt} style={{ fontSize: 18 }} /> Opponents
          </h3>
          <div className={styles.noScrollbar} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto' }}>
            {Object.values(opponents).sort((a,b) => {
               if (a.isDead && !b.isDead) return 1;
               if (!a.isDead && b.isDead) return -1;
               return (b.metrics?.wpm || 0) - (a.metrics?.wpm || 0);
            }).map((opp, idx) => {
              const oppRating = opp.rating || 1200;
              const badge = getTierBadge(oppRating);
              return (
                <div key={idx} style={{ padding: 10, background: opp.isDead ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: 5, border: opp.isDead ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', marginBottom: opp.isDead ? 0 : 5 }}>
                    <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: opp.isDead ? 'line-through' : 'none' }}>
                      {opp.username}
                      <span className={styles.tierBadge} style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.65rem', padding: '1px 6px' }}>
                        {oppRating}
                      </span>
                    </span>
                    {opp.isDead ? (
                      <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Rank {opp.rank}</span>
                    ) : (
                      <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{opp.metrics?.wpm || 0} WPM</span>
                    )}
                  </div>
                  {!opp.isDead && (
                     <div style={{ display: 'flex', gap: '4px' }}>
                       {Array.from({ length: Math.max(0, opp.metrics?.lives ?? 3) }).map((_, i) => (
                         <FontAwesomeIcon key={i} icon={faHeart} style={{ fontSize: 14, color: "#ef4444" }} />
                       ))}
                     </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Game Canvas */}
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* Floating On-Screen Power-Up Activator */}
      {isPlaying && activePowerUp && (
        <button 
          onClick={() => engineRef.current?.usePowerUp()}
          className={styles.btn}
          style={{
            position: 'absolute',
            bottom: isMobile ? '80px' : '30px',
            right: '20px',
            zIndex: 40,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            boxShadow: '0 0 25px rgba(245, 158, 11, 0.7)',
            padding: '14px 24px',
            fontSize: '1.1rem',
            borderRadius: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '2px solid #fef08a',
            cursor: 'pointer'
          }}
        >
          <FontAwesomeIcon icon={faFire} className={styles.iconPulse} />
          Activate {activePowerUp.toUpperCase()}!
        </button>
      )}

      {/* Mobile Touch Keyboard Focus Bar */}
      {isMobile && isPlaying && (
        <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: '92%', maxWidth: '450px' }}>
          <input
            ref={mobileInputRef}
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val.length > 0) {
                const lastChar = val[val.length - 1];
                engineRef.current?.processKeyInput(lastChar);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                engineRef.current?.usePowerUp();
              }
            }}
            placeholder="⌨️ Tap here to open mobile keyboard & type..."
            className={styles.input}
            style={{ 
              width: '100%', 
              textAlign: 'center', 
              background: 'rgba(15, 23, 42, 0.9)', 
              border: '2px solid #38bdf8', 
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
              fontSize: '1rem',
              padding: '12px 16px'
            }}
          />
        </div>
      )}

      {/* Login Screens */}
      {!userId && (
        <div className={styles.overlay}>
          <h1 className={styles.title}>TypeClash</h1>

          <div className={styles.multiplayerBox} style={{ width: '400px' }}>
            
            {authMode === 'SELECT' && (

              <>
                <h3 className={styles.subtitle}>Welcome</h3>
                <button className={styles.btn} style={{width: '100%', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #3b82f6, #2563eb)'}} onClick={() => setAuthMode('GUEST')}>Play as Guest</button>
                <button className={styles.btn} style={{width: '100%', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)'}} onClick={() => setAuthMode('LOGIN')}>Log In</button>
                <button className={styles.btn} style={{width: '100%', marginBottom: '0.75rem', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)'}} onClick={() => setAuthMode('REGISTER')}>Create Account</button>
                
                <div className={styles.orDivider} style={{ marginBottom: '0.75rem' }}>or continue with</div>

                <button 
                  className={styles.btn} 
                  style={{
                    width: '100%', 
                    background: '#ffffff', 
                    color: '#1f2937', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '10px',
                    fontWeight: '600'
                  }} 
                  onClick={() => handleOAuthLogin('google')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Sign in with Google
                </button>
              </>
            )}

            {authMode === 'GUEST' && (
              <>
                <h3 className={styles.subtitle}>Guest Player</h3>
                <input 
                  type="text" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Guest Username"
                  value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isAuthLoading && handleAuth('/api/auth/guest')}
                  disabled={isAuthLoading}
                />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem', opacity: isAuthLoading ? 0.7 : 1}} disabled={isAuthLoading} onClick={() => handleAuth('/api/auth/guest')}>
                  {isAuthLoading ? <div className={styles.loader} style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 'Start'}
                </button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} disabled={isAuthLoading} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

            {authMode === 'LOGIN' && (
              <>
                <h3 className={styles.subtitle}>Log In</h3>
                <input type="text" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isAuthLoading} />
                <input type="password" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isAuthLoading && handleAuth('/api/auth/login')} disabled={isAuthLoading} />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem', opacity: isAuthLoading ? 0.7 : 1}} disabled={isAuthLoading} onClick={() => handleAuth('/api/auth/login')}>
                  {isAuthLoading ? <div className={styles.loader} style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 'Log In'}
                </button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} disabled={isAuthLoading} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

            {authMode === 'REGISTER' && (
              <>
                <h3 className={styles.subtitle}>Create Account</h3>
                <input type="text" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isAuthLoading} />
                <input type="password" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isAuthLoading && handleAuth('/api/auth/register')} disabled={isAuthLoading} />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem', opacity: isAuthLoading ? 0.7 : 1}} disabled={isAuthLoading} onClick={() => handleAuth('/api/auth/register')}>
                  {isAuthLoading ? <div className={styles.loader} style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 'Register'}
                </button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} disabled={isAuthLoading} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

          </div>
        </div>
      )}

      {/* Main Menu */}
      {userId && !isPlaying && !gameState.isGameOver && !waitingForOpponent && !showLeaderboard && !showHowToPlay && !showProfile && (
        <div className={styles.overlay}>
          <div className={styles.navBar}>
            <div className={styles.navBrand}>TypeClash</div>
            <div className={styles.navControls}>
              <div className={styles.navUserInfo}>
                <FontAwesomeIcon icon={faUser} style={{ fontSize: 18 }} />
                <span style={{ fontWeight: 'bold' }}>{username}</span>
                {userTitle && <span style={{ fontSize: '0.75rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{userTitle}</span>}
                {isGuest ? (
                  <span style={{ fontSize: '0.8rem', color: '#fcd34d' }}>(Guest)</span>
                ) : (
                  <span 
                    className={styles.tierBadge} 
                    style={{ 
                      color: getTierBadge(userRating).color, 
                      background: getTierBadge(userRating).bg, 
                      border: `1px solid ${getTierBadge(userRating).border}` 
                    }}
                  >
                    <FontAwesomeIcon icon={getTierBadge(userRating).icon} style={{ fontSize: 11 }} />
                    {userRating} {userTier}
                  </span>
                )}
              </div>
              <button onClick={loadProfile} className={styles.navBtn}>
                <FontAwesomeIcon icon={faChartSimple} style={{ fontSize: 16 }} /> Profile
              </button>
              <button onClick={() => { loadWorkshopPacks(); setShowWorkshopModal(true); }} className={styles.navBtn}>
                <FontAwesomeIcon icon={faBox} style={{ fontSize: 16, color: '#38bdf8' }} /> Word Packs
              </button>
              <button onClick={() => setShowHeatmapModal(true)} className={styles.navBtn}>
                <FontAwesomeIcon icon={faKeyboard} style={{ fontSize: 16, color: '#f59e0b' }} /> Heatmap
              </button>
              <button onClick={() => setShowHowToPlay(true)} className={styles.navBtn}>


                <FontAwesomeIcon icon={faBookOpen} style={{ fontSize: 16 }} /> How to Play
              </button>
              <button onClick={() => setIsMuted(!isMuted)} className={styles.navBtn}>
                {isMuted ? <FontAwesomeIcon icon={faVolumeXmark} style={{ fontSize: 16 }} /> : <FontAwesomeIcon icon={faVolumeHigh} style={{ fontSize: 16 }} />} Sound
              </button>
              <button onClick={() => setShowLogoutConfirm(true)} className={styles.navBtn}>
                <FontAwesomeIcon icon={faRightFromBracket} style={{ fontSize: 16 }} /> Logout
              </button>
            </div>
          </div>


          <h1 className={styles.title} style={{ marginBottom: '1rem' }}>TypeClash</h1>
          
          <div className={styles.menuGrid}>
            {/* Left Column: Settings & Account */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <div className={styles.multiplayerBox} style={{ width: '100%', margin: 0, padding: '1.5rem' }}>
                <h3 className={styles.subtitle}>Match Duration</h3>
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 30 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(30)}>30s</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 60 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(60)}>1m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 180 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(180)}>3m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 300 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(300)}>5m</button>
                </div>
              </div>

              <div className={styles.multiplayerBox} style={{ width: '100%', margin: 0, padding: '1.5rem' }}>
                <h3 className={styles.subtitle} style={{ fontSize: '1.5rem' }}>Special Mods</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                  <label className={`${styles.toggleLabel} ${mods.includeNumbers ? styles.toggleLabelActive : ''}`}>
                    <input type="checkbox" checked={mods.includeNumbers} onChange={(e) => setMods({...mods, includeNumbers: e.target.checked})} style={{ display: 'none' }} />
                    <div className={`${styles.toggleTrack} ${mods.includeNumbers ? styles.toggleTrackActive : ''}`}>
                      <div className={`${styles.toggleThumb} ${mods.includeNumbers ? styles.toggleThumbActive : ''}`}></div>
                    </div>
                    Numbers
                  </label>
                  
                  <label className={`${styles.toggleLabel} ${mods.includePunctuation ? styles.toggleLabelActive : ''}`}>
                    <input type="checkbox" checked={mods.includePunctuation} onChange={(e) => setMods({...mods, includePunctuation: e.target.checked})} style={{ display: 'none' }} />
                    <div className={`${styles.toggleTrack} ${mods.includePunctuation ? styles.toggleTrackActive : ''}`}>
                      <div className={`${styles.toggleThumb} ${mods.includePunctuation ? styles.toggleThumbActive : ''}`}></div>
                    </div>
                    Punctuation
                  </label>
                  
                  <label className={`${styles.toggleLabel} ${mods.longestWords ? styles.toggleLabelActive : ''}`}>
                    <input type="checkbox" checked={mods.longestWords} onChange={(e) => setMods({...mods, longestWords: e.target.checked})} style={{ display: 'none' }} />
                    <div className={`${styles.toggleTrack} ${mods.longestWords ? styles.toggleTrackActive : ''}`}>
                      <div className={`${styles.toggleThumb} ${mods.longestWords ? styles.toggleThumbActive : ''}`}></div>
                    </div>
                    Long Words
                  </label>
                </div>
              </div>

              {isGuest && (
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%' }}>
                  <p style={{ color: '#fcd34d', marginBottom: '0.5rem', fontWeight: 'bold' }}>Playing as Guest</p>
                  <p style={{ fontSize: '0.85rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Create an account or connect Google to permanently preserve your Elo rating & match history!</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                    <button className={styles.btnSmall} onClick={() => { setAuthMode('REGISTER'); setUserId(null); }}>Upgrade with Password</button>
                    <button className={styles.btnSmall} style={{ background: '#ffffff', color: '#1f2937', fontWeight: '600' }} onClick={() => handleOAuthLogin('google')}>Connect Google Account</button>
                  </div>
                </div>
              )}
            </div>


            {/* Right Column: Game Modes & Multiplayer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <div className={styles.multiplayerBox} style={{ width: '100%', margin: 0, padding: '1.5rem' }}>
                <h3 className={styles.subtitle}>Multiplayer</h3>
                <button className={styles.btn} style={{ width: '100%', marginTop: '0', marginBottom: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1.2rem', padding: '12px' }} onClick={findMatch}>Find Match (Auto)</button>
                <div className={styles.orDivider} style={{ marginBottom: '1rem' }}>or play privately</div>
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginBottom: '1rem' }}>
                  <button className={styles.btnSmall} style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={createRoom}>Create Room</button>
                </div>
                <div className={styles.inputGroup} style={{ width: '100%' }}>
                  <input 
                    type="text" 
                    className={styles.input} 
                    style={{ flex: 1 }}
                    placeholder="Room Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  />
                  <button className={styles.btnSmall} onClick={joinRoom}>Join</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', width: '100%', marginBottom: '0.8rem' }}>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px' }} onClick={playSinglePlayer}>Play Solo</button>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={playDailyRun}>Daily Run</button>
              </div>

              {/* Equipped Word Pack Active Banner */}
              {equippedWordPack && (
                <div style={{
                  width: '100%',
                  marginBottom: '0.8rem',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid #38bdf8',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{equippedWordPack.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.95rem' }}>
                        {equippedWordPack.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Active Custom Pack ({equippedWordPack.words?.length || 0} words)
                      </div>
                    </div>
                  </div>
                  <button 
                    className={styles.btnSmall}
                    style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#fca5a5' }}
                    onClick={() => handleEquipPack(null)}
                  >
                    Reset
                  </button>
                </div>
              )}

              <button 
                className={styles.btn} 
                style={{ 
                  width: '100%', 
                  marginTop: 0, 
                  marginBottom: '0.8rem',
                  fontSize: '1.2rem', 
                  padding: '12px', 
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  border: '1px solid #38bdf8',
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }} 
                onClick={() => { loadWorkshopPacks(); setShowWorkshopModal(true); }}
              >
                <FontAwesomeIcon icon={faBox} style={{ color: '#bae6fd' }} />
                <span>Word Pack Studio & Workshop</span>
              </button>

              <button 
                className={styles.btn} 
                style={{ 
                  width: '100%', 
                  marginTop: 0, 
                  marginBottom: '0.8rem',
                  fontSize: '1.2rem', 
                  padding: '12px', 
                  background: 'linear-gradient(135deg, #d97706, #b45309)',
                  border: '1px solid #f59e0b',
                  boxShadow: '0 0 16px rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }} 
                onClick={() => setShowHeatmapModal(true)}
              >
                <FontAwesomeIcon icon={faKeyboard} style={{ color: '#fde68a' }} />
                <span>Keyboard Heatmap & Ergonomics</span>
              </button>


              <button 
                className={styles.btn} 
                style={{ 
                  width: '100%', 
                  marginTop: 0, 
                  marginBottom: '0.8rem',
                  fontSize: '1.25rem', 
                  padding: '13px', 
                  background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                  border: '1px solid #f87171',
                  boxShadow: '0 0 20px rgba(220, 38, 38, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }} 
                onClick={() => setShowBossModal(true)}
              >
                <FontAwesomeIcon icon={faSkull} className={styles.iconPulse} style={{ color: '#fca5a5' }} />
                <span>Boss Rush & Raids</span>
              </button>

              <button className={styles.btn} style={{ width: '100%', marginTop: 0, fontSize: '1.2rem', padding: '12px', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)' }} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Leaderboard</button>

            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && !isPlaying && (
        <div className={styles.overlay}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>Leaderboards</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '1rem', width: '100%' }}>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'RANKED' ? styles.btnSmallActive : ''}`} onClick={() => loadLeaderboard('RANKED', leaderboardMode, matchDuration)}>
                <FontAwesomeIcon icon={faTrophy} style={{ marginRight: '4px', color: '#fbbf24' }} /> Ranked
              </button>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'GLOBAL' ? styles.btnSmallActive : ''}`} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Global</button>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'RAIDS' ? styles.btnSmallActive : ''}`} onClick={() => loadLeaderboard('RAIDS', leaderboardMode, matchDuration, 'all')}>
                <FontAwesomeIcon icon={faSkull} style={{ marginRight: '4px', color: '#f87171' }} /> Raids
              </button>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'PERSONAL' ? styles.btnSmallActive : ''}`} onClick={() => loadLeaderboard('PERSONAL', leaderboardMode, matchDuration)}>History</button>
            </div>

            {leaderboardTab === 'RAIDS' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', width: '100%' }}>
                {['all', 'ignis', 'glitch', 'chronos'].map(bId => (
                  <button 
                    key={bId}
                    className={styles.btnSmall}
                    style={{ flex: 1, textTransform: 'capitalize', background: activeBossLeaderboardTab === bId ? '#dc2626' : 'rgba(255,255,255,0.08)' }}
                    onClick={() => loadLeaderboard('RAIDS', leaderboardMode, matchDuration, bId)}
                  >
                    {bId === 'all' ? 'All Bosses' : BOSSES[bId]?.name.split(',')[0]}
                  </button>
                ))}
              </div>
            )}

            {leaderboardTab !== 'RANKED' && leaderboardTab !== 'RAIDS' && (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', width: '100%', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>Mode:</span>
                  <select 
                    className={styles.input} 
                    style={{ flex: 1, background: 'rgba(0,0,0,0.8)' }}
                    value={leaderboardMode}
                    onChange={(e) => loadLeaderboard(leaderboardTab, e.target.value, matchDuration)}
                  >
                    <option value="vanilla">Vanilla (Standard)</option>
                    <option value="numbers">Numbers Only</option>
                    <option value="punctuation">Punctuation Only</option>
                    <option value="numbers_punctuation">Numbers + Punctuation</option>
                    <option value="long_words">Long Words</option>
                    <option value="numbers_long_words">Numbers + Long Words</option>
                    <option value="punctuation_long_words">Punctuation + Long Words</option>
                    <option value="numbers_punctuation_long_words">All Mods (Chaotic)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', width: '100%' }}>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 30 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 30)}>30s</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 60 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 60)}>1m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 180 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 180)}>3m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, padding: '10px 5px', background: matchDuration === 300 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 300)}>5m</button>
                </div>
              </>
            )}

            {leaderboardTab === 'RANKED' && (
              <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '8px', padding: '10px', marginBottom: '1.5rem', textAlign: 'center', color: '#fef3c7', fontSize: '0.9rem' }}>
                Competitive Ranked Standings across all PvP matches. Play matchmaking to climb the tiers!
              </div>
            )}
            
            <div className={styles.noScrollbar} style={{ overflowY: 'auto', width: '100%', paddingRight: '10px', marginBottom: '1rem' }}>
              <table className={styles.table}>
                <thead>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.2)'}}>
                    <th style={{padding: '10px'}}>Rank</th>
                    <th style={{padding: '10px'}}>{leaderboardTab === 'PERSONAL' ? 'Date' : leaderboardTab === 'RAIDS' ? 'Boss / Party' : 'Player'}</th>
                    {leaderboardTab === 'RANKED' ? (
                      <>
                        <th style={{padding: '10px'}}>Tier</th>
                        <th style={{padding: '10px'}}>Rating</th>
                        <th style={{padding: '10px'}}>Record</th>
                      </>
                    ) : leaderboardTab === 'RAIDS' ? (
                      <>
                        <th style={{padding: '10px'}}>Difficulty</th>
                        <th style={{padding: '10px'}}>Clear Time</th>
                        <th style={{padding: '10px'}}>Team DMG</th>
                      </>
                    ) : (
                      <>
                        <th style={{padding: '10px'}}>Score</th>
                        <th style={{padding: '10px'}}>Max Combo</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLeaderboardLoading ? (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.spinner}></div>
                      </td>
                    </tr>
                  ) : leaderboardTab === 'RAIDS' ? (
                    raidLeaderboardData.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No raid records yet! Defeat a boss to enter the Hall of Fame.</td></tr>
                    ) : (
                      raidLeaderboardData.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: idx === 0 ? '#fcd34d' : '#fff' }}>#{idx + 1}</td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ fontWeight: 'bold', color: '#fca5a5' }}>{row.bossName}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                              {row.partyMembers?.map((m: any) => m.username).join(', ')}
                            </div>
                          </td>
                          <td style={{ padding: '10px', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 'bold', color: row.difficulty === 'mythic' ? '#c084fc' : row.difficulty === 'heroic' ? '#fb923c' : '#4ade80' }}>
                            {row.difficulty}
                          </td>
                          <td style={{ padding: '10px', color: '#38bdf8', fontWeight: 'bold' }}>{row.clearTimeSeconds}s</td>
                          <td style={{ padding: '10px', color: '#4ade80', fontWeight: 'bold' }}>{row.totalTeamDamage?.toLocaleString()}</td>
                        </tr>
                      ))
                    )
                  ) : leaderboardData.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{textAlign: 'center', padding: '20px'}}>No records found!</td>
                    </tr>
                  ) : (
                    leaderboardData.map((row, idx) => {

                      if (leaderboardTab === 'RANKED') {
                        const badge = getTierBadge(row.rating);
                        const totalGames = (row.wins || 0) + (row.losses || 0);
                        const winRate = totalGames > 0 ? Math.round(((row.wins || 0) / totalGames) * 100) : 0;
                        return (
                          <tr key={idx} style={{background: row.username === username ? 'rgba(59, 130, 246, 0.2)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent') }}>
                            <td style={{padding: '10px', fontWeight: 'bold', color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#d97706' : '#fff'}}>
                              {idx < 3 && <FontAwesomeIcon icon={faTrophy} style={{ fontSize: 13, marginRight: "5px" }} />}
                              {idx + 1}
                            </td>
                            <td style={{padding: '10px', fontWeight: 'bold'}}>{row.username}</td>
                            <td style={{padding: '10px'}}>
                              <span className={styles.tierBadge} style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.75rem', padding: '2px 8px' }}>
                                <FontAwesomeIcon icon={badge.icon} style={{ fontSize: 10 }} /> {badge.name}
                              </span>
                            </td>
                            <td style={{padding: '10px', fontWeight: 'bold', color: '#4ade80'}}>{row.rating}</td>
                            <td style={{padding: '10px', fontSize: '0.85rem', color: '#cbd5e1'}}>
                              {row.wins || 0}W - {row.losses || 0}L ({winRate}%)
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={idx} style={{background: idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'}}>
                          <td style={{padding: '10px'}}>{idx + 1}</td>
                          <td style={{padding: '10px'}}>{leaderboardTab === 'PERSONAL' ? new Date(row.date).toLocaleDateString() : row.username}</td>
                          <td style={{padding: '10px', fontWeight: 'bold', color: '#4ade80'}}>{row.score}</td>
                          <td style={{padding: '10px'}}>{row.maxCombo}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <button className={styles.btn} style={{ alignSelf: 'center' }} onClick={() => setShowLeaderboard(false)}>Back to Menu</button>
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className={styles.overlay}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>How to Play</h2>
            
            <div style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <FontAwesomeIcon icon={faChartLine} style={{ fontSize: 24, color: "#4ade80" }} /> <h3 style={{ color: '#4ade80', margin: 0 }}>The Basics</h3>
              </div>
              <p style={{ marginBottom: '1.5rem' }}>Words will fall from the top of the screen. Type them correctly before they hit the bottom! You have exactly <strong>3 lives</strong>.</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <FontAwesomeIcon icon={faFire} style={{ fontSize: 24, color: "#fcd34d" }} /> <h3 style={{ color: '#fcd34d', margin: 0 }}>Combos & Power-Ups</h3>
              </div>
              <p style={{ marginBottom: '1.5rem' }}>Typing words flawlessly builds your combo multiplier. Catch glowing <strong>Golden Words</strong> to store game-changing Power-Ups (Nuke, Freeze, Scramble) and press <strong>[ENTER]</strong> to trigger them!</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <FontAwesomeIcon icon={faBolt} style={{ fontSize: 24, color: "#f87171" }} /> <h3 style={{ color: '#f87171', margin: 0 }}>Multiplayer Garbage & Elo</h3>
              </div>
              <p style={{ marginBottom: '1.5rem' }}>In competitive multiplayer matches, every <strong>5-Combo streak</strong> hurls chunks of junk words to overwhelm your opponents. Outlast them to gain <strong>Elo Rating</strong> and climb from Bronze to Grandmaster!</p>
            </div>

            <button className={styles.btn} onClick={() => setShowHowToPlay(false)}>Understood!</button>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && profileData && !isPlaying && (
        <div className={styles.overlay}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '2.5rem', marginBottom: '0.5rem'}}>{profileData.username}'s Profile</h2>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '1.1rem' }}>Joined: {new Date(profileData.joinedDate).toLocaleDateString()}</p>
            
            {/* Competitive Tier Showcase Card */}
            {(() => {
              const rating = profileData.rating ?? userRating;
              const badge = getTierBadge(rating);
              const totalMatches = (profileData.wins || 0) + (profileData.losses || 0);
              const winRate = totalMatches > 0 ? Math.round(((profileData.wins || 0) / totalMatches) * 100) : 0;
              return (
                <div style={{
                  background: `linear-gradient(135deg, ${badge.bg}, rgba(15, 23, 42, 0.8))`,
                  border: `2px solid ${badge.border}`,
                  boxShadow: `0 0 25px ${badge.bg}`,
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: badge.bg,
                      border: `2px solid ${badge.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      color: badge.color
                    }}>
                      <FontAwesomeIcon icon={badge.icon} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.6rem', fontWeight: '900', color: badge.color, letterSpacing: '-0.5px' }}>
                        {badge.name} Tier
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
                        {rating} Elo Rating
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4ade80' }}>
                      {profileData.wins || 0}W - {profileData.losses || 0}L
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                      {winRate}% Competitive Win Rate
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', marginBottom: '2rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.2rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#60a5fa' }}>{profileData.totalGamesPlayed}</div>
                <div style={{ fontSize: '0.95rem', color: '#9ca3af', marginTop: '0.3rem' }}>Total Games</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.2rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#f87171' }}>{profileData.totalPvPGames}</div>
                <div style={{ fontSize: '0.95rem', color: '#9ca3af', marginTop: '0.3rem' }}>PvP Matches</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.2rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#fcd34d' }}>x{profileData.maxCombo}</div>
                <div style={{ fontSize: '0.95rem', color: '#9ca3af', marginTop: '0.3rem' }}>Max Combo</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.2rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#4ade80' }}>{profileData.personalBestScore}</div>
                <div style={{ fontSize: '0.95rem', color: '#9ca3af', marginTop: '0.3rem' }}>Personal Best</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.2rem', borderRadius: '8px', textAlign: 'center', gridColumn: 'span 2', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#c084fc' }}>{profileData.totalGamesPlayed > 0 ? Math.round((profileData.gamesSurvived / profileData.totalGamesPlayed) * 100) : 0}%</div>
                <div style={{ fontSize: '1rem', color: '#9ca3af', marginTop: '0.3rem' }}>Overall Survival Rate</div>
              </div>
            </div>

            {/* Score Progression Graph */}
            <div style={{ width: '100%', marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: '#e2e8f0' }}>Score Progression</h3>
              
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <select 
                  className={styles.input} 
                  style={{ flex: 1, background: 'rgba(0,0,0,0.8)' }}
                  value={chartDuration}
                  onChange={(e) => loadChartData(Number(e.target.value), chartMode)}
                >
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={180}>3m</option>
                  <option value={300}>5m</option>
                </select>

                <select 
                  className={styles.input} 
                  style={{ flex: 2, background: 'rgba(0,0,0,0.8)' }}
                  value={chartMode}
                  onChange={(e) => loadChartData(chartDuration, e.target.value)}
                >
                  <option value="vanilla">Vanilla (Standard)</option>
                  <option value="numbers">Numbers Only</option>
                  <option value="punctuation">Punctuation Only</option>
                  <option value="numbers_punctuation">Numbers + Punctuation</option>
                  <option value="long_words">Long Words</option>
                  <option value="numbers_long_words">Numbers + Long Words</option>
                  <option value="punctuation_long_words">Punctuation + Long Words</option>
                  <option value="numbers_punctuation_long_words">All Mods (Chaotic)</option>
                </select>
              </div>

              {chartData.length > 0 ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid #3b82f6', borderRadius: '8px' }}
                        itemStyle={{ color: '#60a5fa', fontWeight: 'bold' }}
                        labelStyle={{ color: '#9ca3af', marginBottom: '5px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#60a5fa" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }} 
                        activeDot={{ r: 6, fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>
                  No games played with these settings yet.
                </div>
              )}
            </div>

            {/* Customization & Settings Section */}
            <div style={{ width: '100%', marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '1.4rem', marginBottom: '1.2rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FontAwesomeIcon icon={faPalette} style={{ color: '#38bdf8' }} /> Themes & Appearance
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Visual Theme (9 Styles)</label>
                  <select 
                    className={styles.input} 
                    style={{ width: '100%', background: 'rgba(0,0,0,0.8)' }}
                    value={customization.theme}
                    onChange={(e) => updateCustomization(e.target.value, customization.fontFamily, userTitle, hudSettings)}
                  >
                    {Object.values(THEMES).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Font Family</label>
                  <select 
                    className={styles.input} 
                    style={{ width: '100%', background: 'rgba(0,0,0,0.8)', fontFamily: customization.fontFamily }}
                    value={customization.fontFamily}
                    onChange={(e) => updateCustomization(customization.theme, e.target.value, userTitle, hudSettings)}
                  >
                    {FONTS.map(f => (
                      <option key={f.id} value={f.id} style={{ fontFamily: f.id }}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unlockable Player Titles */}
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FontAwesomeIcon icon={faCrown} /> Equipped Player Title
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {PLAYER_TITLES.map((title) => {
                  const isUnlocked = title.unlocked(profileData, profileData.rating ?? userRating);
                  const isEquipped = userTitle === title.name;
                  return (
                    <button
                      key={title.id}
                      disabled={!isUnlocked}
                      onClick={() => updateCustomization(customization.theme, customization.fontFamily, title.name, hudSettings)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: isEquipped ? '2px solid #38bdf8' : isUnlocked ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.05)',
                        background: isEquipped ? 'rgba(56, 189, 248, 0.2)' : isUnlocked ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.4)',
                        color: isUnlocked ? '#f8fafc' : '#64748b',
                        cursor: isUnlocked ? 'pointer' : 'not-allowed',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        <span>{title.name}</span>
                        {isEquipped ? (
                          <FontAwesomeIcon icon={faCheck} style={{ color: '#38bdf8', fontSize: '12px' }} />
                        ) : !isUnlocked ? (
                          <FontAwesomeIcon icon={faLock} style={{ color: '#64748b', fontSize: '12px' }} />
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: isUnlocked ? '#94a3b8' : '#475569' }}>
                        {title.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Audio Controls */}
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FontAwesomeIcon icon={faMusic} /> Audio Mixing & Volume
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <span>BGM Volume</span>
                    <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{Math.round(hudSettings.bgmVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={1} 
                    step={0.05} 
                    value={hudSettings.bgmVolume} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const nextHud = { ...hudSettings, bgmVolume: val };
                      updateCustomization(customization.theme, customization.fontFamily, userTitle, nextHud);
                    }} 
                    style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <span>SFX Volume</span>
                    <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{Math.round(hudSettings.sfxVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={1} 
                    step={0.05} 
                    value={hudSettings.sfxVolume} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const nextHud = { ...hudSettings, sfxVolume: val };
                      updateCustomization(customization.theme, customization.fontFamily, userTitle, nextHud);
                    }} 
                    style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* HUD Settings */}
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.8rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FontAwesomeIcon icon={faSliders} /> Gameplay HUD Indicators
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                <label className={`${styles.toggleLabel} ${hudSettings.showWpm ? styles.toggleLabelActive : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={hudSettings.showWpm} 
                    onChange={(e) => {
                      const nextHud = { ...hudSettings, showWpm: e.target.checked };
                      updateCustomization(customization.theme, customization.fontFamily, userTitle, nextHud);
                    }} 
                    style={{ display: 'none' }} 
                  />
                  <div className={`${styles.toggleTrack} ${hudSettings.showWpm ? styles.toggleTrackActive : ''}`}>
                    <div className={`${styles.toggleThumb} ${hudSettings.showWpm ? styles.toggleThumbActive : ''}`}></div>
                  </div>
                  Live WPM
                </label>

                <label className={`${styles.toggleLabel} ${hudSettings.showAccuracy ? styles.toggleLabelActive : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={hudSettings.showAccuracy} 
                    onChange={(e) => {
                      const nextHud = { ...hudSettings, showAccuracy: e.target.checked };
                      updateCustomization(customization.theme, customization.fontFamily, userTitle, nextHud);
                    }} 
                    style={{ display: 'none' }} 
                  />
                  <div className={`${styles.toggleTrack} ${hudSettings.showAccuracy ? styles.toggleTrackActive : ''}`}>
                    <div className={`${styles.toggleThumb} ${hudSettings.showAccuracy ? styles.toggleThumbActive : ''}`}></div>
                  </div>
                  Live Accuracy
                </label>

                <label className={`${styles.toggleLabel} ${hudSettings.showCombo ? styles.toggleLabelActive : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={hudSettings.showCombo} 
                    onChange={(e) => {
                      const nextHud = { ...hudSettings, showCombo: e.target.checked };
                      updateCustomization(customization.theme, customization.fontFamily, userTitle, nextHud);
                    }} 
                    style={{ display: 'none' }} 
                  />
                  <div className={`${styles.toggleTrack} ${hudSettings.showCombo ? styles.toggleTrackActive : ''}`}>
                    <div className={`${styles.toggleThumb} ${hudSettings.showCombo ? styles.toggleThumbActive : ''}`}></div>
                  </div>
                  Combo Streak
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button 
                className={styles.btn} 
                style={{ flex: 1, background: 'linear-gradient(135deg, #d97706, #b45309)', border: '1px solid #f59e0b' }} 
                onClick={() => { setShowProfile(false); setShowHeatmapModal(true); }}
              >
                <FontAwesomeIcon icon={faKeyboard} style={{ marginRight: '8px' }} /> View Keyboard Heatmap & Ergonomics
              </button>
              <button className={styles.btnSmall} style={{ padding: '0 20px', background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowProfile(false)}>Close</button>
            </div>


          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className={styles.overlay} style={{ zIndex: 100 }}>
          <div className={styles.multiplayerBox} style={{ width: '90%', maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
            <h2 className={styles.title} style={{fontSize: '2rem', marginBottom: '1rem'}}>Confirm Logout</h2>
            <p style={{ color: '#e2e8f0', marginBottom: '2rem', fontSize: '1.2rem' }}>Are you sure you want to log out?</p>
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button 
                className={styles.btnSmall} 
                style={{ flex: 1, padding: '12px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5' }} 
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
              >
                Yes, Logout
              </button>
              <button 
                className={styles.btnSmall} 
                style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.1)' }} 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Heatmap & Finger Ergonomics Modal */}
      {showHeatmapModal && !isPlaying && (
        <div className={styles.overlay} style={{ zIndex: 115 }}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '94%', maxWidth: '1020px', maxHeight: '90vh', overflowY: 'auto', padding: '1.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
              <div>
                <h2 className={styles.title} style={{ fontSize: '2.4rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FontAwesomeIcon icon={faKeyboard} style={{ color: '#f59e0b' }} /> Keyboard Heatmap & Ergonomics
                </h2>
                <p className={styles.scoreText} style={{ margin: '4px 0 0 0', fontSize: '0.9rem', textAlign: 'left' }}>
                  Real-time per-key telemetry, mechanical heatmaps, hand load distribution, and targeted weakness drills.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className={styles.btnSmall}
                  style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '0.8rem' }}
                  onClick={resetKeyboardTelemetry}
                  title="Reset all recorded keystroke telemetry"
                >
                  <FontAwesomeIcon icon={faRotateRight} /> Reset Data
                </button>
              </div>
            </div>

            {/* Controls Bar: Metric Selector + Layout Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
              {/* Metric Selector Tabs */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  className={`${styles.btnSmall} ${heatmapMetric === 'frequency' ? styles.btnSmallActive : ''}`}
                  onClick={() => setHeatmapMetric('frequency')}
                >
                  🔥 Keystroke Heat
                </button>
                <button 
                  className={`${styles.btnSmall} ${heatmapMetric === 'accuracy' ? styles.btnSmallActive : ''}`}
                  onClick={() => setHeatmapMetric('accuracy')}
                >
                  🎯 Accuracy Hotspots
                </button>
                <button 
                  className={`${styles.btnSmall} ${heatmapMetric === 'latency' ? styles.btnSmallActive : ''}`}
                  onClick={() => setHeatmapMetric('latency')}
                >
                  ⚡ Key Dwell Latency
                </button>
              </div>

              {/* Layout Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Layout:</span>
                <select 
                  className={styles.input} 
                  style={{ width: '160px', padding: '6px 10px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.8)' }}
                  value={heatmapLayout}
                  onChange={(e) => setHeatmapLayout(e.target.value as KeyboardLayoutId)}
                >
                  <option value="qwerty">QWERTY</option>
                  <option value="dvorak">Dvorak</option>
                  <option value="colemak">Colemak</option>
                </select>
              </div>
            </div>

            {/* Mechanical Keyboard Heatmap Visualizer */}
            {(() => {
              const currentLayout = KEYBOARD_LAYOUTS[heatmapLayout] || KEYBOARD_LAYOUTS.qwerty;
              const maxKeystrokes = Math.max(1, ...Object.values(lifetimeKeyTelemetry).map(s => s.count || 0));

              return (
                <div className={styles.keyboardCase} style={{ marginBottom: '1.5rem' }}>
                  {currentLayout.rows.map((row, rowIdx) => (
                    <div key={rowIdx} className={styles.keyboardRow}>
                      {row.keys.map((keyDef, keyIdx) => {
                        const stat = lifetimeKeyTelemetry[keyDef.code.toLowerCase()];
                        const heatColors = getKeyHeatColor(stat, heatmapMetric, maxKeystrokes);
                        const fingerColor = FINGERS[keyDef.finger]?.color || '#38bdf8';
                        const keyWidthPx = keyDef.width ? Math.round(keyDef.width * 48) : 46;

                        return (
                          <div
                            key={keyIdx}
                            className={styles.keycap}
                            onClick={() => setSelectedKeyDetail(stat ? { ...stat, key: keyDef.code } : { key: keyDef.code, count: 0, errors: 0, totalLatencyMs: 0, avgLatencyMs: 0, accuracy: 100 })}
                            style={{
                              width: `${keyWidthPx}px`,
                              background: heatColors.bg,
                              border: `1px solid ${heatColors.border}`,
                              boxShadow: heatColors.glow !== 'none' ? `${heatColors.glow}, inset 0 1px 0 rgba(255,255,255,0.2)` : '0 4px 6px rgba(0, 0, 0, 0.3)',
                              color: heatColors.text
                            }}
                            title={`${keyDef.label} (Finger: ${FINGERS[keyDef.finger]?.name}) • ${stat ? `${stat.count} hits | ${stat.accuracy}% acc | ${stat.avgLatencyMs}ms` : 'No data yet'}`}
                          >
                            <span style={{ fontSize: keyDef.label.length > 2 ? '0.72rem' : '0.95rem' }}>
                              {keyDef.label}
                            </span>
                            
                            {/* Metric Value Label on Keycap */}
                            {stat && stat.count > 0 && (
                              <span className={styles.keycapSubLabel}>
                                {heatmapMetric === 'frequency' && `${stat.count}`}
                                {heatmapMetric === 'accuracy' && `${stat.accuracy}%`}
                                {heatmapMetric === 'latency' && `${stat.avgLatencyMs}ms`}
                              </span>
                            )}

                            {/* Finger Indicator Dot */}
                            <span className={styles.keycapFingerDot} style={{ backgroundColor: fingerColor }} />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Selected Key Detail Inspection Card */}
            {selectedKeyDetail && (
              <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid #38bdf8', borderRadius: '10px', padding: '12px 16px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', background: '#0284c7', color: '#fff', width: '48px', height: '48px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedKeyDetail.key.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '1rem' }}>
                      Key Telemetry Dossier: "{selectedKeyDetail.key.toUpperCase()}"
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {selectedKeyDetail.count} Total Keystrokes • {selectedKeyDetail.errors} Miskeys ({Math.round(selectedKeyDetail.count > 0 ? (selectedKeyDetail.errors / selectedKeyDetail.count) * 100 : 0)}% Error Rate)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Accuracy</div>
                    <div style={{ fontWeight: 'bold', color: selectedKeyDetail.accuracy >= 95 ? '#4ade80' : '#f87171', fontSize: '1.1rem' }}>
                      {selectedKeyDetail.accuracy}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Avg Latency</div>
                    <div style={{ fontWeight: 'bold', color: '#fbbf24', fontSize: '1.1rem' }}>
                      {selectedKeyDetail.avgLatencyMs} ms
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Hand Ergonomics & Finger Load Breakdown */}
            {(() => {
              const balance = calculateHandBalance(lifetimeKeyTelemetry, KEYBOARD_LAYOUTS[heatmapLayout]);
              const bottlenecks = identifyBottlenecks(lifetimeKeyTelemetry, KEYBOARD_LAYOUTS[heatmapLayout], 5);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.5rem' }}>
                  {/* Hand Balance Card */}
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#38bdf8', display: 'flex', justifyContent: 'space-between' }}>
                      <span>⚖️ Hand Load Balance</span>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{balance.totalKeystrokes.toLocaleString()} Total Hits</span>
                    </h4>

                    {/* Dual Hand Bar */}
                    <div style={{ display: 'flex', height: '14px', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ width: `${balance.leftHandPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.4s' }} />
                      <div style={{ width: `${balance.rightHandPct}%`, background: 'linear-gradient(90deg, #a855f7, #c084fc)', transition: 'width 0.4s' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1.2rem' }}>
                      <span style={{ color: '#60a5fa' }}>✋ Left Hand: {balance.leftHandPct}%</span>
                      <span style={{ color: '#c084fc' }}>🤚 Right Hand: {balance.rightHandPct}%</span>
                    </div>

                    {/* 5 Finger Workload Breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(Object.keys(balance.fingerLoads) as FingerId[]).filter(f => f !== 'TH').map((fingerId) => {
                        const info = FINGERS[fingerId];
                        const load = balance.fingerLoads[fingerId];
                        return (
                          <div key={fingerId} style={{ display: 'grid', gridTemplateColumns: '95px 1fr 40px', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                            <span style={{ color: info.color }}>{info.name}</span>
                            <div className={styles.fingerProgressTrack}>
                              <div className={styles.fingerProgressBar} style={{ width: `${Math.min(100, load.percentage * 3)}%`, backgroundColor: info.color }} />
                            </div>
                            <span style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 'bold' }}>{load.percentage}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottleneck Keys & Weakness Drill Card */}
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#f87171', display: 'flex', justifyContent: 'space-between' }}>
                        <span>⚠️ Bottleneck & Problem Keys</span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>High Error & Latency</span>
                      </h4>

                      {bottlenecks.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
                          {bottlenecks.map((bn, idx) => (
                            <div key={idx} className={styles.bottleneckBadge} style={{ justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '1.1rem', color: '#fff', background: 'rgba(239, 68, 68, 0.4)', padding: '2px 8px', borderRadius: '4px' }}>
                                  {bn.key.toUpperCase()}
                                </strong>
                                <span style={{ fontSize: '0.8rem' }}>({FINGERS[bn.finger]?.name})</span>
                              </div>
                              <div style={{ fontSize: '0.75rem', display: 'flex', gap: '10px' }}>
                                <span style={{ color: '#fca5a5' }}>{bn.errorRatePct}% errors</span>
                                <span style={{ color: '#fcd34d' }}>{bn.avgLatencyMs}ms</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#4ade80', fontSize: '0.9rem' }}>
                          ✓ Outstanding precision! No significant typing bottlenecks detected yet.
                        </div>
                      )}
                    </div>

                    {/* Practice Drill Launcher */}
                    <button 
                      className={styles.btn} 
                      style={{ width: '100%', marginTop: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1rem', padding: '12px' }}
                      onClick={() => startWeaknessDrill(bottlenecks.map(b => b.key))}
                    >
                      <FontAwesomeIcon icon={faBullseye} style={{ marginRight: '8px' }} />
                      <span>Practice Targeted Weakness Drill</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            <button 
              className={styles.btn} 
              style={{ width: '100%', background: 'rgba(255,255,255,0.1)' }} 
              onClick={() => setShowHeatmapModal(false)}
            >
              Close Heatmap
            </button>
          </div>
        </div>
      )}


      {/* Live In-Game Co-Op Raid Party Meter */}
      {isPlaying && isCoopRaidMode && raidTeamStats.length > 0 && (
        <div className={styles.raidDpsMeter}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '4px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FontAwesomeIcon icon={faSkull} /> Raid Party ({raidTeamStats.filter(p => !p.isDead).length}/{raidTeamStats.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Live DPS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {raidTeamStats.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', opacity: p.isDead ? 0.5 : 1 }}>
                <span style={{ color: p.isDead ? '#ef4444' : p.id === socketRef.current?.id ? '#38bdf8' : '#e2e8f0', fontWeight: p.id === socketRef.current?.id ? 'bold' : 'normal' }}>
                  {p.isDead ? '💀 ' : '⚔️ '}{p.username}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{p.damageDealt?.toLocaleString()} DMG</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{p.wpm || 0} WPM</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Word Pack Community Workshop Modal */}
      {showWorkshopModal && !isPlaying && (
        <div className={styles.overlay}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '92%', maxWidth: '960px', maxHeight: '88vh', overflowY: 'auto', padding: '1.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
              <div>
                <h2 className={styles.title} style={{ fontSize: '2.4rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FontAwesomeIcon icon={faBox} style={{ color: '#38bdf8' }} /> Word Pack Workshop
                </h2>
                <p className={styles.scoreText} style={{ margin: '4px 0 0 0', fontSize: '0.9rem', textAlign: 'left' }}>
                  Explore, play, and build custom themed vocabularies across coding, science, literature, gaming, and anime.
                </p>
              </div>
              <button 
                className={styles.btnSmall}
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 'bold', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}
                onClick={() => {
                  setStudioTitle('');
                  setStudioDesc('');
                  setStudioCategory('coding');
                  setStudioIcon('💻');
                  setStudioDifficulty('intermediate');
                  setStudioTags('');
                  setStudioRawWords('');
                  setStudioError('');
                  setShowStudioModal(true);
                }}
              >
                <FontAwesomeIcon icon={faPlus} />
                <span>Create New Pack</span>
              </button>
            </div>

            {/* Search, Filter & Sort Controls */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <input 
                  type="text" 
                  className={styles.input} 
                  placeholder="Search packs by title, topic, or tag..." 
                  style={{ width: '100%', paddingLeft: '36px' }}
                  value={workshopSearch}
                  onChange={(e) => {
                    setWorkshopSearch(e.target.value);
                    loadWorkshopPacks(workshopCategory, e.target.value, workshopSort);
                  }}
                />
                <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>

              <select 
                className={styles.input} 
                style={{ width: '180px', background: 'rgba(0,0,0,0.8)' }}
                value={workshopSort}
                onChange={(e) => {
                  setWorkshopSort(e.target.value);
                  loadWorkshopPacks(workshopCategory, workshopSearch, e.target.value);
                }}
              >
                <option value="popular">🔥 Most Popular</option>
                <option value="likes">❤️ Highest Rated</option>
                <option value="newest">✨ Newest First</option>
              </select>
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '1.5rem', width: '100%' }} className={styles.noScrollbar}>
              <div 
                className={`${styles.packCategoryPill} ${workshopCategory === 'all' ? styles.packCategoryPillActive : ''}`}
                onClick={() => { setWorkshopCategory('all'); loadWorkshopPacks('all', workshopSearch, workshopSort); }}
              >
                🌐 All Categories
              </div>
              {WORD_PACK_CATEGORIES.map(cat => (
                <div 
                  key={cat.id} 
                  className={`${styles.packCategoryPill} ${workshopCategory === cat.id ? styles.packCategoryPillActive : ''}`}
                  onClick={() => { setWorkshopCategory(cat.id); loadWorkshopPacks(cat.id, workshopSearch, workshopSort); }}
                >
                  <span>{cat.icon}</span> {cat.name}
                </div>
              ))}
            </div>

            {/* Word Pack Cards Grid */}
            {isWorkshopLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                <div className={styles.loader}></div>
                <p style={{ color: '#94a3b8', marginTop: '1rem' }}>Loading word packs...</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem', width: '100%', marginBottom: '1.5rem' }}>
                {workshopPacks.map((pack) => {
                  const isEquipped = equippedWordPack?.id === pack.id || equippedWordPack?.title === pack.title;
                  const isLiked = likedPackIds.has(pack.id);
                  return (
                    <div 
                      key={pack.id} 
                      className={`${styles.wordPackCard} ${isEquipped ? styles.wordPackCardEquipped : ''}`}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.8rem' }}>{pack.icon}</span>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 'bold' }}>{pack.title}</h4>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>By {pack.author}</span>
                            </div>
                          </div>
                          {pack.isOfficial && (
                            <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                              OFFICIAL
                            </span>
                          )}
                        </div>

                        <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.4', margin: '6px 0 10px 0' }}>
                          {pack.description}
                        </p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                          {pack.tags?.slice(0, 4).map((t, idx) => (
                            <span key={idx} style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px' }}>
                              #{t}
                            </span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
                          <span>📦 {pack.words?.length || 0} Words</span>
                          <span style={{ textTransform: 'capitalize', color: pack.difficulty === 'expert' ? '#f87171' : pack.difficulty === 'intermediate' ? '#fbbf24' : '#4ade80' }}>
                            ● {pack.difficulty}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                          className={styles.btnSmall}
                          style={{
                            flex: 1,
                            padding: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            background: isEquipped ? 'rgba(56, 189, 248, 0.2)' : 'linear-gradient(135deg, #0284c7, #0369a1)',
                            border: isEquipped ? '1px solid #38bdf8' : 'none',
                            color: isEquipped ? '#38bdf8' : '#fff'
                          }}
                          onClick={() => handleEquipPack(pack)}
                        >
                          {isEquipped ? '✓ Equipped' : '⚡ Equip Pack'}
                        </button>

                        <button 
                          className={styles.btnSmall}
                          style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                          title="Preview Words"
                          onClick={() => setPreviewPack(pack)}
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button 
                          className={styles.btnSmall}
                          style={{ padding: '8px 10px', background: isLiked ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.08)', color: isLiked ? '#f43f5e' : '#cbd5e1' }}
                          title="Like Pack"
                          onClick={() => handleLikePack(pack.id)}
                        >
                          <FontAwesomeIcon icon={faThumbsUp} /> {pack.likesCount || 0}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button 
              className={styles.btn} 
              style={{ width: '100%', background: 'rgba(255,255,255,0.1)' }} 
              onClick={() => setShowWorkshopModal(false)}
            >
              Close Workshop
            </button>
          </div>
        </div>
      )}

      {/* Word Pack Preview Modal */}
      {previewPack && (
        <div className={styles.overlay} style={{ zIndex: 120 }}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '650px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>{previewPack.icon}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#f8fafc' }}>{previewPack.title}</h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Created by {previewPack.author} • {previewPack.words?.length || 0} Total Words</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1.2rem' }}>{previewPack.description}</p>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {previewPack.words?.map((w, idx) => (
                  <span key={idx} className={styles.wordChip}>
                    {w}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button 
                className={styles.btn} 
                style={{ flex: 1, background: 'linear-gradient(135deg, #0284c7, #0369a1)' }}
                onClick={() => {
                  handleEquipPack(previewPack);
                  setPreviewPack(null);
                }}
              >
                {equippedWordPack?.id === previewPack.id ? '✓ Already Equipped' : '⚡ Equip & Play'}
              </button>
              <button 
                className={styles.btnSmall}
                style={{ padding: '0 16px', background: 'rgba(255,255,255,0.1)' }}
                onClick={() => handleExportPack(previewPack)}
                title="Export as JSON"
              >
                <FontAwesomeIcon icon={faDownload} /> JSON
              </button>
              <button 
                className={styles.btnSmall}
                style={{ padding: '0 16px', background: 'rgba(255,255,255,0.08)' }}
                onClick={() => setPreviewPack(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Word Pack Studio Creator Modal */}
      {showStudioModal && !isPlaying && (
        <div className={styles.overlay} style={{ zIndex: 110 }}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '92%', maxWidth: '850px', maxHeight: '88vh', overflowY: 'auto', padding: '1.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
              <div>
                <h2 className={styles.title} style={{ fontSize: '2.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FontAwesomeIcon icon={faPlus} style={{ color: '#10b981' }} /> Word Pack Studio
                </h2>
                <p className={styles.scoreText} style={{ margin: '4px 0 0 0', fontSize: '0.85rem', textAlign: 'left' }}>
                  Design custom vocabulary dictionaries, validate character sets, and test run your words.
                </p>
              </div>

              <label className={styles.btnSmall} style={{ background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FontAwesomeIcon icon={faUpload} /> Import JSON
                <input type="file" accept=".json" onChange={handleImportPackJson} style={{ display: 'none' }} />
              </label>
            </div>

            {studioError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                ⚠️ {studioError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.2rem' }}>
              {/* Metadata Inputs */}
              <div className={styles.studioSection}>
                <h4 style={{ margin: '0 0 4px 0', color: '#38bdf8', fontSize: '0.95rem' }}>1. Pack Dossier</h4>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Pack Title</label>
                  <input 
                    type="text" 
                    className={styles.studioInput} 
                    placeholder="e.g. JavaScript & React Mastery" 
                    value={studioTitle}
                    onChange={(e) => setStudioTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Description</label>
                  <input 
                    type="text" 
                    className={styles.studioInput} 
                    placeholder="Brief description of the pack topic..." 
                    value={studioDesc}
                    onChange={(e) => setStudioDesc(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Category</label>
                    <select 
                      className={styles.studioInput}
                      value={studioCategory}
                      onChange={(e) => setStudioCategory(e.target.value as WordPackCategory)}
                    >
                      {WORD_PACK_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Difficulty</label>
                    <select 
                      className={styles.studioInput}
                      value={studioDifficulty}
                      onChange={(e) => setStudioDifficulty(e.target.value as WordPackDifficulty)}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Icon</label>
                    <select 
                      className={styles.studioInput}
                      value={studioIcon}
                      onChange={(e) => setStudioIcon(e.target.value)}
                      style={{ fontSize: '1.2rem' }}
                    >
                      <option value="💻">💻</option>
                      <option value="🐍">🐍</option>
                      <option value="🧬">🧬</option>
                      <option value="📚">📚</option>
                      <option value="🌌">🌌</option>
                      <option value="🌸">🌸</option>
                      <option value="⚔️">⚔️</option>
                      <option value="🎯">🎯</option>
                      <option value="🔥">🔥</option>
                      <option value="⚡">⚡</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Tags (comma-separated)</label>
                    <input 
                      type="text" 
                      className={styles.studioInput} 
                      placeholder="code, react, javascript" 
                      value={studioTags}
                      onChange={(e) => setStudioTags(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Bulk Word Importer & Sanitizer */}
              <div className={styles.studioSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: '#38bdf8', fontSize: '0.95rem' }}>2. Vocabulary Corpus</h4>
                  {(() => {
                    const clean = sanitizeWords(studioRawWords);
                    const isValid = clean.length >= 10;
                    return (
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isValid ? '#4ade80' : '#f87171' }}>
                        {clean.length} / 10 words {isValid ? '✓ (Valid)' : '(Need 10+)'}
                      </span>
                    );
                  })()}
                </div>

                <textarea 
                  className={styles.studioTextarea}
                  placeholder="Paste or type words here. Separate by commas, newlines, or spaces...&#10;&#10;async, await, promise, closure, middleware, component, typescript..."
                  value={studioRawWords}
                  onChange={(e) => setStudioRawWords(e.target.value)}
                />

                <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: '1.3' }}>
                  * Duplicate words and illegal symbols are sanitized automatically.
                </div>
              </div>
            </div>

            {/* Interactive Live Typing Sandbox Simulator */}
            {(() => {
              const cleanWords = sanitizeWords(studioRawWords);
              if (cleanWords.length >= 3) {
                const currentSandboxWord = cleanWords[sandboxIndex % cleanWords.length];
                return (
                  <div className={styles.sandboxBox} style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#38bdf8' }}>
                        🧪 Interactive Pack Sandbox Simulator
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Progress: {sandboxIndex + 1} / {cleanWords.length} Words | Score: {sandboxScore}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fcd34d', margin: '8px 0', letterSpacing: '2px', fontFamily: 'monospace' }}>
                      {currentSandboxWord}
                    </div>

                    <input 
                      type="text" 
                      className={styles.studioInput}
                      style={{ maxWidth: '300px', textAlign: 'center', fontSize: '1.1rem', borderColor: '#38bdf8' }}
                      placeholder="Type the word above to test..."
                      value={sandboxInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSandboxInput(val);
                        if (val.trim().toLowerCase() === currentSandboxWord.toLowerCase()) {
                          setSandboxScore(prev => prev + 100);
                          setSandboxInput('');
                          setSandboxIndex(prev => (prev + 1) % cleanWords.length);
                        }
                      }}
                    />
                  </div>
                );
              }
              return null;
            })()}

            {/* Studio Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button 
                className={styles.btn} 
                style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1rem', padding: '12px' }}
                disabled={isPublishingPack}
                onClick={() => handleSaveCustomPack(true)}
              >
                {isPublishingPack ? 'Publishing...' : '🚀 Save & Equip Custom Pack'}
              </button>
              <button 
                className={styles.btnSmall}
                style={{ padding: '0 20px', background: 'rgba(255,255,255,0.08)' }}
                onClick={() => setShowStudioModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boss Selection Modal */}
      {showBossModal && !isPlaying && (
        <div className={styles.overlay}>

          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '850px', maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{ fontSize: '2.6rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <FontAwesomeIcon icon={faSkull} style={{ color: '#ef4444' }} /> Boss Rush & Raids
            </h2>
            <p className={styles.scoreText} style={{ marginBottom: '1.2rem', fontSize: '0.95rem' }}>
              Battle colossal bosses with phase shifts, meteor storms, glitch overrides, and co-op multiplayer.
            </p>

            {/* Boss Dossier Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem', width: '100%' }}>
              {Object.values(BOSSES).map((boss) => {
                const isSelected = selectedBossId === boss.id;
                return (
                  <div
                    key={boss.id}
                    className={`${styles.bossCard} ${isSelected ? styles.bossCardActive : ''}`}
                    onClick={() => setSelectedBossId(boss.id)}
                    style={{
                      borderLeft: `4px solid ${boss.themeColor}`,
                      background: isSelected ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.7)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '1.6rem', marginBottom: '4px' }}>{boss.icon}</div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', color: boss.themeColor }}>{boss.name.split(',')[0]}</h4>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{boss.subtitle}</div>
                      </div>
                      <span className={styles.bossBadge} style={{ background: `${boss.themeColor}33`, color: boss.themeColor }}>
                        {boss.id.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontStyle: 'italic', margin: '4px 0' }}>
                      "{boss.flavorQuote.slice(0, 75)}..."
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Base Health:</span>
                        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{boss.baseHp.toLocaleString()} HP</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Key Spells:</span>
                        <span style={{ color: '#fca5a5' }}>{boss.abilities.map(a => a.name).join(', ')}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Reward Title:</span>
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{boss.titleReward.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Difficulty Selector */}
            <div style={{ width: '100%', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.8rem', color: '#e2e8f0', textAlign: 'center' }}>
                Encounter Difficulty
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                {(['normal', 'heroic', 'mythic'] as BossDifficulty[]).map((diff) => {
                  const diffInfo = BOSS_DIFFICULTIES[diff];
                  const isSelected = selectedDifficulty === diff;
                  return (
                    <button
                      key={diff}
                      className={styles.btnSmall}
                      onClick={() => setSelectedDifficulty(diff)}
                      style={{
                        padding: '10px',
                        background: isSelected ? diffInfo.color : 'rgba(255,255,255,0.06)',
                        color: isSelected ? '#000' : '#fff',
                        fontWeight: 'bold',
                        border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <div>{diffInfo.label}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{diffInfo.hpMultiplier}x HP • {diffInfo.speedMultiplier}x Spd</div>
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Mode Selector (Solo vs Co-Op Raid) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', marginBottom: '1.5rem' }}>
              <button
                className={styles.btnSmall}
                onClick={() => setIsCoopRaidMode(false)}
                style={{
                  padding: '12px',
                  background: !isCoopRaidMode ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                  color: !isCoopRaidMode ? '#000' : '#fff',
                  fontWeight: 'bold',
                  fontSize: '0.95rem'
                }}
              >
                ⚔️ Solo Boss Duel
              </button>
              <button
                className={styles.btnSmall}
                onClick={() => setIsCoopRaidMode(true)}
                style={{
                  padding: '12px',
                  background: isCoopRaidMode ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                  color: isCoopRaidMode ? '#000' : '#fff',
                  fontWeight: 'bold',
                  fontSize: '0.95rem'
                }}
              >
                🛡️ Co-Op Raid (1-4 Players)
              </button>
            </div>

            {/* Launch Actions */}
            {!isCoopRaidMode ? (
              <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                <button
                  className={styles.btn}
                  style={{ flex: 2, background: 'linear-gradient(135deg, #dc2626, #991b1b)', fontSize: '1.2rem', padding: '14px' }}
                  onClick={() => startSoloBossFight(selectedBossId, selectedDifficulty)}
                >
                  ⚔️ Engage {BOSSES[selectedBossId]?.name.split(',')[0]} Solo
                </button>
                <button
                  className={styles.btnSmall}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}
                  onClick={() => setShowBossModal(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    className={styles.btn}
                    style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1.1rem', padding: '12px', marginTop: 0 }}
                    onClick={() => {
                      setShowBossModal(false);
                      createRaidLobby(selectedBossId, selectedDifficulty);
                    }}
                  >
                    🛡️ Create Raid Room
                  </button>
                </div>
                <div className={styles.inputGroup} style={{ width: '100%' }}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter Raid Code (e.g. RAID-A1B2)"
                    value={raidLobbyCodeInput}
                    onChange={(e) => setRaidLobbyCodeInput(e.target.value)}
                  />
                  <button
                    className={styles.btnSmall}
                    onClick={() => {
                      setShowBossModal(false);
                      joinRaidLobby(raidLobbyCodeInput);
                    }}
                  >
                    Join Raid
                  </button>
                </div>
                <button
                  className={styles.btnSmall}
                  style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}
                  onClick={() => setShowBossModal(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Co-Op Raid Party Lobby Modal */}
      {raidLobbyData && !isPlaying && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ width: '90%', maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#f87171' }}>⚔️ {raidLobbyData.bossName}</h3>
                <span className={styles.bossBadge} style={{ background: 'rgba(251, 146, 60, 0.2)', color: '#fb923c' }}>
                  {raidLobbyData.difficulty.toUpperCase()} RAID
                </span>
              </div>
              <button
                className={styles.btnSmall}
                onClick={() => {
                  navigator.clipboard.writeText(raidLobbyData.roomId);
                  alert('Raid Code copied to clipboard: ' + raidLobbyData.roomId);
                }}
                style={{ background: 'rgba(56, 189, 248, 0.2)', border: '1px solid #38bdf8', color: '#38bdf8' }}
              >
                <FontAwesomeIcon icon={faCopy} /> {raidLobbyData.roomId}
              </button>
            </div>

            {/* 4 Party Member Slots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem', width: '100%' }}>
              {[0, 1, 2, 3].map((slotIdx) => {
                const member = raidLobbyData.players[slotIdx];
                if (member) {
                  return (
                    <div key={slotIdx} className={`${styles.raidPartySlot} ${styles.raidPartySlotActive}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={member.isHost ? faCrown : faUser} style={{ color: member.isHost ? '#fbbf24' : '#38bdf8' }} />
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                            {member.username} {member.id === socketRef.current?.id ? '(You)' : ''}
                          </div>
                          <span className={styles.tierBadge} style={{ color: getTierBadge(member.rating).color, background: getTierBadge(member.rating).bg, border: `1px solid ${getTierBadge(member.rating).border}`, fontSize: '0.7rem', padding: '1px 6px' }}>
                            {member.rating} Elo
                          </span>
                        </div>
                      </div>
                      <div>
                        {member.isHost ? (
                          <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.85rem' }}>👑 Raid Leader</span>
                        ) : member.isReady ? (
                          <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '0.85rem' }}>✅ Ready</span>
                        ) : (
                          <span style={{ color: '#fcd34d', fontSize: '0.85rem' }}>⏳ Preparing...</span>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={slotIdx} className={styles.raidPartySlot} style={{ opacity: 0.4 }}>
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Open Slot {slotIdx + 1}</span>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Waiting for raider...</span>
                  </div>
                );
              })}
            </div>

            {/* Raid Party Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
              {raidLobbyData.players.find(p => p.id === socketRef.current?.id)?.isHost ? (
                <button
                  className={styles.btn}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                    fontSize: '1.2rem',
                    padding: '14px',
                    boxShadow: '0 0 20px rgba(220, 38, 38, 0.4)'
                  }}
                  onClick={startRaidMatch}
                >
                  ⚔️ Engage Boss Now!
                </button>
              ) : (
                <button
                  className={styles.btn}
                  style={{
                    width: '100%',
                    background: raidLobbyData.players.find(p => p.id === socketRef.current?.id)?.isReady
                      ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    fontSize: '1.2rem',
                    padding: '14px'
                  }}
                  onClick={toggleRaidReady}
                >
                  {raidLobbyData.players.find(p => p.id === socketRef.current?.id)?.isReady ? '❌ Unready' : '✅ Ready Up'}
                </button>
              )}

              <button
                className={styles.btnSmall}
                style={{ width: '100%', background: 'rgba(255,255,255,0.1)' }}
                onClick={leaveRaidLobby}
              >
                Leave Raid Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boss Defeated Victory Celebration Modal */}
      {bossVictoryData && (
        <div className={styles.overlay} style={{ zIndex: 110 }}>
          <div className={`${styles.multiplayerBox} ${styles.victoryModal}`} style={{ width: '90%', maxWidth: '600px', textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🏆</div>
            <h2 className={styles.title} style={{ fontSize: '2.8rem', color: '#fbbf24', marginBottom: '4px' }}>
              VICTORY!
            </h2>
            <div style={{ fontSize: '1.2rem', color: '#f8fafc', fontWeight: 'bold', marginBottom: '8px' }}>
              {bossVictoryData.boss.name} Defeated!
            </div>
            <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              "{bossVictoryData.boss.defeatQuote}"
            </div>

            {/* Unlocked Reward Title Banner */}
            <div style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid #fbbf24', borderRadius: '10px', padding: '12px', marginBottom: '1.5rem' }}>
              <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.9rem' }}>🎉 TITLE REWARD UNLOCKED</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff', marginTop: '4px' }}>
                {bossVictoryData.boss.titleReward.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#fcd34d' }}>{bossVictoryData.boss.titleReward.description}</div>
            </div>

            {/* Raid Party DPS Rankings or Solo Stats */}
            {bossVictoryData.rankings && bossVictoryData.rankings.length > 0 ? (
              <div style={{ marginBottom: '1.5rem', width: '100%' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#38bdf8', textAlign: 'left' }}>Party Combat Contribution</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {bossVictoryData.rankings.map((r, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px' }}>
                      <span style={{ fontWeight: 'bold', color: idx === 0 ? '#fbbf24' : '#fff' }}>
                        {idx === 0 ? '👑 MVP ' : `#${idx + 1} `}{r.username}
                      </span>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{r.damageDealt?.toLocaleString()} DMG</span>
                        <span style={{ color: '#94a3b8' }}>{r.wpm || 0} WPM</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Damage Dealt</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#4ade80' }}>{bossVictoryData.stats.totalDamage.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Average WPM</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>{bossVictoryData.stats.wpm}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Clear Time</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fbbf24' }}>{bossVictoryData.clearTimeSeconds}s</div>
                </div>
              </div>
            )}

            <button
              className={styles.btn}
              style={{ width: '100%', background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
              onClick={() => {
                setBossVictoryData(null);
                returnToMenu();
              }}
            >
              Return to Menu
            </button>
          </div>
        </div>
      )}

      {/* Boss Defeat / Raid Wipe Modal */}
      {bossDefeatData && (
        <div className={styles.overlay} style={{ zIndex: 110 }}>
          <div className={`${styles.multiplayerBox} ${styles.defeatModal}`} style={{ width: '90%', maxWidth: '500px', textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>💀</div>
            <h2 className={styles.title} style={{ fontSize: '2.8rem', color: '#ef4444', marginBottom: '4px' }}>
              RAID WIPED
            </h2>
            <div style={{ fontSize: '1.2rem', color: '#f8fafc', fontWeight: 'bold', marginBottom: '1rem' }}>
              {bossDefeatData.bossName} proved too powerful!
            </div>
            {bossDefeatData.remainingHp !== undefined && bossDefeatData.maxHp && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px' }}>Boss Remaining Health</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>
                  {bossDefeatData.remainingHp.toLocaleString()} / {bossDefeatData.maxHp.toLocaleString()} HP ({Math.round((bossDefeatData.remainingHp / bossDefeatData.maxHp) * 100)}%)
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button
                className={styles.btn}
                style={{ flex: 1, background: 'linear-gradient(135deg, #dc2626, #991b1b)' }}
                onClick={() => {
                  setBossDefeatData(null);
                  setShowBossModal(true);
                }}
              >
                Try Again
              </button>
              <button
                className={styles.btnSmall}
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}
                onClick={() => {
                  setBossDefeatData(null);
                  returnToMenu();
                }}
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Matchmaking Searching Overlay */}
      {isSearchingAuto && !isPlaying && (

        <div className={styles.overlay}>
          <h2 className={styles.title} style={{ fontSize: '3rem' }}>Finding Match...</h2>
          <p className={styles.scoreText}>Queue: {matchDuration}s Ranked Matches</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {(() => {
              const badge = getTierBadge(userRating);
              return (
                <span className={styles.tierBadge} style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, padding: '6px 14px', fontSize: '0.95rem' }}>
                  <FontAwesomeIcon icon={badge.icon} /> {userRating} {userTier}
                </span>
              );
            })()}
          </div>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '1rem' }}>Matching players within your skill rating range...</p>
          <div className={styles.loader}></div>
          <button className={styles.btn} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }} onClick={cancelMatch}>Cancel Search</button>
        </div>
      )}

      {/* Waiting for Opponent (Private Room) */}
      {waitingForOpponent && !isPlaying && !isSearchingAuto && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ width: '420px' }}>
            <h2 className={styles.title} style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Lobby: {currentRoom}</h2>
            <p className={styles.scoreText} style={{ marginBottom: '1.5rem' }}>Match Time: {matchDuration}s</p>
            
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>Players ({Object.keys(opponents).length + 1}/10)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{username} (You)</strong>
                    <span className={styles.tierBadge} style={{ color: getTierBadge(userRating).color, background: getTierBadge(userRating).bg, border: `1px solid ${getTierBadge(userRating).border}`, fontSize: '0.7rem', padding: '1px 6px' }}>
                      {userRating}
                    </span>
                  </span>
                  {isHost && <span style={{ color: '#fcd34d', fontWeight: 'bold' }}>Host</span>}
                </div>
                {Object.values(opponents).map((opp, idx) => {
                  const oppRating = opp.rating || 1200;
                  const badge = getTierBadge(oppRating);
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{opp.username}</span>
                        <span className={styles.tierBadge} style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.7rem', padding: '1px 6px' }}>
                          {oppRating}
                        </span>
                      </span>
                      {opp.isHost && <span style={{ color: '#fcd34d', fontWeight: 'bold' }}>Host</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {isHost && Object.keys(opponents).length >= 1 ? (
               <button className={styles.btn} style={{ width: '100%', marginBottom: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)' }} onClick={() => socketRef.current?.emit('start_private_match')}>Start Game</button>
            ) : isHost ? (
               <p style={{ color: '#94a3b8', textAlign: 'center', marginBottom: '1rem' }}>Waiting for players to join...</p>
            ) : (
               <p style={{ color: '#94a3b8', textAlign: 'center', marginBottom: '1rem' }}>Waiting for host to start...</p>
            )}

            <button className={styles.btn} style={{ width: '100%', background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }} onClick={returnToMenu}>Leave Lobby</button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.isGameOver && !waitingForResult && (
        <div className={styles.overlay} style={{ zIndex: 100 }}>
          <div className={styles.multiplayerBox} style={{ minWidth: '420px', maxWidth: '600px' }}>
            <h2 className={styles.title} style={{ fontSize: '3rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              {isSinglePlayer ? <><FontAwesomeIcon icon={faChartLine} style={{ fontSize: 40 }} /> Match Complete!</> : (
                 <><FontAwesomeIcon icon={faTrophy} style={{ fontSize: 40 }} /> Match Results</>
              )}
            </h2>
            
            <p className={styles.scoreText} style={{ marginBottom: '1.5rem' }}>
              {gameState.survived ? "You Survived the Time Limit!" : "You were crushed by words."}
            </p>

            {/* Elo Change Banner for Multiplayer */}
            {!isSinglePlayer && eloChanges && socketRef.current?.id && eloChanges[socketRef.current.id] && (
              (() => {
                const elo = eloChanges[socketRef.current!.id];
                const isPos = elo.change > 0;
                const isNeg = elo.change < 0;
                const badge = getTierBadge(elo.newRating);
                return (
                  <div style={{
                    background: isPos ? 'rgba(74, 222, 128, 0.15)' : isNeg ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${isPos ? '#4ade80' : isNeg ? '#f87171' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '10px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '4px' }}>Competitive Rating Update</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      <span>{elo.oldRating}</span>
                      <span>➔</span>
                      <span style={{ color: badge.color }}>{elo.newRating}</span>
                      <span className={isPos ? styles.eloDeltaPositive : isNeg ? styles.eloDeltaNegative : styles.eloDeltaNeutral}>
                        <FontAwesomeIcon icon={isPos ? faArrowUp : isNeg ? faArrowDown : faShieldHalved} />
                        {elo.change > 0 ? `+${elo.change}` : elo.change}
                      </span>
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span className={styles.tierBadge} style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.75rem', padding: '2px 8px' }}>
                        <FontAwesomeIcon icon={badge.icon} style={{ fontSize: 10 }} /> {badge.name} Tier
                      </span>
                    </div>
                  </div>
                );
              })()
            )}

            {isSinglePlayer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', width: '100%', marginBottom: '2rem' }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>Your Stats</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Score:</span> <span style={{ fontWeight: 'bold', color: '#4ade80' }}>{gameState.score}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Max Combo:</span> <span>{gameState.maxCombo}</span></div>
                {playerMetrics && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>WPM:</span> <span style={{ fontWeight: 'bold' }}>{playerMetrics.wpm}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Accuracy:</span> <span>{playerMetrics.accuracy}%</span></div>
                  </>
                )}
              </div>
            ) : (
              finalLeaderboard && (
                <div className={styles.noScrollbar} style={{ width: '100%', marginBottom: '2rem', maxHeight: '40vh', overflowY: 'auto' }}>
                  <table className={styles.table} style={{ width: '100%', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                        <th style={{ padding: '10px' }}>Rank</th>
                        <th style={{ padding: '10px' }}>Player</th>
                        <th style={{ padding: '10px' }}>Score</th>
                        <th style={{ padding: '10px' }}>WPM</th>
                        <th style={{ padding: '10px' }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalLeaderboard.map((row, idx) => {
                        const eloData = eloChanges?.[row.id];
                        const change = eloData?.change ?? 0;
                        return (
                          <tr key={idx} style={{ background: row.username === username ? 'rgba(59, 130, 246, 0.2)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent') }}>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: row.rank === 1 ? '#fcd34d' : '#fff' }}>
                              {row.rank === 1 && <FontAwesomeIcon icon={faTrophy} style={{ fontSize: 14, marginRight: "5px" }} />}
                              {row.rank}
                            </td>
                            <td style={{ padding: '10px', textDecoration: !row.survived ? 'line-through' : 'none' }}>{row.username}</td>
                            <td style={{ padding: '10px', color: '#4ade80', fontWeight: 'bold' }}>{row.score}</td>
                            <td style={{ padding: '10px' }}>{row.metrics?.wpm || 0}</td>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>
                              {eloData ? (
                                <span className={change > 0 ? styles.eloDeltaPositive : change < 0 ? styles.eloDeltaNegative : styles.eloDeltaNeutral}>
                                  {change > 0 ? `+${change}` : change}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {matchHistory.length > 0 && (
              <div style={{ width: '100%', height: 220, marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0', textAlign: 'center' }}>Match Performance (WPM)</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={matchHistory}>
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} tickFormatter={(val) => `${val}s`} />
                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid #3b82f6', borderRadius: '8px' }}
                      itemStyle={{ fontWeight: 'bold' }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '5px' }}
                    />
                    <Line type="monotone" dataKey="p1" name={username || 'You'} stroke="#4ade80" strokeWidth={3} dot={false} />
                    {!isSinglePlayer && <Line type="monotone" dataKey="opponent" name="Top Opponent" stroke="#f87171" strokeWidth={3} dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <button className={styles.btn} style={{ width: '100%' }} onClick={returnToMenu}>Back to Menu</button>
          </div>
        </div>
      )}


      {/* Waiting for Match Result */}
      {waitingForResult && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Finished!</h2>
          <p className={styles.scoreText}>Waiting for opponent to finish...</p>
          <div className={styles.loader}></div>
        </div>
      )}


      {/* Footer */}
      {!isPlaying && !gameState.isGameOver && (
        <div style={{ position: 'absolute', bottom: '1rem', width: '100%', textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af', zIndex: 30 }}>
          <p>© {new Date().getFullYear()} TypeClash. All rights reserved.</p>
          <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/about" style={{ color: '#60a5fa', textDecoration: 'none' }}>About</Link>
            <Link href="/contact" style={{ color: '#60a5fa', textDecoration: 'none' }}>Contact</Link>
            <Link href="/privacy" style={{ color: '#60a5fa', textDecoration: 'none' }}>Privacy</Link>
            <a href="https://github.com/aedriansagap/TypeClash" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>GitHub</a>
          </div>
        </div>
      )}
    </div>
  );
}
