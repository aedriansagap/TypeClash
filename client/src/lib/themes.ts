export interface ThemeConfig {
  id: string;
  name: string;
  background: string;
  wordTyped: string;
  wordRemaining: string;
  wordJunk: string;
}

export const THEMES: Record<string, ThemeConfig> = {
  dark: {
    id: 'dark',
    name: 'Dark (Default)',
    background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
    wordTyped: '#4ade80',     // Green
    wordRemaining: '#ffffff', // White
    wordJunk: '#f87171'       // Red
  },
  light: {
    id: 'light',
    name: 'Light Mode',
    background: 'radial-gradient(circle at center, #f8fafc 0%, #e2e8f0 100%)',
    wordTyped: '#3b82f6',     // Blue
    wordRemaining: '#1e293b', // Dark Slate
    wordJunk: '#ef4444'       // Red
  },
  matrix: {
    id: 'matrix',
    name: 'The Matrix',
    background: '#000000',
    wordTyped: '#ffffff',     // White
    wordRemaining: '#22c55e', // Bright Green
    wordJunk: '#dc2626'       // Darker red
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave',
    background: 'linear-gradient(180deg, #2e1065 0%, #7e22ce 50%, #db2777 100%)',
    wordTyped: '#22d3ee',     // Neon Cyan
    wordRemaining: '#fdf4ff', // Pinkish White
    wordJunk: '#f43f5e'       // Neon Pink/Red
  }
};

export const FONTS = [
  { id: 'Inter', name: 'Inter (Default)' },
  { id: 'Roboto', name: 'Roboto' },
  { id: 'Courier New', name: 'Courier New (Monospace)' },
  { id: 'Comic Sans MS', name: 'Comic Sans MS' },
  { id: 'Times New Roman', name: 'Times New Roman' }
];
