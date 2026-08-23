// Keyboard Layout Definitions, Finger Ergonomics Mapping, and Telemetry Engine

export type KeyboardLayoutId = 'qwerty' | 'dvorak' | 'colemak';
export type HeatmapMetric = 'frequency' | 'accuracy' | 'latency';

export type FingerId = 'LP' | 'LR' | 'LM' | 'LI' | 'TH' | 'RI' | 'RM' | 'RR' | 'RP';

export interface FingerInfo {
  id: FingerId;
  name: string;
  hand: 'left' | 'right';
  color: string;
}

export const FINGERS: Record<FingerId, FingerInfo> = {
  LP: { id: 'LP', name: 'Left Pinky', hand: 'left', color: '#f43f5e' },
  LR: { id: 'LR', name: 'Left Ring', hand: 'left', color: '#fb923c' },
  LM: { id: 'LM', name: 'Left Middle', hand: 'left', color: '#facc15' },
  LI: { id: 'LI', name: 'Left Index', hand: 'left', color: '#4ade80' },
  TH: { id: 'TH', name: 'Thumbs', hand: 'left', color: '#38bdf8' },
  RI: { id: 'RI', name: 'Right Index', hand: 'right', color: '#60a5fa' },
  RM: { id: 'RM', name: 'Right Middle', hand: 'right', color: '#a855f7' },
  RR: { id: 'RR', name: 'Right Ring', hand: 'right', color: '#ec4899' },
  RP: { id: 'RP', name: 'Right Pinky', hand: 'right', color: '#f43f5e' }
};

export interface KeyCapDef {
  code: string;
  label: string;
  shiftLabel?: string;
  finger: FingerId;
  width?: number; // 1.0 = normal, 1.5 = tab, etc.
}

export interface KeyboardRow {
  keys: KeyCapDef[];
}

export interface KeyboardLayoutDef {
  id: KeyboardLayoutId;
  name: string;
  rows: KeyboardRow[];
}

