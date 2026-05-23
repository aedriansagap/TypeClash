import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for MVP/Dev
    methods: ["GET", "POST"]
  }
});

interface Player {
  id: string;
  roomId: string;
  isFinished: boolean;
  score: number;
  survived: boolean;
}

const players = new Map<string, Player>();
const rooms = new Map<string, string[]>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    
    players.set(socket.id, { 
      id: socket.id, 
      roomId,
      isFinished: false,
      score: 0,
      survived: false
    });
    
    let roomPlayers = rooms.get(roomId) || [];
    if (!roomPlayers.includes(socket.id)) {
      roomPlayers.push(socket.id);
      rooms.set(roomId, roomPlayers);
    }
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    if (roomPlayers.length === 2) {
      // Start game when two players join
      roomPlayers.forEach(pId => {
        const p = players.get(pId);
        if (p) {
          p.isFinished = false;
          p.score = 0;
          p.survived = false;
        }
      });

      io.to(roomId).emit('game_start', {
        seed: Math.random() // Same seed to ensure fairness
      });
    }
  });

  socket.on('send_garbage', (amount: number) => {
    const player = players.get(socket.id);
    if (player) {
      // Send garbage to everyone else in the room (the opponent)
      socket.to(player.roomId).emit('receive_garbage', amount);
    }
  });

  socket.on('game_over', (data: { score: number, survived: boolean }) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.isFinished = true;
    player.score = data.score;
    player.survived = data.survived;

    const roomPlayers = rooms.get(player.roomId) || [];
    const opponentId = roomPlayers.find(id => id !== socket.id);
    const opponent = opponentId ? players.get(opponentId) : null;

    if (opponent && opponent.isFinished) {
      // Both finished, determine winner
      let winnerId: string | null = null;
      
      if (player.survived && !opponent.survived) {
        winnerId = player.id;
      } else if (!player.survived && opponent.survived) {
        winnerId = opponent.id;
      } else {
        // Both survived OR both died. Tiebreaker: Score
        if (player.score > opponent.score) {
          winnerId = player.id;
        } else if (opponent.score > player.score) {
          winnerId = opponent.id;
        }
        // If scores are equal, winnerId remains null (Draw)
      }

      // Emit results
      if (winnerId === null) {
        io.to(player.roomId).emit('match_result', { result: 'DRAW' });
      } else {
        io.to(winnerId).emit('match_result', { result: 'WIN' });
        const loserId = winnerId === player.id ? opponent.id : player.id;
        io.to(loserId).emit('match_result', { result: 'LOSE' });
      }
    } else {
      // Waiting for opponent to finish
      socket.emit('waiting_for_result');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const player = players.get(socket.id);
    if (player) {
      const roomPlayers = rooms.get(player.roomId) || [];
      const newRoomPlayers = roomPlayers.filter(id => id !== socket.id);
      if (newRoomPlayers.length === 0) {
        rooms.delete(player.roomId);
      } else {
        rooms.set(player.roomId, newRoomPlayers);
        io.to(player.roomId).emit('opponent_disconnected');
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`TypeClash Server listening on port ${PORT}`);
});
