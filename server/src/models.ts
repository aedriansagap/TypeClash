import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  isGuest: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>('User', UserSchema);

export interface IScore extends Document {
  userId: mongoose.Types.ObjectId;
  score: number;
  maxCombo: number;
  matchDuration: number; // in seconds (60, 180, 300)
  survived: boolean;
  createdAt: Date;
}

const ScoreSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true },
  maxCombo: { type: Number, required: true },
  matchDuration: { type: Number, required: true },
  survived: { type: Boolean, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Score = mongoose.model<IScore>('Score', ScoreSchema);
