const http = require('http');
const { io: ioClient } = require('../client/node_modules/socket.io-client');
const assert = require('assert');


// Boss Damage Formula Test
function calculateBossDamage(wordLength, combo = 0, isGolden = false) {
  const base = wordLength * 15;
  const comboBonus = Math.floor(combo / 5) * 10;
  const goldenMult = isGolden ? 3.0 : 1.0;
  const isCrit = combo >= 10 && (combo % 5 === 0);
  const critMult = isCrit ? 1.5 : 1.0;

  const total = Math.round((base + comboBonus) * goldenMult * critMult);
  return { damage: total, isCrit };
}

function calculateBossMaxHp(baseHp, difficulty, partySize = 1) {
  const diffMult = difficulty === 'mythic' ? 2.2 : difficulty === 'heroic' ? 1.5 : 1.0;
  const coopMult = 1 + (partySize - 1) * 0.75;
  return Math.round(baseHp * diffMult * coopMult);
}

console.log('🔥 [TEST] Starting Boss Rush & Co-Op Raids Test Suite...\n');

// 1. Unit Tests for Boss Damage Formulas & Party Scaling
console.log('--- 1. Testing Boss Damage Formulas & HP Scaling ---');

const testDamage1 = calculateBossDamage(5, 0, false);
assert.strictEqual(testDamage1.damage, 75, '5 letter word with 0 combo should do 75 damage');
assert.strictEqual(testDamage1.isCrit, false);
console.log('✓ Normal 5-letter hit: 75 DMG');

const testDamage2 = calculateBossDamage(8, 15, false);
// base = 8 * 15 = 120, comboBonus = 3 * 10 = 30, critMult = 1.5 -> (120 + 30) * 1.5 = 225
assert.strictEqual(testDamage2.damage, 225, '8 letter word with 15 combo should crit for 225');
assert.strictEqual(testDamage2.isCrit, true);
console.log('✓ Critical 8-letter hit (15 combo): 225 DMG (CRIT)');

const testDamage3 = calculateBossDamage(6, 20, true);
// base = 6 * 15 = 90, comboBonus = 40 -> 130 * 3.0 * 1.5 = 585
assert.strictEqual(testDamage3.damage, 585, 'Golden word with 20 combo should do 585 damage');
assert.strictEqual(testDamage3.isCrit, true);
console.log('✓ Golden Critical word: 585 DMG (CRIT)');

// Party Scaling
// Ignis (3000 HP) Normal 1 Player = 3000
assert.strictEqual(calculateBossMaxHp(3000, 'normal', 1), 3000);
// Ignis Heroic 1 Player = 4500
assert.strictEqual(calculateBossMaxHp(3000, 'heroic', 1), 4500);
// Ignis Mythic 1 Player = 6600
assert.strictEqual(calculateBossMaxHp(3000, 'mythic', 1), 6600);
// Ignis Normal 4 Players = 3000 * 1.0 * (1 + 3 * 0.75) = 3000 * 3.25 = 9750
assert.strictEqual(calculateBossMaxHp(3000, 'normal', 4), 9750);
// Chronos (6500 HP) Heroic 3 Players = 6500 * 1.5 * (1 + 2 * 0.75) = 9750 * 2.5 = 24375
assert.strictEqual(calculateBossMaxHp(6500, 'heroic', 3), 24375);

console.log('✓ Boss HP and Co-Op Party Scaling validated successfully.\n');

// 2. Integration Tests: Socket.IO Co-Op Raid Room Lifecycle
console.log('--- 2. Testing Live Co-Op Raid Multiplayer Sockets ---');

const SERVER_URL = 'http://localhost:3001';

