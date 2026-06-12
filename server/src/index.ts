import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Score } from './models';

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/typeclash';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_typeclash';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error. Leaderboards will not save locally if DB is missing:', err.message));

const app = express();
app.use(cors());
app.use(express.json());

// Health Check Endpoint (Required by Render)
app.get('/', (req, res) => {
  res.status(200).send('TypeClash Server is running smoothly!');
});

// --- AUTHENTICATION API --- //

const generateToken = (userId: string, username: string, isGuest: boolean) => {
  return jwt.sign({ id: userId, username, isGuest }, JWT_SECRET, { expiresIn: '7d' });
};

// 1. Guest Login
app.post('/api/auth/guest', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username, isGuest: true });
      await user.save();
    } else if (!user.isGuest) {
      return res.status(403).json({ error: 'Username is registered. Please log in with a password.' });
    }
    const token = generateToken(user._id.toString(), user.username, true);
    res.json({ id: user._id, username: user.username, token, isGuest: true, customization: user.customization });
  } catch(e: any) {
    console.error('Auth error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// 2. Register (or convert Guest to Registered)
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  try {
    let user = await User.findOne({ username });
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    if (user) {
      if (user.isGuest) {
        // Upgrade guest account to permanent
        user.isGuest = false;
        user.passwordHash = passwordHash;
        await user.save();
      } else {
        return res.status(409).json({ error: 'Username already taken' });
      }
    } else {
      user = new User({ username, passwordHash, isGuest: false });
      await user.save();
    }

    const token = generateToken(user._id.toString(), user.username, false);
    res.json({ id: user._id, username: user.username, token, isGuest: false, customization: user.customization });
  } catch (e: any) {
    console.error('Register error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.isGuest) {
      return res.status(400).json({ error: 'This is a guest account. Please use Play as Guest or create a password.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.passwordHash || '');
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = generateToken(user._id.toString(), user.username, false);
    res.json({ id: user._id, username: user.username, token, isGuest: false, customization: user.customization });
  } catch (e: any) {
    console.error('Login error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// --- LEADERBOARD API --- //

// Global Leaderboard (Best Score Per Player)
app.get('/api/leaderboard/:duration/:mode', async (req, res) => {
  try {
    const duration = parseInt(req.params.duration);
    const mode = req.params.mode || 'vanilla';
    
    // Aggregation pipeline to get max score per user
    const topScores = await Score.aggregate([
      { $match: { matchDuration: duration, mode: mode } },
      { $sort: { score: -1 } }, // Sort by score descending first
      { 
        $group: { 
          _id: "$userId", 
          maxScoreId: { $first: "$_id" },
          score: { $first: "$score" },
          maxCombo: { $first: "$maxCombo" },
          survived: { $first: "$survived" },
          createdAt: { $first: "$createdAt" }
        } 
      },
      { $sort: { score: -1 } }, // Re-sort grouped results by score
      { $limit: 50 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" }
    ]);

    res.json(topScores.map(s => ({
      username: s.user.username,
      score: s.score,
      maxCombo: s.maxCombo,
      survived: s.survived,
      date: s.createdAt
    })));
  } catch(e: any) {
    console.error('Leaderboard error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// Personal Leaderboard (All Scores for a single player)
app.get('/api/leaderboard/personal/:userId/:duration/:mode', async (req, res) => {
  try {
    const { userId, duration, mode } = req.params;
    const scores = await Score.find({ userId, matchDuration: parseInt(duration), mode: mode || 'vanilla' })
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(50);
      
    res.json(scores.map(s => ({
      score: s.score,
      maxCombo: s.maxCombo,
      survived: s.survived,
      date: s.createdAt
    })));
  } catch(e: any) {
    console.error('Personal Leaderboard error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// Comprehensive Profile Endpoint
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stats = await Score.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { 
        $group: { 
          _id: null,
          totalGamesPlayed: { $sum: 1 },
          totalPvPGames: { $sum: { $cond: ["$isPvP", 1, 0] } },
          maxCombo: { $max: "$maxCombo" },
          personalBestScore: { $max: "$score" },
          gamesSurvived: { $sum: { $cond: ["$survived", 1, 0] } }
        }
      }
    ]);

    const result = stats.length > 0 ? stats[0] : {
      totalGamesPlayed: 0,
      totalPvPGames: 0,
      maxCombo: 0,
      personalBestScore: 0,
      gamesSurvived: 0
    };

    res.json({
      username: user.username,
      joinedDate: user.createdAt,
      customization: user.customization,
      ...result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update Profile Customization
app.put('/api/profile/customization', async (req, res) => {
  const { userId, fontFamily, theme } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (fontFamily) user.customization.fontFamily = fontFamily;
    if (theme) user.customization.theme = theme;
    
    await user.save();
    res.json({ message: 'Customization saved successfully', customization: user.customization });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/score', async (req, res) => {
  const { userId, score, maxCombo, matchDuration, survived, mode, isPvP } = req.body;
  if (!userId || score === undefined) return res.status(400).json({ error: 'Missing data' });
  try {
    const newScore = new Score({
      userId,
      score,
      maxCombo,
      matchDuration,
      survived,
      mode: mode || 'vanilla',
      isPvP: isPvP || false
    });
    await newScore.save();
    res.json({ success: true });
  } catch(e: any) {
    console.error('Score saving error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// --- SOCKET.IO --- //

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
  username?: string;
  metrics?: { wpm: number; accuracy: number; garbageSent: number; };
  rank?: number;
}

interface RoomData {
  players: string[];
  alivePlayers: string[];
  duration: number; // 60, 180, 300
  mods?: any;
  status: 'waiting' | 'playing' | 'finished';
  host?: string;
}

const players = new Map<string, Player>();
const rooms = new Map<string, RoomData>();
let matchmakingQueue: Array<{ socketId: string, duration: number, userId?: string, username?: string, modString: string, mods?: any, joinedAt: number }> = [];

// Matchmaking Loop
setInterval(() => {
  if (matchmakingQueue.length < 2) return;

  const groups: Record<string, typeof matchmakingQueue> = {};
  for (const p of matchmakingQueue) {
    const key = `${p.duration}_${p.modString}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  for (const key in groups) {
    const group = groups[key];
    if (group.length >= 2) {
      const oldest = Math.min(...group.map(p => p.joinedAt));
      if (group.length >= 10 || Date.now() - oldest > 10000) {
        const matchPlayers = group.slice(0, 10);
        matchmakingQueue = matchmakingQueue.filter(p => !matchPlayers.find(mp => mp.socketId === p.socketId));

        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const roomData: RoomData = { 
          players: [], 
          alivePlayers: [], 
          duration: matchPlayers[0].duration, 
          mods: matchPlayers[0].mods,
          status: 'playing' 
        };
        rooms.set(roomId, roomData);

        for (const p of matchPlayers) {
          const socket = io.sockets.sockets.get(p.socketId);
          if (socket) {
            socket.join(roomId);
            players.set(p.socketId, { 
              id: p.socketId, roomId, isFinished: false, score: 0, maxCombo: 0, survived: false, 
              userId: p.userId, username: p.username 
            });
            roomData.players.push(p.socketId);
            roomData.alivePlayers.push(p.socketId);
          }
        }

        io.to(roomId).emit('game_start', {
          seed: Math.random().toString(),
          duration: roomData.duration,
          roomId,
          mods: roomData.mods,
          players: roomData.players.map(id => {
            const p = players.get(id);
            return { id, username: p?.username || 'Guest' };
          })
        });
      }
    }
  }
}, 2000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', (data: { roomId: string, duration?: number, userId?: string, username?: string, mods?: any }) => {
    const { roomId, duration = 60, userId, username, mods } = data;
    socket.join(roomId);
    
    players.set(socket.id, { 
      id: socket.id, 
      roomId,
      isFinished: false,
      score: 0,
      maxCombo: 0,
      survived: false,
      userId,
      username
    });
    
    let roomData = rooms.get(roomId);
    if (!roomData) {
      roomData = { players: [], alivePlayers: [], duration, mods, status: 'waiting', host: socket.id };
      rooms.set(roomId, roomData);
    } else if (data.duration && roomData.players.length === 0) {
      roomData.duration = duration;
      roomData.mods = mods;
      roomData.host = socket.id;
    }

    if (!roomData.players.includes(socket.id)) {
      if (roomData.players.length >= 10) {
        socket.emit('room_error', { message: 'Room is full (max 10 players)' });
        return;
      }
      if (roomData.status !== 'waiting') {
        socket.emit('room_error', { message: 'Game has already started' });
        return;
      }
      roomData.players.push(socket.id);
    }
    
    io.to(roomId).emit('lobby_update', {
      players: roomData.players.map(id => {
        const p = players.get(id);
        return { id, username: p?.username || 'Guest', isHost: roomData?.host === id };
      })
    });
  });

  socket.on('start_private_match', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const roomData = rooms.get(player.roomId);
    if (roomData && roomData.host === socket.id && roomData.status === 'waiting') {
      if (roomData.players.length < 2) return; // Need at least 2 players
      
      roomData.status = 'playing';
      roomData.alivePlayers = [...roomData.players];
      
      roomData.players.forEach(pId => {
        const p = players.get(pId);
        if (p) { p.isFinished = false; p.score = 0; p.maxCombo = 0; p.survived = false; delete p.rank; }
      });

      io.to(player.roomId).emit('game_start', {
        seed: Math.random().toString(),
        duration: roomData.duration,
        roomId: player.roomId,
        mods: roomData.mods,
        players: roomData.players.map(id => {
          const p = players.get(id);
          return { id, username: p?.username || 'Guest' };
        })
      });
    }
  });

  socket.on('find_match', (data: { duration?: number, userId?: string, username?: string, mods?: any }) => {
    const { duration = 60, userId, username, mods } = data;
    const modString = JSON.stringify(mods || {});
    
    if (!matchmakingQueue.some(p => p.socketId === socket.id)) {
      matchmakingQueue.push({ socketId: socket.id, duration, userId, username, modString, mods, joinedAt: Date.now() });
    }
    socket.emit('searching_for_match');
  });

  socket.on('cancel_match', () => {
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
  });

  socket.on('send_garbage', (amount: number) => {
    const player = players.get(socket.id);
    if (!player) return;
    const roomData = rooms.get(player.roomId);
    if (!roomData) return;
    
    // Pick a random alive opponent
    const aliveOpponents = roomData.alivePlayers.filter(id => id !== socket.id);
    if (aliveOpponents.length > 0) {
      const targetId = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
      io.to(targetId).emit('receive_garbage', amount);
    }
  });

  socket.on('player_update', (metrics: any) => {
    const player = players.get(socket.id);
    if (!player) return;
    // Broadcast to others in the room
    socket.to(player.roomId).emit('opponent_update', {
      id: socket.id,
      metrics
    });
  });

  socket.on('game_over', async (data: { score: number, maxCombo: number, survived: boolean, metrics?: { wpm: number, accuracy: number, garbageSent: number } }) => {
    const player = players.get(socket.id);
    if (!player || player.isFinished) return;

    player.isFinished = true;
    player.score = data.score;
    player.maxCombo = data.maxCombo;
    player.survived = data.survived;
    if (data.metrics) player.metrics = data.metrics;

    const roomData = rooms.get(player.roomId);
    if (!roomData) return;

    // Remove from alive players
    roomData.alivePlayers = roomData.alivePlayers.filter(id => id !== socket.id);
    
    // Assign rank (if they died)
    if (!player.survived) {
      player.rank = roomData.alivePlayers.length + 1;
    }

    io.to(player.roomId).emit('player_died', {
      id: socket.id,
      rank: player.rank,
      score: player.score
    });

    // Save to database if authenticated
    if (player.userId && mongoose.connection.readyState === 1) {
      try {
        let modeStr = 'vanilla';
        if (roomData.mods) {
          const modArr = [];
          if (roomData.mods.includeNumbers) modArr.push('numbers');
          if (roomData.mods.includePunctuation) modArr.push('punctuation');
          if (roomData.mods.longestWords) modArr.push('long_words');
          if (modArr.length > 0) modeStr = modArr.join('_');
        }

        const newScore = new Score({
          userId: player.userId,
          score: player.score,
          maxCombo: player.maxCombo,
          matchDuration: roomData.duration,
          survived: player.survived,
          mode: modeStr,
          isPvP: true
        });
        await newScore.save();
      } catch (err) {
        console.error('Failed to save score:', err);
      }
    }

    // Check if match is completely over (1 or 0 players left)
    const activePlayersCount = roomData.players.filter(id => {
      const p = players.get(id);
      return p && !p.isFinished;
    }).length;

    if (activePlayersCount <= 1 || roomData.alivePlayers.length <= 1) {
      roomData.status = 'finished';
      
      // If someone is still alive, they are 1st
      if (roomData.alivePlayers.length === 1) {
        const winnerId = roomData.alivePlayers[0];
        const winner = players.get(winnerId);
        if (winner) winner.rank = 1;
      }

      // Generate final leaderboard
      const results = roomData.players.map(id => {
        const p = players.get(id);
        return {
          id,
          username: p?.username || 'Guest',
          score: p?.score || 0,
          rank: p?.rank || 99,
          survived: p?.survived || false,
          metrics: p?.metrics
        };
      }).sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank; // Sort by rank first
        return b.score - a.score; // Tiebreaker score
      });

      // Assign ranks to survivors based on score
      let currentRank = 1;
      for (const r of results) {
        if (r.rank === 99) {
          r.rank = currentRank;
        }
        currentRank++;
      }

      io.to(player.roomId).emit('match_result', { leaderboard: results });
      // Clean up room
      rooms.delete(player.roomId);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      const roomData = rooms.get(player.roomId);
      if (roomData) {
        roomData.players = roomData.players.filter(id => id !== socket.id);
        roomData.alivePlayers = roomData.alivePlayers.filter(id => id !== socket.id);
        
        if (roomData.players.length === 0) {
          rooms.delete(player.roomId);
        } else {
          io.to(player.roomId).emit('opponent_disconnected', { id: socket.id });
          if (roomData.host === socket.id && roomData.status === 'waiting') {
            roomData.host = roomData.players[0]; // pass host
            io.to(player.roomId).emit('lobby_update', {
              players: roomData.players.map(id => {
                const p = players.get(id);
                return { id, username: p?.username || 'Guest', isHost: roomData.host === id };
              })
            });
          }
        }
      }
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
