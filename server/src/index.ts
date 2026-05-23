import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import { User, Score } from './models';

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/typeclash';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error. Leaderboards will not save locally if DB is missing:', err.message));

const app = express();
app.use(cors());
app.use(express.json());

// REST API for Auth and Leaderboards
app.post('/api/auth/guest', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username, isGuest: true });
      await user.save();
    }
    res.json({ id: user._id, username: user.username });
  } catch(e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/leaderboard/:duration', async (req, res) => {
  try {
    const duration = parseInt(req.params.duration);
    const scores = await Score.find({ matchDuration: duration })
      .sort({ score: -1 })
      .limit(50)
      .populate('userId', 'username');
    
    res.json(scores.map(s => ({
      username: (s.userId as any)?.username || 'Unknown',
      score: s.score,
      maxCombo: s.maxCombo,
      survived: s.survived,
      date: s.createdAt
    })));
  } catch(e) {
    res.status(500).json({ error: 'Database error' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

interface Player {
  id: string;
  roomId: string;
  isFinished: boolean;
  score: number;
  maxCombo: number;
  survived: boolean;
  userId?: string;
}

interface RoomData {
  players: string[];
  duration: number; // 60, 180, 300
}

const players = new Map<string, Player>();
const rooms = new Map<string, RoomData>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', (data: { roomId: string, duration?: number, userId?: string }) => {
    const { roomId, duration = 60, userId } = data;
    socket.join(roomId);
    
    players.set(socket.id, { 
      id: socket.id, 
      roomId,
      isFinished: false,
      score: 0,
      maxCombo: 0,
      survived: false,
      userId
    });
    
    let roomData = rooms.get(roomId);
    if (!roomData) {
      roomData = { players: [], duration };
      rooms.set(roomId, roomData);
    } else if (data.duration && roomData.players.length === 0) {
      // Room creator overrides duration
      roomData.duration = duration;
    }

    if (!roomData.players.includes(socket.id)) {
      roomData.players.push(socket.id);
    }
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    if (roomData.players.length === 2) {
      roomData.players.forEach(pId => {
        const p = players.get(pId);
        if (p) { p.isFinished = false; p.score = 0; p.maxCombo = 0; p.survived = false; }
      });

      io.to(roomId).emit('game_start', {
        seed: Math.random().toString(),
        duration: roomData.duration
      });
    }
  });

  socket.on('send_garbage', (amount: number) => {
    const player = players.get(socket.id);
    if (player) socket.to(player.roomId).emit('receive_garbage', amount);
  });

  socket.on('game_over', async (data: { score: number, maxCombo: number, survived: boolean }) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.isFinished = true;
    player.score = data.score;
    player.maxCombo = data.maxCombo;
    player.survived = data.survived;

    const roomData = rooms.get(player.roomId);
    
    // Save to database if authenticated
    if (player.userId && roomData && mongoose.connection.readyState === 1) {
      try {
        const newScore = new Score({
          userId: player.userId,
          score: player.score,
          maxCombo: player.maxCombo,
          matchDuration: roomData.duration,
          survived: player.survived
        });
        await newScore.save();
      } catch (err) {
        console.error('Failed to save score:', err);
      }
    }

    if (!roomData) return;
    
    const opponentId = roomData.players.find(id => id !== socket.id);
    const opponent = opponentId ? players.get(opponentId) : null;

    if (opponent && opponent.isFinished) {
      let winnerId: string | null = null;
      if (player.survived && !opponent.survived) winnerId = player.id;
      else if (!player.survived && opponent.survived) winnerId = opponent.id;
      else {
        if (player.score > opponent.score) winnerId = player.id;
        else if (opponent.score > player.score) winnerId = opponent.id;
      }

      if (winnerId === null) {
        io.to(player.roomId).emit('match_result', { result: 'DRAW' });
      } else {
        io.to(winnerId).emit('match_result', { result: 'WIN' });
        const loserId = winnerId === player.id ? opponent.id : player.id;
        io.to(loserId).emit('match_result', { result: 'LOSE' });
      }
    } else {
      socket.emit('waiting_for_result');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const player = players.get(socket.id);
    if (player) {
      const roomData = rooms.get(player.roomId);
      if (roomData) {
        const newPlayers = roomData.players.filter(id => id !== socket.id);
        if (newPlayers.length === 0) {
          rooms.delete(player.roomId);
        } else {
          roomData.players = newPlayers;
          io.to(player.roomId).emit('opponent_disconnected');
        }
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`TypeClash Server listening on port ${PORT}`);
});
