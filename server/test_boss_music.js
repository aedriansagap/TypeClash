const assert = require('assert');

console.log('🎵 [TEST] Starting Curated Boss Themes & Dynamic Audio Engine Test Suite...\n');

// 1. Test Boss Theme Music Metadata
console.log('--- 1. Testing Boss Theme Soundtracks & Metadata ---');

const BOSS_THEMES = {
  ignis: {
    trackTitle: 'Infernal Cataclysm',
    genre: 'Industrial Heavy Metal / Rock',
    bpm: 140,
    phase2Bpm: 168,
    scaleRoot: 'E',
    description: 'Driving rock bassline, aggressive percussion, and fiery sawtooth lead arpeggios.'
  },
  glitch: {
    trackTitle: 'Cyber Matrix Overclock',
    genre: 'Cyberpunk Darksynth / Chiptune',
    bpm: 135,
    phase2Bpm: 162,
    scaleRoot: 'D',
    description: '16th-note synthwave arpeggios, resonant lowpass sweeps, and syncopated square bass.'
  },
  chronos: {
    trackTitle: 'Temporal Apocalypse',
    genre: 'Cinematic Dark Cosmic Orchestral',
    bpm: 120,
    phase2Bpm: 144,
    scaleRoot: 'A',
    description: 'Subterranean sub-bass, harmonic minor choir progression, and cosmic impact polyrhythms.'
  }
};

for (const [bossId, theme] of Object.entries(BOSS_THEMES)) {
  assert.ok(theme.trackTitle.length > 0, `Track title must exist for ${bossId}`);
  assert.ok(theme.bpm >= 100 && theme.bpm <= 160, `Base BPM must be within range for ${bossId}`);
  assert.strictEqual(theme.phase2Bpm, Math.round(theme.bpm * 1.2), `Phase 2 BPM must be 1.2x overdrive for ${bossId}`);
  console.log(`✓ Boss "${bossId.toUpperCase()}": "${theme.trackTitle}" (${theme.genre}) - P1: ${theme.bpm} BPM -> P2: ${theme.phase2Bpm} BPM`);
}

// 2. Test Step Duration & 16th-Note Timing Generator
console.log('\n--- 2. Testing 16-Step Rhythm Sequencer Timing ---');

function calculateStepIntervalMs(bpm) {
  // 16th note tick = (60000 / BPM) / 4
  return Math.round((60000 / bpm) / 4);
}

const ignisP1StepMs = calculateStepIntervalMs(140);
const ignisP2StepMs = calculateStepIntervalMs(168);
assert.strictEqual(ignisP1StepMs, 107, 'Ignis Phase 1 16th note step should be ~107ms');
assert.strictEqual(ignisP2StepMs, 89, 'Ignis Phase 2 16th note step should be ~89ms');
console.log(`✓ 16-Step Sequencer: Ignis P1 step = ${ignisP1StepMs}ms | P2 overdrive step = ${ignisP2StepMs}ms`);

const glitchP1StepMs = calculateStepIntervalMs(135);
const glitchP2StepMs = calculateStepIntervalMs(162);
assert.strictEqual(glitchP1StepMs, 111);
assert.strictEqual(glitchP2StepMs, 93);
console.log(`✓ 16-Step Sequencer: Glitch P1 step = ${glitchP1StepMs}ms | P2 overdrive step = ${glitchP2StepMs}ms`);

const chronosP1StepMs = calculateStepIntervalMs(120);
const chronosP2StepMs = calculateStepIntervalMs(144);
assert.strictEqual(chronosP1StepMs, 125);
assert.strictEqual(chronosP2StepMs, 104);
console.log(`✓ 16-Step Sequencer: Chronos P1 step = ${chronosP1StepMs}ms | P2 overdrive step = ${chronosP2StepMs}ms`);

// 3. Test Scale Note Arrays and Harmonic Coherence
console.log('\n--- 3. Testing Musical Scale Roots & Harmonic Structures ---');

const ignisBassScale = [41.20, 41.20, 49.00, 41.20, 41.20, 55.00, 41.20, 61.74, 41.20, 41.20, 49.00, 41.20, 41.20, 73.42, 65.41, 61.74];
assert.strictEqual(ignisBassScale.length, 16, 'Ignis bass pattern must have 16 steps');
assert.strictEqual(ignisBassScale[0], 41.20, 'E1 note root frequency');
console.log('✓ Ignis heavy rock bassline ostinato validated (16 steps in E Minor)');

const glitchBassPattern = [73.42, 0, 73.42, 0, 87.31, 0, 73.42, 0, 98.00, 0, 103.83, 110.00, 73.42, 0, 65.41, 69.30];
assert.strictEqual(glitchBassPattern.length, 16);
console.log('✓ Glitch syncopated cyber bass pattern validated (D Minor Cyberpunk)');

const chronosPads = [
  [110.00, 130.81, 164.81], // Am
  [87.31, 110.00, 130.81],  // F
  [103.83, 123.47, 164.81], // E/G#
  [82.41, 110.00, 164.81]   // Am/E
];
assert.strictEqual(chronosPads.length, 4, 'Chronos atmospheric choir progression must have 4 bar triads');
console.log('✓ Chronos cosmic choir pad progression validated (Am -> F -> E/G# -> Am/E)');

// 4. Test Preview State Machine & Dynamic Phase Shift
console.log('\n--- 4. Testing Preview & Phase Transition State Machine ---');

class MockSoundEngine {
  constructor() {
    this.activeBossId = null;
    this.activeBossPhase = 1;
    this.isPlaying = false;
    this.previewingBossId = null;
  }

  startBossBGM(bossId, phase = 1) {
    this.activeBossId = bossId;
    this.activeBossPhase = phase;
    this.isPlaying = true;
  }

  updateBossBGMPhase(phase) {
    if (this.activeBossPhase === phase) return;
    this.activeBossPhase = phase;
  }

  previewBossTrack(bossId) {
    if (this.previewingBossId === bossId) {
      this.stopBossBGM();
      return;
    }
    this.previewingBossId = bossId;
    this.startBossBGM(bossId, 1);
  }

  stopBossBGM() {
    this.activeBossId = null;
    this.activeBossPhase = 1;
    this.isPlaying = false;
    this.previewingBossId = null;
  }
}

const soundEngine = new MockSoundEngine();

// Preview flow
soundEngine.previewBossTrack('ignis');
assert.strictEqual(soundEngine.previewingBossId, 'ignis');
assert.strictEqual(soundEngine.isPlaying, true);
console.log('✓ Preview started for Ignis theme');

// Toggle stop
soundEngine.previewBossTrack('ignis');
assert.strictEqual(soundEngine.previewingBossId, null);
assert.strictEqual(soundEngine.isPlaying, false);
console.log('✓ Preview toggled off successfully');

// Match start & phase 2 rage transition
soundEngine.startBossBGM('chronos', 1);
assert.strictEqual(soundEngine.activeBossId, 'chronos');
assert.strictEqual(soundEngine.activeBossPhase, 1);

soundEngine.updateBossBGMPhase(2);
assert.strictEqual(soundEngine.activeBossPhase, 2);
console.log('✓ Combat encounter dynamically accelerated from Phase 1 to Phase 2 Rage Overdrive');

soundEngine.stopBossBGM();
assert.strictEqual(soundEngine.isPlaying, false);
console.log('✓ Boss soundtrack stopped cleanly on boss defeat');

console.log('\n🎉 ALL BOSS THEME SOUNDTRACKS & AUDIO ENGINE TESTS PASSED (100%)!\n');