// 1. QWERTY Layout Matrix
export const QWERTY_LAYOUT: KeyboardLayoutDef = {
  id: 'qwerty',
  name: 'Standard QWERTY',
  rows: [
    {
      keys: [
        { code: '`', label: '`', shiftLabel: '~', finger: 'LP' },
        { code: '1', label: '1', shiftLabel: '!', finger: 'LP' },
        { code: '2', label: '2', shiftLabel: '@', finger: 'LR' },
        { code: '3', label: '3', shiftLabel: '#', finger: 'LM' },
        { code: '4', label: '4', shiftLabel: '$', finger: 'LI' },
        { code: '5', label: '5', shiftLabel: '%', finger: 'LI' },
        { code: '6', label: '6', shiftLabel: '^', finger: 'RI' },
        { code: '7', label: '7', shiftLabel: '&', finger: 'RI' },
        { code: '8', label: '8', shiftLabel: '*', finger: 'RM' },
        { code: '9', label: '9', shiftLabel: '(', finger: 'RR' },
        { code: '0', label: '0', shiftLabel: ')', finger: 'RP' },
        { code: '-', label: '-', shiftLabel: '_', finger: 'RP' },
        { code: '=', label: '=', shiftLabel: '+', finger: 'RP' },
        { code: 'Backspace', label: '⌫', finger: 'RP', width: 1.5 }
      ]
    },
    {
      keys: [
        { code: 'Tab', label: 'Tab', finger: 'LP', width: 1.4 },
        { code: 'q', label: 'Q', finger: 'LP' },
        { code: 'w', label: 'W', finger: 'LR' },
        { code: 'e', label: 'E', finger: 'LM' },
        { code: 'r', label: 'R', finger: 'LI' },
        { code: 't', label: 'T', finger: 'LI' },
        { code: 'y', label: 'Y', finger: 'RI' },
        { code: 'u', label: 'U', finger: 'RI' },
        { code: 'i', label: 'I', finger: 'RM' },
        { code: 'o', label: 'O', finger: 'RR' },
        { code: 'p', label: 'P', finger: 'RP' },
        { code: '[', label: '[', shiftLabel: '{', finger: 'RP' },
        { code: ']', label: ']', shiftLabel: '}', finger: 'RP' },
        { code: '\\', label: '\\', shiftLabel: '|', finger: 'RP', width: 1.1 }
      ]
    },
    {
      keys: [
        { code: 'Caps', label: 'Caps', finger: 'LP', width: 1.7 },
        { code: 'a', label: 'A', finger: 'LP' },
        { code: 's', label: 'S', finger: 'LR' },
        { code: 'd', label: 'D', finger: 'LM' },
        { code: 'f', label: 'F', finger: 'LI' },
        { code: 'g', label: 'G', finger: 'LI' },
        { code: 'h', label: 'H', finger: 'RI' },
        { code: 'j', label: 'J', finger: 'RI' },
        { code: 'k', label: 'K', finger: 'RM' },
        { code: 'l', label: 'L', finger: 'RR' },
        { code: ';', label: ';', shiftLabel: ':', finger: 'RP' },
        { code: "'", label: "'", shiftLabel: '"', finger: 'RP' },
        { code: 'Enter', label: 'Enter ↵', finger: 'RP', width: 1.8 }
      ]
    },
    {
      keys: [
        { code: 'ShiftLeft', label: 'Shift', finger: 'LP', width: 2.2 },
        { code: 'z', label: 'Z', finger: 'LP' },
        { code: 'x', label: 'X', finger: 'LR' },
        { code: 'c', label: 'C', finger: 'LM' },
        { code: 'v', label: 'V', finger: 'LI' },
        { code: 'b', label: 'B', finger: 'LI' },
        { code: 'n', label: 'N', finger: 'RI' },
        { code: 'm', label: 'M', finger: 'RI' },
        { code: ',', label: ',', shiftLabel: '<', finger: 'RM' },
        { code: '.', label: '.', shiftLabel: '>', finger: 'RR' },
        { code: '/', label: '/', shiftLabel: '?', finger: 'RP' },
        { code: 'ShiftRight', label: 'Shift', finger: 'RP', width: 2.3 }
      ]
    },
    {
      keys: [
        { code: 'CtrlLeft', label: 'Ctrl', finger: 'LP', width: 1.3 },
        { code: 'AltLeft', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: ' ', label: 'Space', finger: 'TH', width: 6.2 },
        { code: 'AltRight', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: 'CtrlRight', label: 'Ctrl', finger: 'RP', width: 1.3 }
      ]
    }
  ]
};