async function runSocketIntegrationTest() {
  const host = ioClient(SERVER_URL);
  const player2 = ioClient(SERVER_URL);

  await new Promise((resolve) => {
    let connected = 0;
    host.on('connect', () => { if (++connected === 2) resolve(); });
    player2.on('connect', () => { if (++connected === 2) resolve(); });
  });

  console.log('✓ Host and Player 2 connected to TypeClash server via Socket.IO');

  let raidRoomId = '';

  // Host creates raid lobby
  await new Promise((resolve) => {
    host.emit('create_raid_lobby', {
      bossId: 'ignis',
      bossName: 'Ignis, Flame Colossus',
      difficulty: 'heroic',
      userId: '64a1b2c3d4e5f67890123456',
      username: 'RaidLeader_Alex',
      rating: 1850
    });

    host.on('raid_lobby_created', (data) => {
      raidRoomId = data.roomId;
      assert.ok(raidRoomId.startsWith('RAID-'));
      assert.strictEqual(data.room.bossId, 'ignis');
      assert.strictEqual(data.room.difficulty, 'heroic');
      console.log(`✓ Raid Lobby created: ${raidRoomId} [Ignis, Heroic]`);
      resolve();
    });
  });

  // Player 2 joins raid lobby
  await new Promise((resolve) => {
    player2.once('raid_lobby_update', (data) => {
      if (data.players.length === 2) {
        assert.strictEqual(data.players[0].username, 'RaidLeader_Alex');
        assert.strictEqual(data.players[0].isHost, true);
        assert.strictEqual(data.players[1].username, 'Raider_Sarah');
        assert.strictEqual(data.players[1].isReady, false);
        console.log('✓ Player 2 joined lobby. Party size: 2/4');
        resolve();
      }
    });

    player2.emit('join_raid_lobby', {
      roomId: raidRoomId,
      userId: '64a1b2c3d4e5f67890123457',
      username: 'Raider_Sarah',
      rating: 1720
    });
  });

  // Player 2 readies up
  await new Promise((resolve) => {
    host.once('raid_lobby_update', (data) => {
      const p2 = data.players.find(p => p.username === 'Raider_Sarah');
      if (p2 && p2.isReady) {
        console.log('✓ Player 2 readied up successfully');
        resolve();
      }
    });
    player2.emit('toggle_raid_ready', { roomId: raidRoomId });
  });

  // Host starts the raid match
  let bossMaxHp = 0;
  await new Promise((resolve) => {
    host.once('raid_match_start', (data) => {
      assert.strictEqual(data.bossId, 'ignis');
      assert.strictEqual(data.difficulty, 'heroic');
      assert.strictEqual(data.partySize, 2);
      // Heroic Ignis with 2 players = 3000 * 1.5 * (1 + 1 * 0.75) = 4500 * 1.75 = 7875 HP
      assert.strictEqual(data.maxHp, 7875);
      bossMaxHp = data.maxHp;
      console.log(`✓ Raid Match started! Party scaled Boss HP: ${data.maxHp} HP`);
      resolve();
    });
    host.emit('start_raid_match', { roomId: raidRoomId });
  });

  // Player 1 deals 4000 damage (Triggers Phase 2 Rage over 50% HP threshold)
  await new Promise((resolve) => {
    let hpSynced = false;
    let phaseChanged = false;

    player2.once('raid_boss_hp_sync', (data) => {
      assert.strictEqual(data.currentHp, bossMaxHp - 4000);
      assert.strictEqual(data.dealerName, 'RaidLeader_Alex');
      assert.strictEqual(data.damage, 4000);
      hpSynced = true;
      if (hpSynced && phaseChanged) resolve();
    });

    player2.once('raid_boss_phase_change', (data) => {
      assert.strictEqual(data.phase, 2);
      console.log('✓ Boss Phase 2 (Rage Mode) triggered below 50% HP!');
      phaseChanged = true;
      if (hpSynced && phaseChanged) resolve();
    });

    host.emit('raid_damage_dealt', {
      roomId: raidRoomId,
      damage: 4000,
      isCrit: true,
      wpm: 110,
      accuracy: 98
    });
  });

  // Player 2 deals remaining 3875 damage -> Boss Slain & Raid Victory
  await new Promise((resolve) => {
    host.once('raid_victory_all', (data) => {
      assert.strictEqual(data.bossId, 'ignis');
      assert.strictEqual(data.totalTeamDamage, 7875);
      assert.strictEqual(data.rankings.length, 2);
      assert.strictEqual(data.rankings[0].username, 'RaidLeader_Alex');
      assert.strictEqual(data.rankings[0].damageDealt, 4000);
      assert.strictEqual(data.rankings[1].username, 'Raider_Sarah');
      assert.strictEqual(data.rankings[1].damageDealt, 3875);
      console.log('✓ Boss Slain! Raid Victory broadcasted with party DPS rankings.');
      resolve();
    });

    player2.emit('raid_damage_dealt', {
      roomId: raidRoomId,
      damage: 3875,
      isCrit: true,
      wpm: 125,
      accuracy: 100
    });
  });


  // 3. Verify Raid Leaderboard Endpoint
  console.log('\n--- 3. Testing Raid Leaderboard REST API ---');
  await new Promise((resolve) => {
    http.get(`${SERVER_URL}/api/leaderboard/raids`, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        const data = JSON.parse(raw);
        assert.ok(Array.isArray(data));
        console.log(`✓ GET /api/leaderboard/raids returned ${data.length} records`);
        if (data.length > 0) {
          console.log(`  Top Clear: ${data[0].bossName} (${data[0].difficulty}) in ${data[0].clearTimeSeconds}s by [${data[0].partyMembers.map(m => m.username).join(', ')}]`);
        }
        resolve();
      });
    });
  });

  host.disconnect();
  player2.disconnect();

  console.log('\n🎉 ALL BOSS RUSH & CO-OP RAIDS TESTS PASSED SUCCESSFULLY! (100%)');
}

runSocketIntegrationTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
