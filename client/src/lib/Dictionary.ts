import seedrandom from 'seedrandom';
import english1k from './words/english_1k.json';
import english5k from './words/english_5k.json';
import englishLong from './words/english_long.json';

export interface GameModifiers {
  includeNumbers: boolean;
  includePunctuation: boolean;
  longestWords: boolean;
}

export enum Difficulty {
  EASY = 'EASY', // From top 1k words
  HARD = 'HARD', // From top 5k words
  JUNK = 'JUNK', // Random garbage characters
}

export class Dictionary {
  /**
   * Get a random word based on the specified difficulty, modifiers, and optional custom word pack.
   */
  static getWord(
    random: seedrandom.PRNG, 
    difficulty: Difficulty = Difficulty.EASY, 
    mods?: GameModifiers, 
    progressScore: number = 0,
    customWords?: string[]
  ): string {
    if (difficulty === Difficulty.JUNK) {
      return this.generateJunkWord(random, Math.floor(random() * 5) + 3 + Math.floor(progressScore * 3)); 
    }

    let wordList: string[] = [];
    
    if (customWords && customWords.length > 0) {
      wordList = customWords;
    } else if (mods?.longestWords) {
      wordList = englishLong.words;
    } else if (difficulty === Difficulty.EASY) {
      wordList = english1k.words;
    } else if (difficulty === Difficulty.HARD) {
      wordList = english5k.words;
    }

    // Determine target lengths based on progressScore when not using custom word packs
    let filtered = wordList;
    if (!customWords || customWords.length === 0) {
      let minLength = 1;
      let maxLength = 99;
      
      if (mods?.longestWords) {
        // Brutal scaling for long words
        minLength = 6 + Math.floor(progressScore * 3);
        maxLength = 10 + Math.floor(progressScore * 4);
      } else {
        // Normal modes scaling
        minLength = 1 + Math.floor(progressScore * 2);
        maxLength = 5 + Math.floor(progressScore * 3);
      }

      filtered = wordList.filter(w => w.length >= minLength && w.length <= maxLength);
      
      // Fallback logic if filters are too strict
      if (filtered.length === 0) {
        filtered = wordList.filter(w => w.length >= minLength);
        if (filtered.length === 0) {
          filtered = wordList;
        }
      }
    }


    const randomIndex = Math.floor(random() * filtered.length);
    let word = filtered[randomIndex];

    if (mods) {
      if (mods.includePunctuation && random() < 0.4) {
        const punctuations = [
          (w: string) => `${w}.`,
          (w: string) => `${w},`,
          (w: string) => `${w}?`,
          (w: string) => `${w}!`,
          (w: string) => `"${w}"`,
          (w: string) => `(${w})`,
          (w: string) => `${w};`,
          (w: string) => `${w}:`,
        ];
        const pIndex = Math.floor(random() * punctuations.length);
        word = punctuations[pIndex](word);
      }
      
      if (mods.includeNumbers && random() < 0.4) {
        const number = Math.floor(random() * 100);
        if (random() < 0.5) {
          word = `${word}${number}`;
        } else {
          word = `${number}${word}`;
        }
      }
    }

    return word;
  }

  /**
   * Helper specifically for getting junk words.
   */
  static getJunkWord(random: seedrandom.PRNG): string {
    return this.generateJunkWord(random, Math.floor(random() * 5) + 3);
  }

  /**
   * Generates a random alphanumeric and symbol string.
   */
  private static generateJunkWord(random: seedrandom.PRNG, length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(random() * chars.length));
    }
    return result;
  }
}
