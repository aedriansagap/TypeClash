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
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    background: 'radial-gradient(circle at center, #180926 0%, #0a0412 100%)',
    wordTyped: '#facc15',     // Cyber Yellow
    wordRemaining: '#38bdf8', // Neon Sky Blue
    wordJunk: '#f43f5e'       // Hot Pink
  },
  sakura: {
    id: 'sakura',
    name: 'Sakura Blossom',
    background: 'radial-gradient(circle at center, #3b1d2e 0%, #1a0b14 100%)',
    wordTyped: '#f472b6',     // Blossom Pink
    wordRemaining: '#fdf2f8', // Soft Rose White
    wordJunk: '#fb7185'       // Crimson Petal
  },
  nord: {
    id: 'nord',
    name: 'Nord Frost',
    background: 'radial-gradient(circle at center, #2e3440 0%, #1e222a 100%)',
    wordTyped: '#88c0d0',     // Arctic Frost Blue
    wordRemaining: '#eceff4', // Snow White
    wordJunk: '#bf616a'       // Aurora Red
  },
  dracula: {
    id: 'dracula',
    name: 'Dracula',
    background: 'radial-gradient(circle at center, #282a36 0%, #191a21 100%)',
    wordTyped: '#50fa7b',     // Dracula Green
    wordRemaining: '#f8f8f2', // Dracula Foreground
    wordJunk: '#ff5555'       // Dracula Red
  },
  monokai: {
    id: 'monokai',
    name: 'Monokai Pro',
    background: 'radial-gradient(circle at center, #2d2a2e 0%, #19181a 100%)',
    wordTyped: '#a9dc76',     // Monokai Green
    wordRemaining: '#ffd866', // Monokai Gold
    wordJunk: '#ff6188'       // Monokai Magenta
  }
};

export const FONTS = [
  { id: 'Inter', name: 'Inter (Default)' },
  { id: 'Roboto', name: 'Roboto' },
  { id: 'Courier New', name: 'Courier New (Monospace)' },
  { id: 'Comic Sans MS', name: 'Comic Sans MS' },
  { id: 'Times New Roman', name: 'Times New Roman' },
  { id: 'Trebuchet MS', name: 'Trebuchet MS' },
  { id: 'Impact', name: 'Impact (Heavy)' }
];

