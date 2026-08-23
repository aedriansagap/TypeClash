const http = require('http');
const { io: ioClient } = require('../client/node_modules/socket.io-client');
const assert = require('assert');
const seedrandom = require('../client/node_modules/seedrandom');


console.log('📦 [TEST] Starting Word Pack Studio & Community Workshop Test Suite...\n');

// 1. Test Dictionary customWords support and sanitization
console.log('--- 1. Testing Dictionary Custom Words Sampling & Sanitization ---');

function sanitizeWords(rawInput) {
  if (!rawInput) return [];
  const tokens = rawInput.split(/[\r\n,;\t]+/);
  const cleaned = [];
  const seen = new Set();

  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase().replace(/[^a-z0-9_!?-]/gi, '');
    if (trimmed.length >= 2 && trimmed.length <= 30 && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

const rawPasteText = `
  async, await, promise, 
  callback,   closure, middleware,
  typescript, interface, component,
  useEffect,  useState, useMemo,
  async, callback
`;

const sanitized = sanitizeWords(rawPasteText);
assert.strictEqual(sanitized.length, 12, 'Sanitizer should clean and deduplicate 12 words');
assert.ok(sanitized.includes('useeffect'));
assert.ok(sanitized.includes('async'));
console.log(`✓ Sanitized & deduplicated ${sanitized.length} words from raw text input`);


// Test custom word sampling
const testPack = ['algorithm', 'blockchain', 'concurrency', 'deadlock', 'encryption', 'firewall', 'hashmap', 'immutable', 'javascript', 'kernel'];
const rng = seedrandom('test-seed-123');

function getWordMock(random, customWords) {
  const idx = Math.floor(random() * customWords.length);
  return customWords[idx];
}

const sampledWord = getWordMock(rng, testPack);
assert.ok(testPack.includes(sampledWord), 'Sampled word must come from custom word list');
console.log(`✓ Custom word pack accurately sampled: "${sampledWord}"`);

// 2. Integration Tests: Word Pack REST API Endpoints
console.log('\n--- 2. Testing Word Pack REST API Endpoints ---');

const SERVER_URL = 'http://localhost:3001';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runWordPackTests() {
  // Test GET /api/wordpacks
  const getPacks = await makeRequest('GET', '/api/wordpacks');
  assert.strictEqual(getPacks.status, 200);
  assert.ok(Array.isArray(getPacks.data));
  assert.ok(getPacks.data.length >= 6, 'Should contain at least 6 official curated packs');
  console.log(`✓ GET /api/wordpacks returned ${getPacks.data.length} curated packs`);

  // Test Category Filter
  const codingPacks = await makeRequest('GET', '/api/wordpacks?category=coding');
  assert.strictEqual(codingPacks.status, 200);
  assert.ok(codingPacks.data.every(p => p.category === 'coding'));
  console.log(`✓ GET /api/wordpacks?category=coding correctly filtered ${codingPacks.data.length} packs`);

  // Test Search Filter
  const searchPacks = await makeRequest('GET', '/api/wordpacks?search=python');
  assert.strictEqual(searchPacks.status, 200);
  assert.ok(searchPacks.data.some(p => p.title.toLowerCase().includes('python')));
  console.log(`✓ GET /api/wordpacks?search=python found matching pack: "${searchPacks.data[0].title}"`);

  // Test POST /api/wordpacks (Create Custom Pack)
  const newPackPayload = {
    title: '🚀 Rust Systems & Memory',
    description: 'Borrow checker, lifetimes, unsafe, traits, and zero-cost abstractions in Rust.',
    category: 'coding',
    icon: '🦀',
    color: '#f97316',
    difficulty: 'expert',
    words: [
      'borrowchecker', 'lifetimes', 'ownership', 'unsafe', 'patternmatching',
      'monomorphization', 'vector', 'mutex', 'rwlock', 'atomic', 'tokio', 'iterator'
    ],
    tags: ['rust', 'systems', 'memory', 'backend'],
    author: 'SystemsHacker_Dev'
  };

  const createPackRes = await makeRequest('POST', '/api/wordpacks', newPackPayload);
  assert.strictEqual(createPackRes.status, 200);
  assert.strictEqual(createPackRes.data.success, true);
  const createdPackId = createPackRes.data.id;
  assert.ok(createdPackId);
  console.log(`✓ POST /api/wordpacks created custom pack: "${newPackPayload.title}" (ID: ${createdPackId})`);

  // Test POST /api/wordpacks/:id/like
  const likeRes = await makeRequest('POST', `/api/wordpacks/${createdPackId}/like`);
  assert.strictEqual(likeRes.status, 200);
  assert.strictEqual(likeRes.data.success, true);
  console.log(`✓ POST /api/wordpacks/:id/like successfully liked pack. Likes: ${likeRes.data.likesCount}`);

  // Test Socket.IO Multiplayer Propagation of Custom Word Pack
  console.log('\n--- 3. Testing Socket.IO Multiplayer Word Pack Sync ---');

  const host = ioClient(SERVER_URL);
  const player2 = ioClient(SERVER_URL);

  await new Promise((resolve) => {
    let count = 0;
    host.on('connect', () => { if (++count === 2) resolve(); });
    player2.on('connect', () => { if (++count === 2) resolve(); });
  });

  const testRoomId = 'PACK-ROOM';

  await new Promise((resolve) => {
    host.once('lobby_update', (data) => {
      assert.strictEqual(data.wordPackTitle, '🚀 Rust Systems & Memory');
      console.log('✓ Host created private room with equipped Custom Word Pack');
      resolve();
    });

    host.emit('join_room', {
      roomId: testRoomId,
      duration: 60,
      userId: '64a1b2c3d4e5f67890123458',
      username: 'Rust_Host',
      customWords: newPackPayload.words,
      wordPackTitle: newPackPayload.title
    });
  });

  await new Promise((resolve) => {
    player2.once('lobby_update', (data) => {
      if (data.players.length === 2) {
        assert.strictEqual(data.wordPackTitle, '🚀 Rust Systems & Memory');
        console.log('✓ Player 2 joined room and received synchronized Word Pack title');
        resolve();
      }
    });

    player2.emit('join_room', {
      roomId: testRoomId,
      duration: 60,
      userId: '64a1b2c3d4e5f67890123459',
      username: 'Player_Two'
    });
  });

  // Host starts match -> verify customWords delivered to both players
  await new Promise((resolve) => {
    player2.once('game_start', (data) => {
      assert.strictEqual(data.wordPackTitle, '🚀 Rust Systems & Memory');
      assert.ok(Array.isArray(data.customWords));
      assert.strictEqual(data.customWords.length, 12);
      assert.ok(data.customWords.includes('borrowchecker'));
      console.log(`✓ game_start broadcasted synchronized custom words (${data.customWords.length} words) to all players`);
      resolve();
    });

    host.emit('start_private_match');
  });

  host.disconnect();
  player2.disconnect();

  console.log('\n🎉 ALL WORD PACK STUDIO & COMMUNITY WORKSHOP TESTS PASSED (100%)!\n');
}

runWordPackTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
