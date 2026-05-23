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
}

const players = new Map<string, Player>();
const rooms = new Map<string, string[]>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    
    players.set(socket.id, { id: socket.id, roomId });
    
    let roomPlayers = rooms.get(roomId) || [];
    if (!roomPlayers.includes(socket.id)) {
      roomPlayers.push(socket.id);
      rooms.set(roomId, roomPlayers);
    }
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    if (roomPlayers.length === 2) {
      // Start game when two players join
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
