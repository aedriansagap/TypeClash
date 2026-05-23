'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameEngine, GameState } from '@/lib/GameEngine';
import styles from './Game.module.css';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
    lives: 3,
    combo: 0,
    score: 0,
    isGameOver: false,
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState('');
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

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
      // Connect to the server. For dev, assume localhost:3001
      socketRef.current = io('http://localhost:3001');

      socketRef.current.on('game_start', (data: { seed: string }) => {
        setWaitingForOpponent(false);
        setIsPlaying(true);
        setOpponentDisconnected(false);
        if (engineRef.current) {
          engineRef.current.start(data.seed);
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

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCurrentRoom(code);
    setWaitingForOpponent(true);
    socketRef.current?.emit('join_room', code);
  };

  const joinRoom = () => {
    if (roomCode.trim() !== '') {
      setCurrentRoom(roomCode.toUpperCase());
      setWaitingForOpponent(true);
      socketRef.current?.emit('join_room', roomCode.toUpperCase());
    }
  };

  const playSinglePlayer = () => {
    setIsPlaying(true);
    engineRef.current?.start(Math.random().toString());
  };

  return (
    <div className={styles.container}>
      {/* HUD overlay */}
      {(isPlaying || gameState.isGameOver) && (
        <div className={styles.hud}>
          <div className={styles.stat}>Score: {gameState.score}</div>
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
      {!isPlaying && !gameState.isGameOver && !waitingForOpponent && (
        <div className={styles.overlay}>
          <h1 className={styles.title}>TypeClash</h1>
          
          <button className={styles.btn} onClick={playSinglePlayer} style={{ marginBottom: '2rem' }}>
            Single Player Mode
          </button>

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

      {/* Waiting for Opponent */}
      {waitingForOpponent && !isPlaying && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Room: {currentRoom}</h2>
          <p className={styles.scoreText}>Waiting for an opponent to join...</p>
          <div className={styles.loader}></div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.isGameOver && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Game Over</h2>
          <p className={styles.scoreText}>Final Score: {gameState.score}</p>
          <p className={styles.scoreText}>Max Combo: {gameState.combo}</p>
          <button className={styles.btn} onClick={() => window.location.reload()}>Back to Menu</button>
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
