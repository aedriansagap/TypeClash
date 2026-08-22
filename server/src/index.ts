import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Score, RaidScore } from './models';


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

const isValidUsername = (username: string) => /^[a-zA-Z0-9_]{3,20}$/.test(username);

export const getTier = (rating: number = 1200): string => {
  if (rating >= 2200) return 'Grandmaster';
  if (rating >= 1900) return 'Diamond';
  if (rating >= 1600) return 'Platinum';
  if (rating >= 1300) return 'Gold';
  if (rating >= 1000) return 'Silver';
  return 'Bronze';
};

export interface EloParticipant {
  id: string; // socketId
  userId?: string;
  rating: number;
  rank: number;
}

export interface EloResult {
  id: string;
  userId?: string;
  oldRating: number;
  newRating: number;
  change: number;
  tier: string;
}

export const calculateMultiplayerElo = (participants: EloParticipant[], K: number = 32): Record<string, EloResult> => {
  const n = participants.length;
  const results: Record<string, EloResult> = {};

  if (n <= 1) {
    for (const p of participants) {
      results[p.id] = {
        id: p.id,
        userId: p.userId,
        oldRating: p.rating,
        newRating: p.rating,
        change: 0,
        tier: getTier(p.rating)
      };
    }
    return results;
  }

  for (let i = 0; i < n; i++) {
    const pA = participants[i];
    let totalChange = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const pB = participants[j];

      // Expected score for A against B
      const expectedA = 1 / (1 + Math.pow(10, (pB.rating - pA.rating) / 400));

      // Actual score for A against B (1 if higher rank/lower rank number, 0.5 if tie, 0 if lost)
      let actualA = 0.5;
      if (pA.rank < pB.rank) {
        actualA = 1.0;
      } else if (pA.rank > pB.rank) {
        actualA = 0.0;
      }

      totalChange += (actualA - expectedA);
    }

    const scaledChange = Math.round((K / (n - 1)) * totalChange);
    const newRating = Math.max(100, pA.rating + scaledChange);

    results[pA.id] = {
      id: pA.id,
      userId: pA.userId,
      oldRating: pA.rating,
      newRating,
      change: scaledChange,
      tier: getTier(newRating)
    };
  }

  return results;
};

// --- AUTHENTICATION API --- //

const generateToken = (userId: string, username: string, isGuest: boolean) => {
  return jwt.sign({ id: userId, username, isGuest }, JWT_SECRET, { expiresIn: '7d' });
};

