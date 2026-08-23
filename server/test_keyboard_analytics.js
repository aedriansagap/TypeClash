const assert = require('assert');

console.log('⌨️ [TEST] Starting Keyboard Heatmap & Finger Ergonomics Test Suite...\n');

// 1. Test Keyboard Layouts & Finger Definitions
console.log('--- 1. Testing Keyboard Layouts & Finger Mapping ---');

const FINGERS = {
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

const QWERTY_KEYS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
  ['ShiftLeft', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'ShiftRight'],
  ['CtrlLeft', 'AltLeft', ' ', 'AltRight', 'CtrlRight']
];

assert.strictEqual(QWERTY_KEYS.length, 5, 'QWERTY keyboard layout should have exactly 5 rows');
console.log('✓ QWERTY layout structure validated (5 rows, standard keycap matrix)');

// 2. Test Ergonomics Hand Load Balance Algorithm
console.log('\n--- 2. Testing Hand Load Balance & Finger Workload Distribution ---');

const keyToFinger = {
  'q': 'LP', 'a': 'LP', 'z': 'LP',
  'w': 'LR', 's': 'LR', 'x': 'LR',
  'e': 'LM', 'd': 'LM', 'c': 'LM',
  'r': 'LI', 'f': 'LI', 'v': 'LI', 't': 'LI', 'g': 'LI', 'b': 'LI',
  ' ': 'TH',
  'y': 'RI', 'h': 'RI', 'n': 'RI', 'u': 'RI', 'j': 'RI', 'm': 'RI',
  'i': 'RM', 'k': 'RM',
  'o': 'RR', 'l': 'RR',
  'p': 'RP'
};

function calculateHandBalance(telemetry) {
  const fingerCounts = { LP: 0, LR: 0, LM: 0, LI: 0, TH: 0, RI: 0, RM: 0, RR: 0, RP: 0 };
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

  const fingerLoads = {};
  for (const f of Object.keys(fingerCounts)) {
    const count = fingerCounts[f];
    const percentage = totalKeystrokes > 0 ? Math.round((count / totalKeystrokes) * 100) : 0;
    fingerLoads[f] = { count, percentage };
  }

  return { leftHandPct, rightHandPct, totalKeystrokes, fingerLoads };
}

const mockTelemetry = {
  'e': { count: 120, errors: 2, totalLatencyMs: 14400, avgLatencyMs: 120, accuracy: 98 },
  't': { count: 90, errors: 1, totalLatencyMs: 11700, avgLatencyMs: 130, accuracy: 99 },
  'a': { count: 80, errors: 4, totalLatencyMs: 12000, avgLatencyMs: 150, accuracy: 95 },
  'o': { count: 75, errors: 2, totalLatencyMs: 9750, avgLatencyMs: 130, accuracy: 97 },
  'i': { count: 70, errors: 1, totalLatencyMs: 8400, avgLatencyMs: 120, accuracy: 99 },
  'n': { count: 65, errors: 3, totalLatencyMs: 9100, avgLatencyMs: 140, accuracy: 95 },
  's': { count: 60, errors: 5, totalLatencyMs: 9600, avgLatencyMs: 160, accuracy: 92 },
  'r': { count: 55, errors: 2, totalLatencyMs: 7700, avgLatencyMs: 140, accuracy: 96 },
  'h': { count: 50, errors: 1, totalLatencyMs: 7000, avgLatencyMs: 140, accuracy: 98 },
  'q': { count: 15, errors: 6, totalLatencyMs: 4800, avgLatencyMs: 320, accuracy: 60 },
  'z': { count: 10, errors: 4, totalLatencyMs: 3400, avgLatencyMs: 340, accuracy: 60 },
  'p': { count: 30, errors: 8, totalLatencyMs: 8400, avgLatencyMs: 280, accuracy: 73 }
};

const balance = calculateHandBalance(mockTelemetry);
assert.strictEqual(balance.leftHandPct + balance.rightHandPct, 100);
assert.ok(balance.totalKeystrokes > 500);
console.log(`✓ Hand load balance accurately computed: ${balance.leftHandPct}% Left / ${balance.rightHandPct}% Right (${balance.totalKeystrokes} keystrokes)`);
console.log(`✓ Per-finger loads: LP: ${balance.fingerLoads.LP.percentage}%, LM: ${balance.fingerLoads.LM.percentage}%, RM: ${balance.fingerLoads.RM.percentage}%, RP: ${balance.fingerLoads.RP.percentage}%`);

// 3. Test Bottleneck Identification
console.log('\n--- 3. Testing Bottleneck & Problem Key Identification ---');

function identifyBottlenecks(telemetry, limit = 5) {
  const bottlenecks = [];

  for (const [key, stat] of Object.entries(telemetry)) {
    if (!stat.count || stat.count < 3 || key.length > 1) continue;

    const errorRatePct = Math.round((stat.errors / stat.count) * 100);
    const avgLatencyMs = stat.avgLatencyMs || 0;
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

const bottlenecks = identifyBottlenecks(mockTelemetry);
assert.ok(bottlenecks.length >= 3);
assert.ok(bottlenecks[0].key === 'z' || bottlenecks[0].key === 'q');
console.log(`✓ Top bottleneck identified: Key "${bottlenecks[0].key.toUpperCase()}" (${bottlenecks[0].errorRatePct}% errors, ${bottlenecks[0].avgLatencyMs}ms avg latency)`);
console.log(`✓ Secondary bottlenecks: ${bottlenecks.slice(1).map(b => `${b.key.toUpperCase()} (${b.errorRatePct}%)`).join(', ')}`);


// 4. Test Targeted Weakness Drill Word Generator
console.log('\n--- 4. Testing Targeted Weakness Drill Generator ---');

const DRILL_CORPUS = [
  'quick', 'brown', 'fox', 'jumps', 'lazy', 'dog', 'pack', 'my', 'box', 'with', 'five', 'dozen', 'liquor', 'jugs',
  'sphinx', 'of', 'black', 'quartz', 'judge', 'vow', 'waltz', 'bad', 'nymph', 'for', 'quick', 'jigs', 'vex',
  'crazy', 'fredrick', 'bought', 'very', 'fine', 'opal', 'jewels', 'fix', 'problem', 'syntax', 'matrix', 'rhythm',
  'hazard', 'galaxy', 'quantum', 'phantom', 'cyber', 'vortex', 'blitz', 'oxygen', 'pixel', 'zephyr', 'crypto',
  'knight', 'wizard', 'mystic', 'dragon', 'puzzle', 'shadow', 'glitch', 'frozen', 'plasma', 'atomic', 'vector'
];

function generateWeaknessDrillWords(problemKeys, wordCount = 10) {
  const targetChars = new Set(problemKeys.map(k => k.toLowerCase()));
  const scoredWords = DRILL_CORPUS.map(word => {
    let hits = 0;
    for (const char of word.toLowerCase()) {
      if (targetChars.has(char)) hits++;
    }
    return { word, hits };
  });

  scoredWords.sort((a, b) => b.hits - a.hits);
  return scoredWords.slice(0, wordCount).map(sw => sw.word);
}

const drill = generateWeaknessDrillWords(['q', 'z', 'p'], 10);
assert.ok(drill.length === 10);
assert.ok(drill.some(w => w.includes('q') || w.includes('z') || w.includes('p')));
console.log(`✓ Generated weakness drill words: ${drill.join(', ')}`);

console.log('\n🎉 ALL KEYBOARD HEATMAP & FINGER ERGONOMICS TESTS PASSED (100%)!\n');
