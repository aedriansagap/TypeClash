'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameEngine, GameState } from '@/lib/GameEngine';
import styles from './Game.module.css';

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  // Auth State
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
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
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  // Load from LocalStorage
  useEffect(() => {
    const savedId = localStorage.getItem('typeclash_userid');
    const savedName = localStorage.getItem('typeclash_username');
    if (savedId && savedName) {
      setUserId(savedId);
      setUsername(savedName);
    }
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
      // Connect to the server
      socketRef.current = io(SERVER_URL);

      socketRef.current.on('game_start', (data: { seed: string, duration: number }) => {
        setWaitingForOpponent(false);
        setIsSinglePlayer(false);
        setIsPlaying(true);
        setOpponentDisconnected(false);
        setMatchResult(null);
        setWaitingForResult(false);
        setPlayerMetrics(null);
        setOpponentMetrics(null);
        setMatchDuration(data.duration);
        if (engineRef.current) {
          engineRef.current.start(data.seed, data.duration * 1000);
        }
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
      engineRef.current.onGameOverCallback = (score, maxCombo, survived, metrics) => {
        if (isSinglePlayer) {
          setPlayerMetrics(metrics); // Save metrics locally to show on screen
          if (userId) {
            fetch(`${SERVER_URL}/api/score`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, score, maxCombo, matchDuration, survived })
            }).catch(console.error);
          }
        } else if (socketRef.current) {
          // Multiplayer: emit to server to process tiebreakers and broadcast metrics
          socketRef.current.emit('game_over', { score, maxCombo, survived, metrics });
        }
      };
    }
  }, [isSinglePlayer, userId, matchDuration]);

  const handleLogin = async () => {
    if (!username.trim()) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });
      const data = await res.json();
      if (data.error) setAuthError(data.error);
      else {
        setUserId(data.id);
        localStorage.setItem('typeclash_userid', data.id);
        localStorage.setItem('typeclash_username', data.username);
      }
    } catch(e) {
      setAuthError('Failed to connect to server');
    }
  };

  const loadLeaderboard = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/leaderboard/${matchDuration}`);
      const data = await res.json();
      setLeaderboardData(data);
      setShowLeaderboard(true);
    } catch (e) {
      console.error(e);
    }
  };

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCurrentRoom(code);
    setWaitingForOpponent(true);
    socketRef.current?.emit('join_room', { roomId: code, duration: matchDuration, userId });
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
    engineRef.current?.start(Math.random().toString(), matchDuration * 1000);
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
    setPlayerMetrics(null);
    setOpponentMetrics(null);
    setGameState(prev => ({...prev, isGameOver: false}));
    if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current.connect(); // Reconnect to get a fresh socket if we left a room
    }
  };

  return (
    <div className={styles.container}>
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

      {/* Login Screen */}
      {!userId && (
        <div className={styles.overlay}>
          <h1 className={styles.title}>TypeClash</h1>
          <div className={styles.multiplayerBox}>
            <h3 className={styles.subtitle}>Enter Player Name</h3>
            <div className={styles.inputGroup}>
              <input 
                type="text" 
                className={styles.input} 
                placeholder="Username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button className={styles.btnSmall} onClick={handleLogin}>Start</button>
            </div>
            {authError && <p style={{color: '#ef4444'}}>{authError}</p>}
          </div>
        </div>
      )}

      {/* Main Menu */}
      {userId && !isPlaying && !gameState.isGameOver && !waitingForOpponent && !showLeaderboard && (
        <div className={styles.overlay}>
          <h1 className={styles.title}>TypeClash</h1>
          <p style={{marginBottom: '2rem', fontSize: '1.2rem', color: '#9ca3af'}}>Welcome, {username}!</p>
          
          <div style={{display: 'flex', gap: '1rem', marginBottom: '2rem'}}>
            <label style={{fontSize: '1.2rem'}}>Match Duration:</label>
            <select 
              className={styles.input} 
              style={{padding: '4px 12px', fontSize: '1rem'}}
              value={matchDuration}
              onChange={(e) => setMatchDuration(Number(e.target.value))}
            >
              <option value={60}>1 Minute</option>
              <option value={180}>3 Minutes</option>
              <option value={300}>5 Minutes</option>
            </select>
          </div>

          <div style={{display: 'flex', gap: '1rem', marginBottom: '2rem'}}>
            <button className={styles.btn} onClick={playSinglePlayer}>Single Player</button>
            <button className={styles.btn} style={{background: 'linear-gradient(135deg, #f59e0b, #ea580c)'}} onClick={loadLeaderboard}>Leaderboard</button>
          </div>

          <div className={styles.multiplayerBox}>
            <h3 className={styles.subtitle}>Multiplayer</h3>
            <button className={styles.btn} onClick={createRoom}>Create Room</button>
            <div className={styles.orDivider}>or</div>
            <div className={styles.inputGroup}>
              <input 
                type="text" 
                className={styles.input} 
                placeholder="Enter Room Code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
              <button className={styles.btnSmall} onClick={joinRoom}>Join</button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className={styles.overlay}>
          <div className={styles.multiplayerBox} style={{ width: '80%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 className={styles.title} style={{fontSize: '3rem', marginBottom: '1rem'}}>Top Scores ({matchDuration}s)</h2>
            <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginBottom: '2rem'}}>
              <thead>
                <tr style={{borderBottom: '1px solid rgba(255,255,255,0.2)'}}>
                  <th style={{padding: '10px'}}>Rank</th>
                  <th style={{padding: '10px'}}>Player</th>
                  <th style={{padding: '10px'}}>Score</th>
                  <th style={{padding: '10px'}}>Max Combo</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData.length === 0 && <tr><td colSpan={4} style={{textAlign: 'center', padding: '20px'}}>No scores yet!</td></tr>}
                {leaderboardData.map((row, idx) => (
                  <tr key={idx} style={{background: idx % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'}}>
                    <td style={{padding: '10px'}}>{idx + 1}</td>
                    <td style={{padding: '10px'}}>{row.username}</td>
                    <td style={{padding: '10px', fontWeight: 'bold', color: '#4ade80'}}>{row.score}</td>
                    <td style={{padding: '10px'}}>{row.maxCombo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className={styles.btn} onClick={() => setShowLeaderboard(false)}>Back to Menu</button>
          </div>
        </div>
      )}

      {/* Waiting for Opponent */}
      {waitingForOpponent && !isPlaying && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Room: {currentRoom}</h2>
          <p className={styles.scoreText}>Match Time: {matchDuration}s</p>
          <p className={styles.scoreText}>Waiting for an opponent to join...</p>
          <div className={styles.loader}></div>
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
    </div>
  );
}
