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
  });
  
  // UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [matchResult, setMatchResult] = useState<'WIN' | 'LOSE' | 'DRAW' | null>(null);
  const [waitingForResult, setWaitingForResult] = useState(false);
  
  // Custom Rules
  const [matchDuration, setMatchDuration] = useState<number>(60); // in seconds
  
  // Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

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

      engineRef.current.onGameOverCallback = (score, maxCombo, survived) => {
        if (socketRef.current) {
          socketRef.current.emit('game_over', { score, maxCombo, survived });
        }
      };
    }

    // Initialize Socket Connection
    if (!socketRef.current) {
      // Connect to the server
      socketRef.current = io(SERVER_URL);

      socketRef.current.on('game_start', (data: { seed: string, duration: number }) => {
        setWaitingForOpponent(false);
        setIsPlaying(true);
        setOpponentDisconnected(false);
        setMatchResult(null);
        setWaitingForResult(false);
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

      socketRef.current.on('match_result', (data: { result: 'WIN' | 'LOSE' | 'DRAW' }) => {
        setWaitingForResult(false);
        setMatchResult(data.result);
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
      else setUserId(data.id);
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
    setIsPlaying(true);
    engineRef.current?.start(Math.random().toString(), matchDuration * 1000);
  };

  // Render Login Screen if no userId
  if (!userId) {
    return (
      <div className={styles.container}>
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
      </div>
    );
  }

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

      {/* Main Menu */}
      {!isPlaying && !gameState.isGameOver && !waitingForOpponent && !showLeaderboard && (
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
          <h2 className={styles.title}>
            {matchResult === 'WIN' && "🏆 You Won!"}
            {matchResult === 'LOSE' && "💀 You Lost!"}
            {matchResult === 'DRAW' && "🤝 It's a Draw!"}
            {!matchResult && "Game Over"}
          </h2>
          {gameState.survived ? (
            <p className={styles.scoreText}>You Survived the Time Limit!</p>
          ) : (
            <p className={styles.scoreText}>You were crushed by words.</p>
          )}
          <p className={styles.scoreText}>Final Score: {gameState.score}</p>
          <button className={styles.btn} onClick={() => window.location.reload()}>Back to Menu</button>
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
          <button className={styles.btn} onClick={() => window.location.reload()}>Back to Menu</button>
        </div>
      )}
    </div>
  );
}
