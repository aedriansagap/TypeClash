'use client';

import { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState } from '@/lib/GameEngine';
import styles from './Game.module.css';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    lives: 3,
    combo: 0,
    score: 0,
    isGameOver: false,
  });
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current);
      engineRef.current.onStateChange = (state) => {
        setGameState(state);
      };
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, []);

  const startGame = () => {
    if (engineRef.current) {
      setIsPlaying(true);
      engineRef.current.start();
    }
  };

  return (
    <div className={styles.container}>
      {/* HUD overlay */}
      {(isPlaying || gameState.isGameOver) && (
        <div className={styles.hud}>
          <div className={styles.stat}>Score: {gameState.score}</div>
          <div className={styles.stat} style={{ color: gameState.combo > 5 ? '#fcd34d' : 'white' }}>
            Combo: x{gameState.combo}
          </div>
          <div className={styles.stat}>Lives: {'❤️'.repeat(Math.max(0, gameState.lives))}</div>
        </div>
      )}
      
      {/* Game Canvas */}
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* Menus */}
      {!isPlaying && !gameState.isGameOver && (
        <div className={styles.overlay}>
          <h1 className={styles.title}>TypeClash</h1>
          <button className={styles.btn} onClick={startGame}>Start Game</button>
        </div>
      )}

      {gameState.isGameOver && (
        <div className={styles.overlay}>
          <h2 className={styles.title}>Game Over</h2>
          <p className={styles.scoreText}>Final Score: {gameState.score}</p>
          <p className={styles.scoreText}>Max Combo: {gameState.combo}</p>
          <button className={styles.btn} onClick={startGame}>Play Again</button>
        </div>
      )}
    </div>
  );
}
