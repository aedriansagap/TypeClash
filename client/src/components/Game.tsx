'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faChartSimple, faBookOpen, faRightFromBracket, faBullseye, faClock, faKey, faFire, faHeart, faTrophy, faChartLine, faBolt, faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';
import { motion, AnimatePresence } from 'framer-motion';
import { GameEngine, GameState } from '@/lib/GameEngine';
import { SoundEngine } from '@/lib/SoundEngine';
import { THEMES, FONTS } from '@/lib/themes';
import styles from './Game.module.css';

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const soundEngineRef = useRef<SoundEngine | null>(null);
  
  // Auth State
  const [authMode, setAuthMode] = useState<'SELECT' | 'GUEST' | 'LOGIN' | 'REGISTER'>('SELECT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
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
  const [opponents, setOpponents] = useState<{ [id: string]: { username: string, isHost?: boolean, metrics?: any, isDead?: boolean, rank?: number, score?: number } }>({});
  const [isHost, setIsHost] = useState(false);
  const [finalLeaderboard, setFinalLeaderboard] = useState<any[] | null>(null);
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
  const [leaderboardTab, setLeaderboardTab] = useState<'GLOBAL' | 'PERSONAL'>('GLOBAL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [customization, setCustomization] = useState({ theme: 'dark', fontFamily: 'Inter' });
  const [isMuted, setIsMuted] = useState(false);
  // Mobile Detection
  const [isMobile, setIsMobile] = useState(false);
  const [dismissedMobileWarning, setDismissedMobileWarning] = useState(false);
  
  // Auto Matchmaking
  const [isSearchingAuto, setIsSearchingAuto] = useState(false);

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
    
    if (savedId && savedName && savedToken) {
      // Very basic client-side token format validation (real validation happens on server)
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
    }
  }, [isSinglePlayer]);

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

      socketRef.current.on('searching_for_match', () => {
        setIsSearchingAuto(true);
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

      socketRef.current.on('match_result', (data: { leaderboard: any[] }) => {
        setWaitingForResult(false);
        setFinalLeaderboard(data.leaderboard);
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
  }, [isSinglePlayer, userId, matchDuration]);

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
        
        alert("Matchmaking timeout: No opponent found. Starting a Single Player match to warm up!");
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

  const handleLogout = () => {
    localStorage.removeItem('typeclash_userid');
    localStorage.removeItem('typeclash_username');
    localStorage.removeItem('typeclash_isguest');
    localStorage.removeItem('typeclash_token');
    localStorage.removeItem('typeclash_customization');
    setUserId(null);
    setUsername('');
    setPassword('');
    setIsGuest(false);
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
      await loadChartData(chartDuration, chartMode);
      setShowProfile(true);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const updateCustomization = async (newTheme: string, newFont: string) => {
    const nextCustomization = { theme: newTheme, fontFamily: newFont };
    setCustomization(nextCustomization);
    localStorage.setItem('typeclash_customization', JSON.stringify(nextCustomization));
    
    if (userId && !isGuest) {
      try {
        await fetch(`${SERVER_URL}/api/profile/customization`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, ...nextCustomization })
        });
      } catch (err) {
        console.error('Failed to update customization on server');
      }
    }
  };

  const loadLeaderboard = async (tab: 'GLOBAL' | 'PERSONAL', mode: string = leaderboardMode, duration: number = matchDuration) => {
    setLeaderboardTab(tab);
    setLeaderboardMode(mode);
    setMatchDuration(duration);
    setIsLeaderboardLoading(true);
    try {
      const url = tab === 'GLOBAL' 
        ? `${SERVER_URL}/api/leaderboard/${duration}/${mode}`
        : `${SERVER_URL}/api/leaderboard/personal/${userId}/${duration}/${mode}`;
        
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

  const createRoom = () => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCurrentRoom(randomId);
    setWaitingForOpponent(true);
    socketRef.current?.emit('join_room', { roomId: randomId, duration: matchDuration, userId, username, mods });
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
    engineRef.current?.start(Math.random().toString(), matchDuration * 1000, mods);
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
            {currentRoom && (
              <div className={styles.statItem}>
                <div className={styles.statHeader}><FontAwesomeIcon icon={faKey} style={{ fontSize: 16 }} /> Room</div>
                <div className={styles.statValue}>{currentRoom}</div>
              </div>
            )}
          </div>
          
          <div className={styles.statPanel}>
            <div className={styles.statItem} style={{ color: gameState.combo > 5 ? '#fcd34d' : 'inherit' }}>
              <div className={styles.statHeader} style={{ color: gameState.combo > 5 ? '#fde68a' : '#94a3b8' }}><FontAwesomeIcon icon={faFire} style={{ fontSize: 16 }} /> Combo</div>
              <motion.div key={gameState.combo} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={styles.statValue} style={{ color: gameState.combo > 5 ? '#fcd34d' : '#f8fafc' }}>
                x{gameState.combo}
              </motion.div>
            </div>
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
            }).map((opp, idx) => (
              <div key={idx} style={{ padding: 10, background: opp.isDead ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: 5, border: opp.isDead ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginBottom: opp.isDead ? 0 : 5 }}>
                  <span style={{ fontWeight: 'bold', textDecoration: opp.isDead ? 'line-through' : 'none' }}>{opp.username}</span>
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
            ))}
          </div>
        </div>
      )}
      
      {/* Game Canvas */}
      <canvas ref={canvasRef} className={styles.canvas} />

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
                <button className={styles.btn} style={{width: '100%', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)'}} onClick={() => setAuthMode('REGISTER')}>Create Account</button>
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
                <FontAwesomeIcon icon={faUser} style={{ fontSize: 18 }} /> {username} {isGuest && <span style={{fontSize: '0.8rem', color: '#fcd34d'}}>(Guest)</span>}
              </div>
              <button onClick={loadProfile} className={styles.navBtn}>
                <FontAwesomeIcon icon={faChartSimple} style={{ fontSize: 16 }} /> Profile
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
                  <p style={{ color: '#fcd34d', marginBottom: '0.5rem' }}>Playing as Guest</p>
                  <p style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '1rem' }}>Create a password to permanently save your scores and profile!</p>
                  <button className={styles.btnSmall} onClick={() => { setAuthMode('REGISTER'); setUserId(null); }}>Upgrade to Account</button>
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

              <div style={{ display: 'flex', gap: '1rem', width: '100%', marginBottom: '1rem' }}>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px' }} onClick={playSinglePlayer}>Play Solo</button>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={playDailyRun}>Daily Run</button>
              </div>
              <button className={styles.btn} style={{ width: '100%', marginTop: 0, fontSize: '1.2rem', padding: '12px', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)' }} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Leaderboard</button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && !isPlaying && (
        <div className={styles.overlay}>
          <div className={`${styles.multiplayerBox} ${styles.noScrollbar}`} style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>Leaderboards</h2>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', width: '100%' }}>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'GLOBAL' ? styles.btnSmallActive : ''}`} style={{ flex: 1 }} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Global Top</button>
              <button className={`${styles.btnSmall} ${leaderboardTab === 'PERSONAL' ? styles.btnSmallActive : ''}`} style={{ flex: 1 }} onClick={() => loadLeaderboard('PERSONAL', leaderboardMode, matchDuration)}>My History</button>
            </div>

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
            
            <div className={styles.noScrollbar} style={{ overflowY: 'auto', width: '100%', paddingRight: '10px', marginBottom: '1rem' }}>
              <table className={styles.table}>
                <thead>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.2)'}}>
                    <th style={{padding: '10px'}}>Rank</th>
                    {leaderboardTab === 'GLOBAL' && <th style={{padding: '10px'}}>Player</th>}
                    <th style={{padding: '10px'}}>Score</th>
                    <th style={{padding: '10px'}}>Max Combo</th>
                  </tr>
                </thead>
                <tbody>
                  {isLeaderboardLoading ? (
                    <tr>
                      <td colSpan={leaderboardTab === 'GLOBAL' ? 4 : 3}>
                        <div className={styles.spinner}></div>
                      </td>
                    </tr>
                  ) : leaderboardData.length === 0 ? (
                    <tr>
                      <td colSpan={leaderboardTab === 'GLOBAL' ? 4 : 3} style={{textAlign: 'center', padding: '20px'}}>No scores yet!</td>
                    </tr>
                  ) : (
                    leaderboardData.map((row, idx) => (
                      <tr key={idx} style={{background: idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'}}>
                        <td style={{padding: '10px'}}>{idx + 1}</td>
                        {leaderboardTab === 'GLOBAL' && <td style={{padding: '10px'}}>{row.username}</td>}
                        <td style={{padding: '10px', fontWeight: 'bold', color: '#4ade80'}}>{row.score}</td>
                        <td style={{padding: '10px'}}>{row.maxCombo}</td>
                      </tr>
                    ))
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
                <FontAwesomeIcon icon={faFire} style={{ fontSize: 24, color: "#fcd34d" }} /> <h3 style={{ color: '#fcd34d', margin: 0 }}>Combos</h3>
              </div>
              <p style={{ marginBottom: '1.5rem' }}>Typing words flawlessly builds your combo multiplier. Making a mistake breaks the combo!</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <FontAwesomeIcon icon={faBolt} style={{ fontSize: 24, color: "#f87171" }} /> <h3 style={{ color: '#f87171', margin: 0 }}>Multiplayer Garbage</h3>
              </div>
              <p style={{ marginBottom: '1.5rem' }}>In multiplayer matches, every time you reach a <strong>Combo of 5</strong>, you instantly send a wave of fast "Garbage Words" to your opponent's screen. Overwhelm them to win!</p>
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
            <p style={{ color: '#9ca3af', marginBottom: '2rem', fontSize: '1.2rem' }}>Joined: {new Date(profileData.joinedDate).toLocaleDateString()}</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', marginBottom: '2rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#60a5fa' }}>{profileData.totalGamesPlayed}</div>
                <div style={{ fontSize: '1rem', color: '#9ca3af', marginTop: '0.5rem' }}>Total Games</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f87171' }}>{profileData.totalPvPGames}</div>
                <div style={{ fontSize: '1rem', color: '#9ca3af', marginTop: '0.5rem' }}>PvP Matches</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fcd34d' }}>x{profileData.maxCombo}</div>
                <div style={{ fontSize: '1rem', color: '#9ca3af', marginTop: '0.5rem' }}>Max Combo</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4ade80' }}>{profileData.personalBestScore}</div>
                <div style={{ fontSize: '1rem', color: '#9ca3af', marginTop: '0.5rem' }}>Personal Best</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', gridColumn: 'span 2', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#c084fc' }}>{profileData.totalGamesPlayed > 0 ? Math.round((profileData.gamesSurvived / profileData.totalGamesPlayed) * 100) : 0}%</div>
                <div style={{ fontSize: '1.1rem', color: '#9ca3af', marginTop: '0.5rem' }}>Overall Survival Rate</div>
              </div>
            </div>

            <div style={{ width: '100%', marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#e2e8f0' }}>Score Progression</h3>
              
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
                <div style={{ width: '100%', height: 300 }}>
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

            {/* Customization Section */}
            <div style={{ width: '100%', marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#e2e8f0' }}>Customization</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Theme</label>
                  <select 
                    className={styles.input} 
                    style={{ width: '100%', background: 'rgba(0,0,0,0.8)' }}
                    value={customization.theme}
                    onChange={(e) => updateCustomization(e.target.value, customization.fontFamily)}
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
                    onChange={(e) => updateCustomization(customization.theme, e.target.value)}
                  >
                    {FONTS.map(f => (
                      <option key={f.id} value={f.id} style={{ fontFamily: f.id }}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button className={styles.btn} onClick={() => setShowProfile(false)}>Close Profile</button>
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

      {/* Auto Matchmaking Searching Overlay */}
      {isSearchingAuto && !isPlaying && (
        <div className={styles.overlay}>
          <h2 className={styles.title} style={{ fontSize: '3rem' }}>Finding Match...</h2>
          <p className={styles.scoreText}>Queue: {matchDuration}s Matches</p>
          <div className={styles.loader}></div>
          <button className={styles.btn} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }} onClick={cancelMatch}>Cancel Search</button>
        </div>
      )}

      {/* Waiting for Opponent (Private Room) */}
      {waitingForOpponent && !isPlaying && !isSearchingAuto && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ width: '400px' }}>
            <h2 className={styles.title} style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Lobby: {currentRoom}</h2>
            <p className={styles.scoreText} style={{ marginBottom: '1.5rem' }}>Match Time: {matchDuration}s</p>
            
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '5px' }}>Players ({Object.keys(opponents).length + 1}/10)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{username} (You)</span> {isHost && <span style={{ color: '#fcd34d' }}>Host</span>}</div>
                {Object.values(opponents).map((opp, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>{opp.username}</span> {opp.isHost && <span style={{ color: '#fcd34d' }}>Host</span>}
                  </div>
                ))}
              </div>
            </div>

            {isHost && Object.keys(opponents).length >= 1 ? (
               <button className={styles.btn} style={{ width: '100%', marginBottom: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)' }} onClick={() => socketRef.current?.emit('start_private_match')}>Start Game</button>
            ) : isHost ? (
               <p style={{ color: '#94a3b8', textAlign: 'center', marginBottom: '1rem' }}>Waiting for players...</p>
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
          <div className={styles.multiplayerBox} style={{ minWidth: '400px' }}>
            <h2 className={styles.title} style={{ fontSize: '3rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              {isSinglePlayer ? <><FontAwesomeIcon icon={faChartLine} style={{ fontSize: 40 }} /> Match Complete!</> : (
                 <><FontAwesomeIcon icon={faTrophy} style={{ fontSize: 40 }} /> Match Results</>
              )}
            </h2>
            
            <p className={styles.scoreText} style={{ marginBottom: '2rem' }}>
              {gameState.survived ? "You Survived the Time Limit!" : "You were crushed by words."}
            </p>

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
                      </tr>
                    </thead>
                    <tbody>
                      {finalLeaderboard.map((row, idx) => (
                        <tr key={idx} style={{ background: row.username === username ? 'rgba(59, 130, 246, 0.2)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent') }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: row.rank === 1 ? '#fcd34d' : '#fff' }}>
                            {row.rank === 1 && <FontAwesomeIcon icon={faTrophy} style={{ fontSize: 14, marginRight: "5px" }} />}
                            {row.rank}
                          </td>
                          <td style={{ padding: '10px', textDecoration: !row.survived ? 'line-through' : 'none' }}>{row.username}</td>
                          <td style={{ padding: '10px', color: '#4ade80', fontWeight: 'bold' }}>{row.score}</td>
                          <td style={{ padding: '10px' }}>{row.metrics?.wpm || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {matchHistory.length > 0 && (
              <div style={{ width: '100%', height: 250, marginBottom: '2rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#e2e8f0', textAlign: 'center' }}>Match Performance (WPM)</h3>
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