// 2. Dvorak Layout Matrix
export const DVORAK_LAYOUT: KeyboardLayoutDef = {
  id: 'dvorak',
  name: 'Dvorak Simplified',
  rows: [
    {
      keys: [
        { code: '`', label: '`', shiftLabel: '~', finger: 'LP' },
        { code: '1', label: '1', shiftLabel: '!', finger: 'LP' },
        { code: '2', label: '2', shiftLabel: '@', finger: 'LR' },
        { code: '3', label: '3', shiftLabel: '#', finger: 'LM' },
        { code: '4', label: '4', shiftLabel: '$', finger: 'LI' },
        { code: '5', label: '5', shiftLabel: '%', finger: 'LI' },
        { code: '6', label: '6', shiftLabel: '^', finger: 'RI' },
        { code: '7', label: '7', shiftLabel: '&', finger: 'RI' },
        { code: '8', label: '8', shiftLabel: '*', finger: 'RM' },
        { code: '9', label: '9', shiftLabel: '(', finger: 'RR' },
        { code: '0', label: '0', shiftLabel: ')', finger: 'RP' },
        { code: '[', label: '[', shiftLabel: '{', finger: 'RP' },
        { code: ']', label: ']', shiftLabel: '}', finger: 'RP' },
        { code: 'Backspace', label: '⌫', finger: 'RP', width: 1.5 }
      ]
    },
    {
      keys: [
        { code: 'Tab', label: 'Tab', finger: 'LP', width: 1.4 },
        { code: "'", label: "'", shiftLabel: '"', finger: 'LP' },
        { code: ',', label: ',', shiftLabel: '<', finger: 'LR' },
        { code: '.', label: '.', shiftLabel: '>', finger: 'LM' },
        { code: 'p', label: 'P', finger: 'LI' },
        { code: 'y', label: 'Y', finger: 'LI' },
        { code: 'f', label: 'F', finger: 'RI' },
        { code: 'g', label: 'G', finger: 'RI' },
        { code: 'c', label: 'C', finger: 'RM' },
        { code: 'r', label: 'R', finger: 'RR' },
        { code: 'l', label: 'L', finger: 'RP' },
        { code: '/', label: '/', shiftLabel: '?', finger: 'RP' },
        { code: '=', label: '=', shiftLabel: '+', finger: 'RP' },
        { code: '\\', label: '\\', shiftLabel: '|', finger: 'RP', width: 1.1 }
      ]
    },
    {
      keys: [
        { code: 'Caps', label: 'Caps', finger: 'LP', width: 1.7 },
        { code: 'a', label: 'A', finger: 'LP' },
        { code: 'o', label: 'O', finger: 'LR' },
        { code: 'e', label: 'E', finger: 'LM' },
        { code: 'u', label: 'U', finger: 'LI' },
        { code: 'i', label: 'I', finger: 'LI' },
        { code: 'd', label: 'D', finger: 'RI' },
        { code: 'h', label: 'H', finger: 'RI' },
        { code: 't', label: 'T', finger: 'RM' },
        { code: 'n', label: 'N', finger: 'RR' },
        { code: 's', label: 'S', finger: 'RP' },
        { code: '-', label: '-', shiftLabel: '_', finger: 'RP' },
        { code: 'Enter', label: 'Enter ↵', finger: 'RP', width: 1.8 }
      ]
    },
    {
      keys: [
        { code: 'ShiftLeft', label: 'Shift', finger: 'LP', width: 2.2 },
        { code: ';', label: ';', shiftLabel: ':', finger: 'LP' },
        { code: 'q', label: 'Q', finger: 'LR' },
        { code: 'j', label: 'J', finger: 'LM' },
        { code: 'k', label: 'K', finger: 'LI' },
        { code: 'x', label: 'X', finger: 'LI' },
        { code: 'b', label: 'B', finger: 'RI' },
        { code: 'm', label: 'M', finger: 'RI' },
        { code: 'w', label: 'W', finger: 'RM' },
        { code: 'v', label: 'V', finger: 'RR' },
        { code: 'z', label: 'Z', finger: 'RP' },
        { code: 'ShiftRight', label: 'Shift', finger: 'RP', width: 2.3 }
      ]
    },
    {
      keys: [
        { code: 'CtrlLeft', label: 'Ctrl', finger: 'LP', width: 1.3 },
        { code: 'AltLeft', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: ' ', label: 'Space', finger: 'TH', width: 6.2 },
        { code: 'AltRight', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: 'CtrlRight', label: 'Ctrl', finger: 'RP', width: 1.3 }
      ]
    }
  ]
};

