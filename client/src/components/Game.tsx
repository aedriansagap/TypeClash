'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { GameEngine, GameState } from '@/lib/GameEngine';
import styles from './Game.module.css';

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  // Auth State
  const [authMode, setAuthMode] = useState<'SELECT' | 'GUEST' | 'LOGIN' | 'REGISTER'>('SELECT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authError, setAuthError] = useState('');
  
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
  });
  
  // UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  
  // Result State
  const [matchResult, setMatchResult] = useState<'WIN' | 'LOSE' | 'DRAW' | null>(null);
  const [waitingForResult, setWaitingForResult] = useState(false);
  const [playerMetrics, setPlayerMetrics] = useState<{ wpm: number, accuracy: number, garbageSent: number } | null>(null);
  const [opponentMetrics, setOpponentMetrics] = useState<{ wpm: number, accuracy: number, garbageSent: number } | null>(null);
  
  // Custom Rules
  const [matchDuration, setMatchDuration] = useState<number>(60); // in seconds
  
  // Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'GLOBAL' | 'PERSONAL'>('GLOBAL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Mobile Detection
  const [isMobile, setIsMobile] = useState(false);
  const [dismissedMobileWarning, setDismissedMobileWarning] = useState(false);
  
  // Auto Matchmaking
  const [isSearchingAuto, setIsSearchingAuto] = useState(false);

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
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Initialize Game Engine
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current);
      engineRef.current.onStateChange = (state) => {
        setGameState(state);
      };
      
      engineRef.current.onGarbageGenerated = (amount) => {
        if (socketRef.current) {
          socketRef.current.emit('send_garbage', amount);
        }
      };
    }

    // Initialize Socket Connection
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL);

      socketRef.current.on('game_start', (data: { seed: string, duration: number, roomId?: string, mods?: any }) => {
        setWaitingForOpponent(false);
        setIsSearchingAuto(false);
        setIsSinglePlayer(false);
        setIsPlaying(true);
        setOpponentDisconnected(false);
        setMatchResult(null);
        setWaitingForResult(false);
        setPlayerMetrics(null);
        setOpponentMetrics(null);
        setMatchDuration(data.duration);
        if (data.roomId) setCurrentRoom(data.roomId);
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

      socketRef.current.on('opponent_disconnected', () => {
        setOpponentDisconnected(true);
        if (engineRef.current) {
          engineRef.current.stop();
        }
      });

      socketRef.current.on('match_result', (data: { result: 'WIN' | 'LOSE' | 'DRAW', playerMetrics?: any, opponentMetrics?: any }) => {
        setWaitingForResult(false);
        setMatchResult(data.result);
        if (data.playerMetrics) setPlayerMetrics(data.playerMetrics);
        if (data.opponentMetrics) setOpponentMetrics(data.opponentMetrics);
      });

      socketRef.current.on('waiting_for_result', () => {
        setWaitingForResult(true);
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
            const modArr = [];
            if (mods.includeNumbers) modArr.push('numbers');
            if (mods.includePunctuation) modArr.push('punctuation');
            if (mods.longestWords) modArr.push('long_words');
            if (modArr.length > 0) modeStr = modArr.join('_');

            fetch(`${SERVER_URL}/api/score`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, score, maxCombo, matchDuration, survived, mode: modeStr })
            }).catch(console.error);
          }
        } else if (!isSinglePlayer && socketRef.current) {
          socketRef.current.emit('game_over', { score, maxCombo, survived, metrics });
        }
      };
    }
  }, [isSinglePlayer, userId, matchDuration]);

  const handleAuth = async (endpoint: string) => {
    if (!username.trim()) return;
    setAuthError('');
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
      }
    } catch(e) {
      setAuthError('Failed to connect to server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('typeclash_userid');
    localStorage.removeItem('typeclash_username');
    localStorage.removeItem('typeclash_isguest');
    localStorage.removeItem('typeclash_token');
    setUserId(null);
    setUsername('');
    setPassword('');
    setIsGuest(false);
    setAuthMode('SELECT');
  };

  const loadLeaderboard = async (tab: 'GLOBAL' | 'PERSONAL', mode: string = leaderboardMode, duration: number = matchDuration) => {
    setLeaderboardTab(tab);
    setLeaderboardMode(mode);
    setMatchDuration(duration);
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
    }
  };

  const createRoom = () => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCurrentRoom(randomId);
    setWaitingForOpponent(true);
    socketRef.current?.emit('join_room', { roomId: randomId, duration: matchDuration, userId, mods });
  };

  const joinRoom = () => {
    if (roomCode.trim() !== '') {
      setCurrentRoom(roomCode.toUpperCase());
      setWaitingForOpponent(true);
      socketRef.current?.emit('join_room', { roomId: roomCode.toUpperCase(), userId });
    }
  };

  const playSinglePlayer = () => {
    setIsSinglePlayer(true);
    setIsPlaying(true);
    setPlayerMetrics(null);
    setOpponentMetrics(null);
    setGameState(prev => ({...prev, isGameOver: false}));
    engineRef.current?.start(Math.random().toString(), matchDuration * 1000, mods);
  };

  const findMatch = () => {
    socketRef.current?.emit('find_match', { duration: matchDuration, userId, mods });
  };

  const cancelMatch = () => {
    socketRef.current?.emit('cancel_match');
    setIsSearchingAuto(false);
  };

  const returnToMenu = () => {
    setIsPlaying(false);
    setIsSinglePlayer(false);
    setCurrentRoom('');
    setRoomCode('');
    setWaitingForOpponent(false);
    setOpponentDisconnected(false);
    setMatchResult(null);
    setWaitingForResult(false);
    setIsSearchingAuto(false);
    setPlayerMetrics(null);
    setOpponentMetrics(null);
    setGameState(prev => ({...prev, isGameOver: false}));
    if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.connect();
    }
  };

  return (
    <div className={styles.container}>
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
      {(isPlaying || gameState.isGameOver) && (
        <div className={styles.hud}>
          <div className={styles.stat}>Score: {gameState.score}</div>
          <div className={styles.stat}>Time: {gameState.timeLeft}s</div>
          {currentRoom && <div className={styles.stat}>Room: {currentRoom}</div>}
          <div className={styles.stat} style={{ color: gameState.combo > 5 ? '#fcd34d' : 'white' }}>
            Combo: x{gameState.combo}
          </div>
          <div className={styles.stat}>Lives: {'❤️'.repeat(Math.max(0, gameState.lives))}</div>
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
                  value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAuth('/api/auth/guest')}
                />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem'}} onClick={() => handleAuth('/api/auth/guest')}>Start</button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

            {authMode === 'LOGIN' && (
              <>
                <h3 className={styles.subtitle}>Log In</h3>
                <input type="text" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <input type="password" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAuth('/api/auth/login')} />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem'}} onClick={() => handleAuth('/api/auth/login')}>Log In</button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

            {authMode === 'REGISTER' && (
              <>
                <h3 className={styles.subtitle}>Create Account</h3>
                <input type="text" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <input type="password" className={styles.input} style={{width: '100%', marginBottom: '1rem'}} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAuth('/api/auth/register')} />
                <button className={styles.btn} style={{width: '100%', marginBottom: '1rem'}} onClick={() => handleAuth('/api/auth/register')}>Register</button>
                <button className={styles.btnSmall} style={{width: '100%', background: 'transparent', border: '1px solid gray'}} onClick={() => setAuthMode('SELECT')}>Back</button>
                {authError && <p style={{color: '#ef4444', marginTop: '1rem'}}>{authError}</p>}
              </>
            )}

          </div>
        </div>
      )}

      {/* Main Menu */}
      {userId && !isPlaying && !gameState.isGameOver && !waitingForOpponent && !showLeaderboard && !showHowToPlay && (
        <div className={styles.overlay}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{color: '#9ca3af', fontWeight: 'bold'}}>{username} {isGuest && '(Guest)'}</span>
            <button onClick={() => setShowHowToPlay(true)} style={{ background: 'transparent', color: '#60a5fa', border: '1px solid #60a5fa', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>How to Play</button>
            <button onClick={handleLogout} style={{ background: 'transparent', color: '#f87171', border: '1px solid #f87171', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
          </div>

          <h1 className={styles.title} style={{ marginBottom: '1rem' }}>TypeClash</h1>
          
          <div className={styles.menuGrid}>
            {/* Left Column: Settings & Account */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <div className={styles.multiplayerBox} style={{ width: '100%', margin: 0, padding: '1.5rem' }}>
                <h3 className={styles.subtitle}>Match Duration</h3>
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 60 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(60)}>1m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 180 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(180)}>3m</button>
                  <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 300 ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setMatchDuration(300)}>5m</button>
                </div>
              </div>

              <div className={styles.multiplayerBox} style={{ width: '100%', margin: 0, padding: '1.5rem' }}>
                <h3 className={styles.subtitle} style={{ fontSize: '1.5rem' }}>Special Mods</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mods.includeNumbers} onChange={(e) => setMods({...mods, includeNumbers: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                    Numbers
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mods.includePunctuation} onChange={(e) => setMods({...mods, includePunctuation: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                    Punctuation
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mods.longestWords} onChange={(e) => setMods({...mods, longestWords: e.target.checked})} style={{ width: '20px', height: '20px' }} />
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

              <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px' }} onClick={playSinglePlayer}>Single Player</button>
                <button className={styles.btn} style={{ flex: 1, marginTop: 0, fontSize: '1.2rem', padding: '12px', background: 'linear-gradient(135deg, #1e40af, #1e3a8a)' }} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Leaderboard</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && !isPlaying && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>Leaderboards</h2>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', width: '100%' }}>
              <button className={styles.btnSmall} style={{ flex: 1, background: leaderboardTab === 'GLOBAL' ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard('GLOBAL', leaderboardMode, matchDuration)}>Global Top</button>
              <button className={styles.btnSmall} style={{ flex: 1, background: leaderboardTab === 'PERSONAL' ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard('PERSONAL', leaderboardMode, matchDuration)}>My History</button>
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
              <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 60 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 60)}>1m</button>
              <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 180 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 180)}>3m</button>
              <button className={styles.btnSmall} style={{ flex: 1, background: matchDuration === 300 ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => loadLeaderboard(leaderboardTab, leaderboardMode, 300)}>5m</button>
            </div>
            
            <div style={{ overflowY: 'auto', width: '100%', paddingRight: '10px', marginBottom: '1rem' }}>
              <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid rgba(255,255,255,0.2)'}}>
                    <th style={{padding: '10px'}}>Rank</th>
                    {leaderboardTab === 'GLOBAL' && <th style={{padding: '10px'}}>Player</th>}
                    <th style={{padding: '10px'}}>Score</th>
                    <th style={{padding: '10px'}}>Max Combo</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData.length === 0 && <tr><td colSpan={leaderboardTab === 'GLOBAL' ? 4 : 3} style={{textAlign: 'center', padding: '20px'}}>No scores yet!</td></tr>}
                  {leaderboardData.map((row, idx) => (
                    <tr key={idx} style={{background: idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'}}>
                      <td style={{padding: '10px'}}>{idx + 1}</td>
                      {leaderboardTab === 'GLOBAL' && <td style={{padding: '10px'}}>{row.username}</td>}
                      <td style={{padding: '10px', fontWeight: 'bold', color: '#4ade80'}}>{row.score}</td>
                      <td style={{padding: '10px'}}>{row.maxCombo}</td>
                    </tr>
                  ))}
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
          <div className={styles.multiplayerBox} style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>How to Play</h2>
            
            <div style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '2rem' }}>
              <h3 style={{ color: '#4ade80', marginBottom: '0.5rem' }}>⌨️ The Basics</h3>
              <p style={{ marginBottom: '1.5rem' }}>Words will fall from the top of the screen. Type them correctly before they hit the bottom! You have exactly <strong>3 lives</strong>.</p>
              
              <h3 style={{ color: '#fcd34d', marginBottom: '0.5rem' }}>🔥 Combos</h3>
              <p style={{ marginBottom: '1.5rem' }}>Typing words flawlessly builds your combo multiplier. Making a mistake breaks the combo!</p>
              
              <h3 style={{ color: '#f87171', marginBottom: '0.5rem' }}>⚔️ Multiplayer Garbage</h3>
              <p style={{ marginBottom: '1.5rem' }}>In multiplayer matches, every time you reach a <strong>Combo of 5</strong>, you instantly send a wave of fast "Garbage Words" to your opponent's screen. Overwhelm them to win!</p>
            </div>

            <button className={styles.btn} onClick={() => setShowHowToPlay(false)}>Understood!</button>
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
          <h2 className={styles.title}>Room: {currentRoom}</h2>
          <p className={styles.scoreText}>Match Time: {matchDuration}s</p>
          <p className={styles.scoreText}>Waiting for an opponent to join...</p>
          <div className={styles.loader}></div>
          <button className={styles.btn} style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }} onClick={returnToMenu}>Leave Room</button>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.isGameOver && !waitingForResult && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ minWidth: '400px' }}>
            <h2 className={styles.title} style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
              {isSinglePlayer ? "Match Complete!" : (
                matchResult === 'WIN' ? "🏆 You Won!" :
                matchResult === 'LOSE' ? "💀 You Lost!" :
                matchResult === 'DRAW' ? "🤝 It's a Draw!" : "Game Over"
              )}
            </h2>
            
            <p className={styles.scoreText} style={{ marginBottom: '2rem' }}>
              {gameState.survived ? "You Survived the Time Limit!" : "You were crushed by words."}
            </p>

            {/* Stats Grid */}
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', width: '100%', marginBottom: '2rem' }}>
              {/* Player Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>
                  {isSinglePlayer ? "Your Stats" : "You"}
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Score:</span> <span style={{ fontWeight: 'bold', color: '#4ade80' }}>{gameState.score}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Max Combo:</span> <span>{gameState.maxCombo}</span>
                </div>
                {playerMetrics && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>WPM:</span> <span style={{ fontWeight: 'bold' }}>{playerMetrics.wpm}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Accuracy:</span> <span>{playerMetrics.accuracy}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Garbage Sent:</span> <span style={{ color: '#f87171' }}>{playerMetrics.garbageSent}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Opponent Stats (Multiplayer Only) */}
              {!isSinglePlayer && opponentMetrics && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
                  <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>Opponent</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>WPM:</span> <span style={{ fontWeight: 'bold' }}>{opponentMetrics.wpm}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Accuracy:</span> <span>{opponentMetrics.accuracy}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Garbage Sent:</span> <span style={{ color: '#f87171' }}>{opponentMetrics.garbageSent}</span>
                  </div>
                </div>
              )}
            </div>

            <button className={styles.btn} onClick={returnToMenu}>Back to Menu</button>
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

      {/* Opponent Disconnected */}
      {opponentDisconnected && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Opponent Disconnected</h2>
          <p className={styles.scoreText}>You win by default!</p>
          <button className={styles.btn} onClick={returnToMenu}>Back to Menu</button>
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
