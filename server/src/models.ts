import mongoose, { Schema, Document } from 'mongoose';

export interface IRatingHistory {
  rating: number;
  change: number;
  matchId?: mongoose.Types.ObjectId;
  date: Date;
}

export interface IUser extends Document {
  username: string;
  passwordHash?: string;
  isGuest: boolean;
  createdAt: Date;
  rating: number;
  ratingHistory: IRatingHistory[];
  wins: number;
  losses: number;
  customization: {
    fontFamily: string;
    theme: string;
    title?: string;
    hudSettings?: {
      showWpm?: boolean;
      showAccuracy?: boolean;
      showCombo?: boolean;
      sfxVolume?: number;
      bgmVolume?: number;
    };
  };
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  rating: { type: Number, default: 1200 },
  ratingHistory: [{
    rating: { type: Number, required: true },
    change: { type: Number, required: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'Score' },
    date: { type: Date, default: Date.now }
  }],
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  customization: {
    fontFamily: { type: String, default: 'Inter' },
    theme: { type: String, default: 'dark' },
    title: { type: String, default: 'Novice Typer' },
    hudSettings: {
      showWpm: { type: Boolean, default: true },
      showAccuracy: { type: Boolean, default: true },
      showCombo: { type: Boolean, default: true },
      sfxVolume: { type: Number, default: 0.8 },
      bgmVolume: { type: Number, default: 0.6 }
    }
  }
});


export const User = mongoose.model<IUser>('User', UserSchema);

export interface IScore extends Document {
  userId: mongoose.Types.ObjectId;
  score: number;
  maxCombo: number;
  matchDuration: number; // in seconds (60, 180, 300)
  survived: boolean;
  mode: string;
  isPvP: boolean;
  eloChange?: number;
  createdAt: Date;
}

const ScoreSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true },
  maxCombo: { type: Number, default: 0 },
  matchDuration: { type: Number, required: true }, // e.g., 60, 180, 300 seconds
  survived: { type: Boolean, default: false },
  mode: { type: String, default: 'vanilla' }, // e.g., 'vanilla', 'numbers', 'long_words'
  isPvP: { type: Boolean, default: false },
  eloChange: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

export const Score = mongoose.model<IScore>('Score', ScoreSchema);

export interface IRaidScore extends Document {
  bossId: string;
  bossName: string;
  difficulty: string;
  partyMembers: Array<{
    userId?: mongoose.Types.ObjectId;
    username: string;
    damageDealt: number;
    wpm: number;
    accuracy: number;
    survived: boolean;
  }>;
  totalTeamDamage: number;
  clearTimeSeconds: number;
  survived: boolean;
  createdAt: Date;
}

const RaidScoreSchema: Schema = new Schema({
  bossId: { type: String, required: true },
  bossName: { type: String, required: true },
  difficulty: { type: String, default: 'normal' },
  partyMembers: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, required: true },
    damageDealt: { type: Number, required: true },
    wpm: { type: Number, default: 0 },
    accuracy: { type: Number, default: 100 },
    survived: { type: Boolean, default: true }
  }],
  totalTeamDamage: { type: Number, required: true },
  clearTimeSeconds: { type: Number, required: true },
  survived: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export const RaidScore = mongoose.model<IRaidScore>('RaidScore', RaidScoreSchema);