// 3. Colemak Layout Matrix
export const COLEMAK_LAYOUT: KeyboardLayoutDef = {
  id: 'colemak',
  name: 'Colemak Ergonomic',
  rows: [
    {
      keys: [
        { code: '`', label: '`', shiftLabel: '~', finger: 'LP' },
        { code: '1', label: '1', shiftLabel: '!', finger: 'LP' },
        { code: '2', label: '2', shiftLabel: '@', finger: 'LR' },
        { code: '3', label: '3', shiftLabel: '#', finger: 'LM' },
        { code: '4', label: '4', shiftLabel: '$', finger: 'LI' },
        { code: '5', label: '5', shiftLabel: '%', finger: 'LI' },
        { code: '6', label: '6', shiftLabel: '^', finger: 'RI' },
        { code: '7', label: '7', shiftLabel: '&', finger: 'RI' },
        { code: '8', label: '8', shiftLabel: '*', finger: 'RM' },
        { code: '9', label: '9', shiftLabel: '(', finger: 'RR' },
        { code: '0', label: '0', shiftLabel: ')', finger: 'RP' },
        { code: '-', label: '-', shiftLabel: '_', finger: 'RP' },
        { code: '=', label: '=', shiftLabel: '+', finger: 'RP' },
        { code: 'Backspace', label: '⌫', finger: 'RP', width: 1.5 }
      ]
    },
    {
      keys: [
        { code: 'Tab', label: 'Tab', finger: 'LP', width: 1.4 },
        { code: 'q', label: 'Q', finger: 'LP' },
        { code: 'w', label: 'W', finger: 'LR' },
        { code: 'f', label: 'F', finger: 'LM' },
        { code: 'p', label: 'P', finger: 'LI' },
        { code: 'g', label: 'G', finger: 'LI' },
        { code: 'j', label: 'J', finger: 'RI' },
        { code: 'l', label: 'L', finger: 'RI' },
        { code: 'u', label: 'U', finger: 'RM' },
        { code: 'y', label: 'Y', finger: 'RR' },
        { code: ';', label: ';', shiftLabel: ':', finger: 'RP' },
        { code: '[', label: '[', shiftLabel: '{', finger: 'RP' },
        { code: ']', label: ']', shiftLabel: '}', finger: 'RP' },
        { code: '\\', label: '\\', shiftLabel: '|', finger: 'RP', width: 1.1 }
      ]
    },
    {
      keys: [
        { code: 'Caps', label: 'Backspace', finger: 'LP', width: 1.7 },
        { code: 'a', label: 'A', finger: 'LP' },
        { code: 'r', label: 'R', finger: 'LR' },
        { code: 's', label: 'S', finger: 'LM' },
        { code: 't', label: 'T', finger: 'LI' },
        { code: 'd', label: 'D', finger: 'LI' },
        { code: 'h', label: 'H', finger: 'RI' },
        { code: 'n', label: 'N', finger: 'RI' },
        { code: 'e', label: 'E', finger: 'RM' },
        { code: 'i', label: 'I', finger: 'RR' },
        { code: 'o', label: 'O', finger: 'RP' },
        { code: "'", label: "'", shiftLabel: '"', finger: 'RP' },
        { code: 'Enter', label: 'Enter ↵', finger: 'RP', width: 1.8 }
      ]
    },
    {
      keys: [
        { code: 'ShiftLeft', label: 'Shift', finger: 'LP', width: 2.2 },
        { code: 'z', label: 'Z', finger: 'LP' },
        { code: 'x', label: 'X', finger: 'LR' },
        { code: 'c', label: 'C', finger: 'LM' },
        { code: 'v', label: 'V', finger: 'LI' },
        { code: 'b', label: 'B', finger: 'LI' },
        { code: 'k', label: 'K', finger: 'RI' },
        { code: 'm', label: 'M', finger: 'RI' },
        { code: ',', label: ',', shiftLabel: '<', finger: 'RM' },
        { code: '.', label: '.', shiftLabel: '>', finger: 'RR' },
        { code: '/', label: '/', shiftLabel: '?', finger: 'RP' },
        { code: 'ShiftRight', label: 'Shift', finger: 'RP', width: 2.3 }
      ]
    },
    {
      keys: [
        { code: 'CtrlLeft', label: 'Ctrl', finger: 'LP', width: 1.3 },
        { code: 'AltLeft', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: ' ', label: 'Space', finger: 'TH', width: 6.2 },
        { code: 'AltRight', label: 'Alt', finger: 'TH', width: 1.2 },
        { code: 'CtrlRight', label: 'Ctrl', finger: 'RP', width: 1.3 }
      ]
    }
  ]
};

export const KEYBOARD_LAYOUTS: Record<KeyboardLayoutId, KeyboardLayoutDef> = {
  qwerty: QWERTY_LAYOUT,
  dvorak: DVORAK_LAYOUT,
  colemak: COLEMAK_LAYOUT
};

// Key Telemetry & Statistics
export interface KeyStat {
  key: string;
  count: number;
  errors: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  accuracy: number; // percentage (0 - 100)
}

export type KeyTelemetryMap = Record<string, KeyStat>;

export interface HandBalance {
  leftHandPct: number;
  rightHandPct: number;
  totalKeystrokes: number;
  fingerLoads: Record<FingerId, { count: number; percentage: number }>;
}

export interface KeyBottleneck {
  key: string;
  errorRatePct: number;
  avgLatencyMs: number;
  count: number;
  severityScore: number;
  finger: FingerId;
}

// Ergonomics & Statistics Calculators

