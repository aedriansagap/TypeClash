import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  passwordHash?: string;
  isGuest: boolean;
  createdAt: Date;
  customization: {
    fontFamily: string;
    theme: string;
  };
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  customization: {
    fontFamily: { type: String, default: 'Inter' },
    theme: { type: String, default: 'dark' }
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
  createdAt: { type: Date, default: Date.now }
});

export const Score = mongoose.model<IScore>('Score', ScoreSchema);
