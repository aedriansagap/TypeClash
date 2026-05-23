import english1k from './words/english_1k.json';
import english5k from './words/english_5k.json';

export enum Difficulty {
  EASY = 'EASY', // From top 1k words
  HARD = 'HARD', // From top 5k words
  JUNK = 'JUNK', // Random garbage characters
}

export class Dictionary {
  /**
   * Get a random word based on the specified difficulty.
   */
  static getWord(difficulty: Difficulty = Difficulty.EASY): string {
    let wordList: string[] = [];
    
    if (difficulty === Difficulty.EASY) {
      wordList = english1k.words;
    } else if (difficulty === Difficulty.HARD) {
      wordList = english5k.words;
    } else if (difficulty === Difficulty.JUNK) {
      return this.generateJunkWord(Math.floor(Math.random() * 5) + 3); // 3-7 chars
    }

    const randomIndex = Math.floor(Math.random() * wordList.length);
    return wordList[randomIndex];
  }

  /**
   * Helper specifically for getting junk words.
   */
  static getJunkWord(): string {
    return this.generateJunkWord(Math.floor(Math.random() * 5) + 3);
  }

  /**
   * Generates a random alphanumeric and symbol string.
   */
  private static generateJunkWord(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