// 1. Guest Login
app.post('/api/auth/guest', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (!isValidUsername(username)) return res.status(400).json({ error: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.' });
  try {
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username, isGuest: true, rating: 1200 });
      await user.save();
    } else if (!user.isGuest) {
      return res.status(403).json({ error: 'Username is registered. Please log in with a password.' });
    }
    const token = generateToken(user._id.toString(), user.username, true);
    const userRating = user.rating ?? 1200;
    res.json({
      id: user._id,
      username: user.username,
      token,
      isGuest: true,
      rating: userRating,
      tier: getTier(userRating),
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
      customization: user.customization
    });
  } catch(e: any) {
    console.error('Auth error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// 2. Register (or convert Guest to Registered)
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!isValidUsername(username)) return res.status(400).json({ error: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  
  try {
    let user = await User.findOne({ username });
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    if (user) {
      if (user.isGuest) {
        // Upgrade guest account to permanent
        user.isGuest = false;
        user.passwordHash = passwordHash;
        if (!user.rating) user.rating = 1200;
        await user.save();
      } else {
        return res.status(409).json({ error: 'Username already taken' });
      }
    } else {
      user = new User({ username, passwordHash, isGuest: false, rating: 1200 });
      await user.save();
    }

    const token = generateToken(user._id.toString(), user.username, false);
    const userRating = user.rating ?? 1200;
    res.json({
      id: user._id,
      username: user.username,
      token,
      isGuest: false,
      rating: userRating,
      tier: getTier(userRating),
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
      customization: user.customization
    });
  } catch (e: any) {
    console.error('Register error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username format.' });
  
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
    const userRating = user.rating ?? 1200;
    res.json({
      id: user._id,
      username: user.username,
      token,
      isGuest: false,
      rating: userRating,
      tier: getTier(userRating),
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
      customization: user.customization
    });
  } catch (e: any) {
    console.error('Login error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

// 4. OAuth SSO / Third-Party Provider Login (Google, GitHub)
app.post('/api/auth/oauth', async (req, res) => {
  const { provider, oauthId, email, username: requestedUsername, guestUserId } = req.body;
  if (!oauthId || !email) {
    return res.status(400).json({ error: 'OAuth ID and email are required' });
  }

  try {
    let user: any = null;

    if (guestUserId) {
      user = await User.findById(guestUserId);
      if (user && user.isGuest) {
        user.isGuest = false;
        const baseUsername = (requestedUsername || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 18);
        let uniqueUsername = baseUsername;
        let counter = 1;
        while (await User.findOne({ username: uniqueUsername, _id: { $ne: user._id } })) {
          uniqueUsername = `${baseUsername.substring(0, 14)}_${counter++}`;
        }
        user.username = uniqueUsername;
        await user.save();
      }
    }

    if (!user) {
      const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 18);
      user = await User.findOne({ username: emailPrefix });
    }

    if (!user) {
      const baseUsername = (requestedUsername || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 18);
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (await User.findOne({ username: uniqueUsername })) {
        uniqueUsername = `${baseUsername.substring(0, 14)}_${counter++}`;
      }
      user = new User({
        username: uniqueUsername,
        isGuest: false,
        rating: 1200
      });
      await user.save();
    }

    const token = generateToken(user._id.toString(), user.username, false);
    const userRating = user.rating ?? 1200;
    res.json({
      id: user._id,
      username: user.username,
      token,
      isGuest: false,
      rating: userRating,
      tier: getTier(userRating),
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
      customization: user.customization
    });
  } catch (e: any) {
    console.error('OAuth error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});


// --- LEADERBOARD API --- //

app.get('/api/daily', (req, res) => {
  const dateStr = new Date().toISOString().split('T')[0];
  res.json({ seed: dateStr });
});

// Ranked Global Leaderboard (Top Players by Elo)
app.get('/api/leaderboard/ranked', async (req, res) => {
  try {
    const topUsers = await User.find({ isGuest: false })
      .sort({ rating: -1 })
      .limit(50)
      .select('username rating wins losses createdAt');

    res.json(topUsers.map((u, index) => ({
      rank: index + 1,
      username: u.username,
      rating: u.rating ?? 1200,
      tier: getTier(u.rating ?? 1200),
      wins: u.wins ?? 0,
      losses: u.losses ?? 0,
      joinedDate: u.createdAt
    })));
  } catch (e: any) {
    console.error('Ranked leaderboard error:', e);
    res.status(500).json({ error: `Database error: ${e.message}` });
  }
});

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
      rating: s.user.rating ?? 1200,
      tier: getTier(s.user.rating ?? 1200),
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
      eloChange: s.eloChange,
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

    const userRating = user.rating ?? 1200;

    res.json({
      username: user.username,
      rating: userRating,
      tier: getTier(userRating),
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
      ratingHistory: user.ratingHistory?.slice(-20) || [],
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
  const { userId, fontFamily, theme, title, hudSettings } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (fontFamily) user.customization.fontFamily = fontFamily;
    if (theme) user.customization.theme = theme;
    if (title) user.customization.title = title;
    if (hudSettings) {
      user.customization.hudSettings = {
        ...(user.customization.hudSettings || {}),
        ...hudSettings
      };
    }
    
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
    if (mode && mode.startsWith('daily_')) {
      const existing = await Score.findOne({ userId, mode });
      if (existing) return res.status(403).json({ error: 'You have already played the Daily Challenge today!' });
    }
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

// --- RAID BOSS API --- //

const inMemoryRaidScores: any[] = [];

app.get(['/api/leaderboard/raids', '/api/leaderboard/raids/:bossId'], async (req: any, res) => {
  const bossId = req.params.bossId;
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    try {
      const filter = bossId && bossId !== 'all' ? { bossId } : {};
      const raids = await RaidScore.find(filter)
        .sort({ clearTimeSeconds: 1, totalTeamDamage: -1 })
        .limit(30);
      
      if (raids && raids.length > 0) {
        return res.json(raids);
      }
    } catch (err) {
      console.error('Raid leaderboard db error:', err);
    }
  }

  // Instant in-memory cache
  let filtered = inMemoryRaidScores;
  if (bossId && bossId !== 'all') {
    filtered = filtered.filter(r => r.bossId === bossId);
  }
  res.json(filtered.slice(0, 30));
});

app.post('/api/raid/victory', async (req, res) => {
  const { bossId, bossName, difficulty, partyMembers, totalTeamDamage, clearTimeSeconds } = req.body;
  if (!bossId || !partyMembers) return res.status(400).json({ error: 'Missing raid victory data' });
  
  const record = {
    bossId,
    bossName,
    difficulty: difficulty || 'normal',
    partyMembers,
    totalTeamDamage,
    clearTimeSeconds,
    survived: true,
    createdAt: new Date()
  };
  inMemoryRaidScores.unshift(record);

  if (mongoose.connection.readyState === 1) {
    new RaidScore(record).save().catch(e => console.error('Error saving raid score:', e));
  }
  res.json({ success: true, id: 'raid_' + Date.now() });
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
  rating?: number;
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

interface RaidPlayer {
  id: string;
  roomId: string;
  userId?: string;
  username: string;
  rating: number;
  isReady: boolean;
  damageDealt: number;
  wpm: number;
  accuracy: number;
  lives: number;
  isDead: boolean;
  isHost: boolean;
}

interface RaidRoomData {
  id: string;
  bossId: string;
  bossName: string;
  difficulty: 'normal' | 'heroic' | 'mythic';
  hostId: string;
  players: string[];
  maxHp: number;
  currentHp: number;
  shieldHp: number;
  shieldMaxHp: number;
  phase: number;
  status: 'lobby' | 'playing' | 'victory' | 'defeat';
  startTime?: number;
}

const players = new Map<string, Player>();
const rooms = new Map<string, RoomData>();
const raidPlayers = new Map<string, RaidPlayer>();
const raidRooms = new Map<string, RaidRoomData>();

let matchmakingQueue: Array<{
  socketId: string;
  duration: number;
  userId?: string;
  username?: string;
  rating: number;
  modString: string;
  mods?: any;
  joinedAt: number;
}> = [];

// Matchmaking Loop with Dynamic SBMM Window Expansion
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
      // Find oldest waiting player
      const oldest = group.reduce((prev, curr) => (curr.joinedAt < prev.joinedAt ? curr : prev));
      const elapsedSeconds = (Date.now() - oldest.joinedAt) / 1000;
      
      // Expand Elo search tolerance window over time (±150 initially, +50 every 3s, infinite after 12s)
      const tolerance = elapsedSeconds >= 12 ? Infinity : 150 + Math.floor(elapsedSeconds / 3) * 50;
      const compatible = group.filter(p => Math.abs(p.rating - oldest.rating) <= tolerance || tolerance === Infinity);

      if (compatible.length >= 2 && (compatible.length >= 10 || elapsedSeconds > 3)) {
        const matchPlayers = compatible.slice(0, 10);
        matchmakingQueue = matchmakingQueue.filter(p => !matchPlayers.some(mp => mp.socketId === p.socketId));

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
              id: p.socketId,
              roomId,
              isFinished: false,
              score: 0,
              maxCombo: 0,
              survived: false, 
              userId: p.userId,
              username: p.username,
              rating: p.rating
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
            const r = p?.rating || 1200;
            return { id, username: p?.username || 'Guest', rating: r, tier: getTier(r) };
          })
        });
      }
    }
  }
}, 1500);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_room', async (data: { roomId: string, duration?: number, userId?: string, username?: string, mods?: any }) => {
    let { roomId, duration = 60, userId, username, mods } = data;
    if (typeof roomId !== 'string' || roomId.length > 10) return;
    if (username && !isValidUsername(username)) username = 'Guest';
    
    let userRating = 1200;
    if (userId && mongoose.connection.readyState === 1) {
      try {
        const u = await User.findById(userId);
        if (u && u.rating) userRating = u.rating;
      } catch (e) {}
    }

    socket.join(roomId);
    
    players.set(socket.id, { 
      id: socket.id, 
      roomId,
      isFinished: false,
      score: 0,
      maxCombo: 0,
      survived: false,
      userId,
      username,
      rating: userRating
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
        const r = p?.rating || 1200;
        return { id, username: p?.username || 'Guest', rating: r, tier: getTier(r), isHost: roomData?.host === id };
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
          const r = p?.rating || 1200;
          return { id, username: p?.username || 'Guest', rating: r, tier: getTier(r) };
        })
      });
    }
  });

  socket.on('find_match', async (data: { duration?: number, userId?: string, username?: string, mods?: any }) => {
    let { duration = 60, userId, username, mods } = data;
    if (username && !isValidUsername(username)) username = 'Guest';
    const modString = JSON.stringify(mods || {});
    
    let userRating = 1200;
    if (userId && mongoose.connection.readyState === 1) {
      try {
        const u = await User.findById(userId);
        if (u && u.rating) userRating = u.rating;
      } catch (e) {}
    }

    if (!matchmakingQueue.some(p => p.socketId === socket.id)) {
      matchmakingQueue.push({ socketId: socket.id, duration, userId, username, rating: userRating, modString, mods, joinedAt: Date.now() });
    }
    socket.emit('searching_for_match', { rating: userRating, tier: getTier(userRating) });
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

  socket.on('use_powerup', (type: string) => {
    const player = players.get(socket.id);
    if (!player) return;
    const roomData = rooms.get(player.roomId);
    if (!roomData) return;
    
    const aliveOpponents = roomData.alivePlayers.filter(id => id !== socket.id);
    if (aliveOpponents.length > 0) {
      const targetId = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
      io.to(targetId).emit('receive_powerup', type);
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
    
    // Assign provisional rank if died
    if (!player.survived) {
      player.rank = roomData.alivePlayers.length + 1;
    }

    io.to(player.roomId).emit('player_died', {
      id: socket.id,
      rank: player.rank,
      score: player.score
    });

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
          metrics: p?.metrics,
          userId: p?.userId,
          rating: p?.rating || 1200
        };
      }).sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank; // Sort by rank first
        return b.score - a.score; // Tiebreaker score
      });

      // Assign sequential ranks
      let currentRank = 1;
      for (const r of results) {
        if (r.rank === 99 || r.survived) {
          r.rank = currentRank;
        }
        currentRank++;
      }

      // Calculate Multiplayer Elo changes
      const participants: EloParticipant[] = results.map(r => ({
        id: r.id,
        userId: r.userId,
        rating: r.rating,
        rank: r.rank
      }));
      const eloResults = calculateMultiplayerElo(participants);

      // Save scores and update user ratings in MongoDB
      if (mongoose.connection.readyState === 1) {
        let modeStr = 'vanilla';
        if (roomData.mods) {
          const modArr = [];
          if (roomData.mods.includeNumbers) modArr.push('numbers');
          if (roomData.mods.includePunctuation) modArr.push('punctuation');
          if (roomData.mods.longestWords) modArr.push('long_words');
          if (modArr.length > 0) modeStr = modArr.join('_');
        }

        for (const r of results) {
          if (r.userId) {
            try {
              const eloData = eloResults[r.id];
              const newScore = new Score({
                userId: r.userId,
                score: r.score,
                maxCombo: players.get(r.id)?.maxCombo || 0,
                matchDuration: roomData.duration,
                survived: r.survived,
                mode: modeStr,
                isPvP: true,
                eloChange: eloData?.change || 0
              });
              await newScore.save();

              const userDoc = await User.findById(r.userId);
              if (userDoc) {
                userDoc.rating = eloData?.newRating ?? (userDoc.rating || 1200);
                if (r.rank === 1) {
                  userDoc.wins = (userDoc.wins || 0) + 1;
                } else {
                  userDoc.losses = (userDoc.losses || 0) + 1;
                }
                userDoc.ratingHistory = userDoc.ratingHistory || [];
                userDoc.ratingHistory.push({
                  rating: userDoc.rating,
                  change: eloData?.change || 0,
                  matchId: newScore._id as any,
                  date: new Date()
                });
                if (userDoc.ratingHistory.length > 50) {
                  userDoc.ratingHistory = userDoc.ratingHistory.slice(-50);
                }
                await userDoc.save();
              }
            } catch (saveErr) {
              console.error('Failed to save score or update Elo for user:', r.userId, saveErr);
            }
          }
        }
      }

      io.to(player.roomId).emit('match_result', {
        leaderboard: results.map(r => ({
          id: r.id,
          username: r.username,
          score: r.score,
          rank: r.rank,
          survived: r.survived,
          metrics: r.metrics,
          rating: r.rating,
          tier: getTier(r.rating)
        })),
        eloChanges: eloResults
      });

      // Clean up room
      rooms.delete(player.roomId);
    }
  });

  // ==========================================
  // --- CO-OP RAID BOSS SOCKET HANDLERS --- //
  // ==========================================

  socket.on('create_raid_lobby', ({ bossId, bossName, difficulty, userId, username, rating }) => {
    const roomId = 'RAID-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.join(roomId);

    const baseHp = bossId === 'chronos' ? 6500 : bossId === 'glitch' ? 4500 : 3000;
    const diffMult = difficulty === 'mythic' ? 2.2 : difficulty === 'heroic' ? 1.5 : 1.0;
    const initialHp = Math.round(baseHp * diffMult);

    const raidRoom: RaidRoomData = {
      id: roomId,
      bossId: bossId || 'ignis',
      bossName: bossName || 'Ignis, Flame Colossus',
      difficulty: difficulty || 'normal',
      hostId: socket.id,
      players: [socket.id],
      maxHp: initialHp,
      currentHp: initialHp,
      shieldHp: 0,
      shieldMaxHp: 0,
      phase: 1,
      status: 'lobby'
    };

    raidRooms.set(roomId, raidRoom);
    raidPlayers.set(socket.id, {
      id: socket.id,
      roomId,
      userId,
      username: username || 'Raid Leader',
      rating: rating || 1200,
      isReady: true, // Host is ready by default
      damageDealt: 0,
      wpm: 0,
      accuracy: 100,
      lives: 4,
      isDead: false,
      isHost: true
    });

    socket.emit('raid_lobby_created', { roomId, room: raidRoom });
    io.to(roomId).emit('raid_lobby_update', {
      roomId,
      bossId: raidRoom.bossId,
      bossName: raidRoom.bossName,
      difficulty: raidRoom.difficulty,
      hostId: raidRoom.hostId,
      players: raidRoom.players.map(pId => raidPlayers.get(pId))
    });
  });

  socket.on('join_raid_lobby', ({ roomId, userId, username, rating }) => {
    const normalizedRoomId = roomId ? roomId.trim().toUpperCase() : '';
    const room = raidRooms.get(normalizedRoomId);

    if (!room) {
      return socket.emit('raid_error', { message: 'Raid room not found' });
    }
    if (room.status !== 'lobby') {
      return socket.emit('raid_error', { message: 'Raid is already in combat' });
    }
    if (room.players.length >= 4) {
      return socket.emit('raid_error', { message: 'Raid party is full (Max 4 players)' });
    }

    socket.join(normalizedRoomId);
    room.players.push(socket.id);

    raidPlayers.set(socket.id, {
      id: socket.id,
      roomId: normalizedRoomId,
      userId,
      username: username || `Raider_${room.players.length}`,
      rating: rating || 1200,
      isReady: false,
      damageDealt: 0,
      wpm: 0,
      accuracy: 100,
      lives: 4,
      isDead: false,
      isHost: false
    });

    io.to(normalizedRoomId).emit('raid_lobby_update', {
      roomId: normalizedRoomId,
      bossId: room.bossId,
      bossName: room.bossName,
      difficulty: room.difficulty,
      hostId: room.hostId,
      players: room.players.map(pId => raidPlayers.get(pId))
    });
  });

  socket.on('toggle_raid_ready', ({ roomId }) => {
    const player = raidPlayers.get(socket.id);
    if (player && player.roomId === roomId && !player.isHost) {
      player.isReady = !player.isReady;
      const room = raidRooms.get(roomId);
      if (room) {
        io.to(roomId).emit('raid_lobby_update', {
          roomId,
          bossId: room.bossId,
          bossName: room.bossName,
          difficulty: room.difficulty,
          hostId: room.hostId,
          players: room.players.map(pId => raidPlayers.get(pId))
        });
      }
    }
  });

  socket.on('start_raid_match', ({ roomId }) => {
    const room = raidRooms.get(roomId);
    const player = raidPlayers.get(socket.id);
    if (!room || !player || !player.isHost) return;

    // Check all ready
    const allReady = room.players.every(pId => raidPlayers.get(pId)?.isReady);
    if (!allReady) {
      return socket.emit('raid_error', { message: 'All party members must be ready before engaging!' });
    }

    room.status = 'playing';
    room.startTime = Date.now();

    // Scale HP for party size: 1 + (partySize - 1) * 0.75
    const partySize = room.players.length;
    const baseHp = room.bossId === 'chronos' ? 6500 : room.bossId === 'glitch' ? 4500 : 3000;
    const diffMult = room.difficulty === 'mythic' ? 2.2 : room.difficulty === 'heroic' ? 1.5 : 1.0;
    const coopMult = 1 + (partySize - 1) * 0.75;
    const totalMaxHp = Math.round(baseHp * diffMult * coopMult);

    room.maxHp = totalMaxHp;
    room.currentHp = totalMaxHp;
    room.phase = 1;

    // Reset player combat stats
    room.players.forEach(pId => {
      const rp = raidPlayers.get(pId);
      if (rp) {
        rp.damageDealt = 0;
        rp.lives = 4;
        rp.isDead = false;
      }
    });

    const seed = Math.random().toString();
    io.to(roomId).emit('raid_match_start', {
      roomId,
      seed,
      bossId: room.bossId,
      bossName: room.bossName,
      difficulty: room.difficulty,
      maxHp: room.maxHp,
      currentHp: room.currentHp,
      partySize,
      players: room.players.map(pId => raidPlayers.get(pId))
    });
  });

  socket.on('raid_damage_dealt', ({ roomId, damage, isCrit, wpm, accuracy }) => {
    const room = raidRooms.get(roomId);
    const player = raidPlayers.get(socket.id);
    if (!room || !player || room.status !== 'playing') return;

    player.damageDealt += damage;
    if (wpm !== undefined) player.wpm = wpm;
    if (accuracy !== undefined) player.accuracy = accuracy;

    // Apply damage to shield or HP
    if (room.shieldHp > 0) {
      room.shieldHp = Math.max(0, room.shieldHp - damage);
    } else {
      room.currentHp = Math.max(0, room.currentHp - damage);
    }

    // Check Phase 2
    if (room.phase === 1 && room.currentHp <= room.maxHp * 0.5 && room.currentHp > 0) {
      room.phase = 2;
      io.to(roomId).emit('raid_boss_phase_change', { phase: 2 });
    }

    // Broadcast updated boss HP and live team stats
    io.to(roomId).emit('raid_boss_hp_sync', {
      currentHp: room.currentHp,
      maxHp: room.maxHp,
      shieldHp: room.shieldHp,
      dealerId: socket.id,
      dealerName: player.username,
      damage,
      isCrit
    });

    io.to(roomId).emit('raid_team_stats_sync', {
      players: room.players.map(pId => raidPlayers.get(pId))
    });

    // Check Raid Victory
    if (room.currentHp <= 0) {
      room.status = 'victory';
      const clearTimeSeconds = Math.round((Date.now() - (room.startTime || Date.now())) / 1000);
      const totalTeamDamage = room.players.reduce((sum, pId) => sum + (raidPlayers.get(pId)?.damageDealt || 0), 0);

      const partyMembers = room.players.map(pId => {
        const rp = raidPlayers.get(pId)!;
        return {
          userId: rp.userId as any,
          username: rp.username,
          damageDealt: rp.damageDealt,
          wpm: rp.wpm,
          accuracy: rp.accuracy,
          survived: !rp.isDead
        };
      });

      const raidScoreRecord = {
        bossId: room.bossId,
        bossName: room.bossName,
        difficulty: room.difficulty,
        partyMembers,
        totalTeamDamage,
        clearTimeSeconds,
        survived: true,
        createdAt: new Date()
      };
      inMemoryRaidScores.unshift(raidScoreRecord);

      // Save to database asynchronously
      new RaidScore(raidScoreRecord).save().catch(e => console.error('Error saving raid score:', e));


      io.to(roomId).emit('raid_victory_all', {
        bossId: room.bossId,
        bossName: room.bossName,
        difficulty: room.difficulty,
        clearTimeSeconds,
        totalTeamDamage,
        rankings: room.players.map(pId => raidPlayers.get(pId)).sort((a, b) => (b?.damageDealt || 0) - (a?.damageDealt || 0))
      });

      raidRooms.delete(roomId);
    }
  });

  socket.on('raid_boss_spell_cast', ({ roomId, abilityId }) => {
    const room = raidRooms.get(roomId);
    if (room && room.status === 'playing') {
      if (abilityId === 'data_barrier') {
        room.shieldMaxHp = 1200;
        room.shieldHp = 1200;
      }
      io.to(roomId).emit('raid_boss_spell_trigger', { abilityId, shieldHp: room.shieldHp });
    }
  });

  socket.on('raid_player_death', ({ roomId }) => {
    const room = raidRooms.get(roomId);
    const player = raidPlayers.get(socket.id);
    if (!room || !player) return;

    player.isDead = true;
    player.lives = 0;

    io.to(roomId).emit('raid_player_down', { id: socket.id, username: player.username });

    const allDead = room.players.every(pId => raidPlayers.get(pId)?.isDead);
    if (allDead) {
      room.status = 'defeat';
      io.to(roomId).emit('raid_defeat_all', {
        bossId: room.bossId,
        bossName: room.bossName,
        remainingBossHp: room.currentHp,
        maxHp: room.maxHp
      });
      raidRooms.delete(roomId);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    matchmakingQueue = matchmakingQueue.filter(p => p.socketId !== socket.id);
    
    // Clean up Raid Lobbies
    const raidPlayer = raidPlayers.get(socket.id);
    if (raidPlayer) {
      const room = raidRooms.get(raidPlayer.roomId);
      if (room) {
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          raidRooms.delete(raidPlayer.roomId);
        } else {
          if (room.hostId === socket.id && room.status === 'lobby') {
            room.hostId = room.players[0];
            const nextHost = raidPlayers.get(room.hostId);
            if (nextHost) nextHost.isHost = true;
          }
          io.to(raidPlayer.roomId).emit('raid_lobby_update', {
            roomId: room.id,
            bossId: room.bossId,
            bossName: room.bossName,
            difficulty: room.difficulty,
            hostId: room.hostId,
            players: room.players.map(pId => raidPlayers.get(pId))
          });
        }
      }
      raidPlayers.delete(socket.id);
    }
    
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
                const r = p?.rating || 1200;
                return { id, username: p?.username || 'Guest', rating: r, tier: getTier(r), isHost: roomData.host === id };
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