export function calculateHandBalance(telemetry: KeyTelemetryMap, layout: KeyboardLayoutDef = QWERTY_LAYOUT): HandBalance {
  // Build key-to-finger map
  const keyToFinger: Record<string, FingerId> = {};
  for (const row of layout.rows) {
    for (const k of row.keys) {
      keyToFinger[k.code.toLowerCase()] = k.finger;
      if (k.label) keyToFinger[k.label.toLowerCase()] = k.finger;
    }
  }

  const fingerCounts: Record<FingerId, number> = {
    LP: 0, LR: 0, LM: 0, LI: 0, TH: 0, RI: 0, RM: 0, RR: 0, RP: 0
  };

  let totalKeystrokes = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (const [key, stat] of Object.entries(telemetry)) {
    const cleanKey = key.toLowerCase();
    const finger = keyToFinger[cleanKey] || 'TH';
    const count = stat.count || 0;

    fingerCounts[finger] += count;
    totalKeystrokes += count;

    if (FINGERS[finger].hand === 'left') {
      leftCount += count;
    } else {
      rightCount += count;
    }
  }

  const leftHandPct = totalKeystrokes > 0 ? Math.round((leftCount / totalKeystrokes) * 100) : 50;
  const rightHandPct = totalKeystrokes > 0 ? 100 - leftHandPct : 50;

  const fingerLoads: Record<FingerId, { count: number; percentage: number }> = {} as any;
  for (const f of Object.keys(fingerCounts) as FingerId[]) {
    const count = fingerCounts[f];
    const pct = totalKeystrokes > 0 ? Math.round((count / totalKeystrokes) * 100) : 0;
    fingerLoads[f] = { count, percentage: pct };
  }

  return {
    leftHandPct,
    rightHandPct,
    totalKeystrokes,
    fingerLoads
  };
}

export function identifyBottlenecks(telemetry: KeyTelemetryMap, layout: KeyboardLayoutDef = QWERTY_LAYOUT, limit = 5): KeyBottleneck[] {
  const keyToFinger: Record<string, FingerId> = {};
  for (const row of layout.rows) {
    for (const k of row.keys) {
      keyToFinger[k.code.toLowerCase()] = k.finger;
    }
  }

  const bottlenecks: KeyBottleneck[] = [];

  for (const [key, stat] of Object.entries(telemetry)) {
    if (!stat.count || stat.count < 3 || key.length > 1) continue; // Only consider single character keys with minimal samples

    const errorRatePct = Math.round((stat.errors / stat.count) * 100);
    const avgLatencyMs = stat.avgLatencyMs || 0;

    // Severity score factors error rate and latency
    const severityScore = (errorRatePct * 2) + (avgLatencyMs > 250 ? (avgLatencyMs - 250) / 10 : 0);

    if (severityScore > 5 || errorRatePct > 10) {
      bottlenecks.push({
        key,
        errorRatePct,
        avgLatencyMs,
        count: stat.count,
        severityScore,
        finger: keyToFinger[key.toLowerCase()] || 'LI'
      });
    }
  }

  return bottlenecks.sort((a, b) => b.severityScore - a.severityScore).slice(0, limit);
}

// Generate practice words targeting weak keys
const DRILL_CORPUS = [
  'quick', 'brown', 'fox', 'jumps', 'lazy', 'dog', 'pack', 'my', 'box', 'with', 'five', 'dozen', 'liquor', 'jugs',
  'sphinx', 'of', 'black', 'quartz', 'judge', 'vow', 'waltz', 'bad', 'nymph', 'for', 'quick', 'jigs', 'vex',
  'crazy', 'fredrick', 'bought', 'very', 'fine', 'opal', 'jewels', 'fix', 'problem', 'syntax', 'matrix', 'rhythm',
  'hazard', 'galaxy', 'quantum', 'phantom', 'cyber', 'vortex', 'blitz', 'oxygen', 'pixel', 'zephyr', 'crypto',
  'knight', 'wizard', 'mystic', 'dragon', 'puzzle', 'shadow', 'glitch', 'frozen', 'plasma', 'atomic', 'vector'
];

