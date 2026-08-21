const { calculateMultiplayerElo, getTier } = require('./dist/index');
const assert = require('assert');

console.log('--- Running Elo & Competitive Rating Tests ---');

// Test 1: Tier Assignments
console.log('1. Testing Tier Assignments...');
assert.strictEqual(getTier(2400), 'Grandmaster');
assert.strictEqual(getTier(2200), 'Grandmaster');
assert.strictEqual(getTier(1950), 'Diamond');
assert.strictEqual(getTier(1700), 'Platinum');
assert.strictEqual(getTier(1400), 'Gold');
assert.strictEqual(getTier(1150), 'Silver');
assert.strictEqual(getTier(800), 'Bronze');
console.log('✓ All Tier brackets mapped accurately!');

// Test 2: Standard 1v1 Match (Equal Ratings)
console.log('\n2. Testing 1v1 Equal Ratings Match...');
const match1 = [
  { id: 'playerA', rating: 1200, rank: 1 },
  { id: 'playerB', rating: 1200, rank: 2 }
];
const res1 = calculateMultiplayerElo(match1);
console.log('Match 1 (1200 vs 1200):', res1);
assert.strictEqual(res1.playerA.change, 16);
assert.strictEqual(res1.playerA.newRating, 1216);
assert.strictEqual(res1.playerB.change, -16);
assert.strictEqual(res1.playerB.newRating, 1184);
console.log('✓ 1v1 standard equal Elo changes verified (+16 / -16)!');

// Test 3: 1v1 Upset (Lower rating beats higher rating)
console.log('\n3. Testing 1v1 Upset Match (1000 vs 1400)...');
const match2 = [
  { id: 'underdog', rating: 1000, rank: 1 },
  { id: 'favorite', rating: 1400, rank: 2 }
];
const res2 = calculateMultiplayerElo(match2);
console.log('Match 2 (1000 beats 1400):', res2);
assert(res2.underdog.change > 25, 'Underdog should gain large amount');
assert(res2.favorite.change < -25, 'Favorite should lose large amount');
assert.strictEqual(res2.underdog.change + res2.favorite.change, 0, 'Zero-sum property');
console.log(`✓ Underdog gained +${res2.underdog.change} Elo, Favorite lost ${res2.favorite.change} Elo!`);

// Test 4: 4-Player FFA Match
console.log('\n4. Testing 4-Player FFA Match...');
const match3 = [
  { id: 'p1', rating: 1200, rank: 1 },
  { id: 'p2', rating: 1200, rank: 2 },
  { id: 'p3', rating: 1200, rank: 3 },
  { id: 'p4', rating: 1200, rank: 4 }
];
const res3 = calculateMultiplayerElo(match3);
console.log('Match 3 (4 Players FFA):', res3);
assert(res3.p1.change > 0, '1st place must gain rating');
assert(res3.p4.change < 0, '4th place must lose rating');
assert(res3.p1.change > res3.p2.change, '1st place gains more than 2nd');
assert(res3.p3.change > res3.p4.change, '3rd place loses less than 4th');

const sumChanges = res3.p1.change + res3.p2.change + res3.p3.change + res3.p4.change;
assert(Math.abs(sumChanges) <= 1, 'Sum of rating changes should be ~0');
console.log('✓ FFA multiplayer Elo calculations verified with conservation of rating!');

// Test 5: Single Player Match / Edge case
console.log('\n5. Testing Solo Player Edge Case...');
const match4 = [{ id: 'solo', rating: 1200, rank: 1 }];
const res4 = calculateMultiplayerElo(match4);
assert.strictEqual(res4.solo.change, 0);
assert.strictEqual(res4.solo.newRating, 1200);
console.log('✓ Solo player edge case safely handled with 0 change!');

console.log('\n========================================');
console.log('🎉 ALL ELO & SBMM TESTS PASSED SUCCESSFULLY!');
console.log('========================================');
process.exit(0);