export function generateWeaknessDrillWords(problemKeys: string[], wordCount = 25): string[] {
  if (!problemKeys || problemKeys.length === 0) {
    // Default balanced pangram drill
    return DRILL_CORPUS.slice(0, wordCount);
  }

  const targetChars = new Set(problemKeys.map(k => k.toLowerCase()));
  
  // Sort corpus by density of weak keys
  const scoredWords = DRILL_CORPUS.map(word => {
    let hits = 0;
    for (const char of word.toLowerCase()) {
      if (targetChars.has(char)) hits++;
    }
    return { word, hits };
  });

  scoredWords.sort((a, b) => b.hits - a.hits);

  const selected = scoredWords.slice(0, wordCount).map(sw => sw.word);
  return selected.length >= 10 ? selected : DRILL_CORPUS.slice(0, wordCount);
}

// Heatmap Color Computation
export function getKeyHeatColor(stat: KeyStat | undefined, metric: HeatmapMetric, maxCount: number): { bg: string; border: string; glow: string; text: string } {
  if (!stat || stat.count === 0) {
    return {
      bg: 'rgba(30, 41, 59, 0.7)',
      border: 'rgba(255, 255, 255, 0.1)',
      glow: 'none',
      text: '#94a3b8'
    };
  }

  if (metric === 'frequency') {
    const ratio = Math.min(1, stat.count / Math.max(1, maxCount));
    if (ratio > 0.75) {
      return { bg: 'rgba(239, 68, 68, 0.85)', border: '#f87171', glow: '0 0 14px rgba(239, 68, 68, 0.6)', text: '#ffffff' };
    }
    if (ratio > 0.5) {
      return { bg: 'rgba(249, 115, 22, 0.8)', border: '#fb923c', glow: '0 0 10px rgba(249, 115, 22, 0.5)', text: '#ffffff' };
    }
    if (ratio > 0.25) {
      return { bg: 'rgba(234, 179, 8, 0.75)', border: '#fde047', glow: '0 0 8px rgba(234, 179, 8, 0.4)', text: '#ffffff' };
    }
    return { bg: 'rgba(56, 189, 248, 0.65)', border: '#38bdf8', glow: '0 0 6px rgba(56, 189, 248, 0.35)', text: '#ffffff' };
  }

  if (metric === 'accuracy') {
    const acc = stat.accuracy ?? 100;
    if (acc < 80) {
      return { bg: 'rgba(239, 68, 68, 0.85)', border: '#f87171', glow: '0 0 14px rgba(239, 68, 68, 0.6)', text: '#ffffff' };
    }
    if (acc < 90) {
      return { bg: 'rgba(249, 115, 22, 0.8)', border: '#fb923c', glow: '0 0 10px rgba(249, 115, 22, 0.5)', text: '#ffffff' };
    }
    if (acc < 96) {
      return { bg: 'rgba(234, 179, 8, 0.75)', border: '#fde047', glow: '0 0 8px rgba(234, 179, 8, 0.4)', text: '#ffffff' };
    }
    return { bg: 'rgba(34, 197, 94, 0.75)', border: '#4ade80', glow: '0 0 8px rgba(34, 197, 94, 0.4)', text: '#ffffff' };
  }

  if (metric === 'latency') {
    const lat = stat.avgLatencyMs || 0;
    if (lat > 300) {
      return { bg: 'rgba(239, 68, 68, 0.85)', border: '#f87171', glow: '0 0 14px rgba(239, 68, 68, 0.6)', text: '#ffffff' };
    }
    if (lat > 200) {
      return { bg: 'rgba(249, 115, 22, 0.8)', border: '#fb923c', glow: '0 0 10px rgba(249, 115, 22, 0.5)', text: '#ffffff' };
    }
    if (lat > 120) {
      return { bg: 'rgba(56, 189, 248, 0.75)', border: '#38bdf8', glow: '0 0 8px rgba(56, 189, 248, 0.4)', text: '#ffffff' };
    }
    return { bg: 'rgba(34, 197, 94, 0.75)', border: '#4ade80', glow: '0 0 8px rgba(34, 197, 94, 0.4)', text: '#ffffff' };
  }

  return {
    bg: 'rgba(30, 41, 59, 0.7)',
    border: 'rgba(255, 255, 255, 0.1)',
    glow: 'none',
    text: '#94a3b8'
  };
}
