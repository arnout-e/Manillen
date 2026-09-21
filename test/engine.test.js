import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK, beats, legalMoves, legalMovesExplained, currentWinnerIndex, createGame, startDeal, setTrump, playCard,
  dealResult, finishDeal, valueOf, TOTAL_POINTS, makeRng,
} from '../js/engine.js';

// Hulpje: bouw een deal met opgelegde handen en een lopende slag.
function makeDeal({ hands, trump = 'h', trick = [], turn }) {
  const game = createGame({ seed: 1 });
  const deal = startDeal(game);
  deal.hands = hands.map((h) => [...h]);
  setTrump(deal, trump);
  deal.trick = trick.map((t) => ({ ...t }));
  deal.played = trick.map((t) => t.card);
  deal.turn = turn ?? (trick.length ? (trick[trick.length - 1].player + 1) % 4 : deal.leader);
  return deal;
}

test('32 kaarten, 60 punten in totaal', () => {
  assert.equal(DECK.length, 32);
  assert.equal(DECK.reduce((s, c) => s + valueOf(c), 0), TOTAL_POINTS);
});

test('de 10 (manille) is de hoogste kaart, troef klopt alles', () => {
  assert.ok(beats('Th', 'Ah', 'h', null));
  assert.ok(beats('Ah', 'Kh', 'h', null));
  assert.ok(!beats('9h', 'Jh', 'h', null));
  assert.ok(beats('7s', 'Th', 'h', 's')); // lage troef klopt hoge kleur
  assert.ok(!beats('Ts', 'Th', 'h', null)); // zonder troef telt enkel de gevraagde kleur
  assert.ok(!beats('Ad', 'Kh', 'h', 's')); // andere kleur, geen troef: klopt niet
});

test('slagwinnaar: hoogste troef, anders hoogste in gevraagde kleur', () => {
  const trick = [{ player: 0, card: 'Kh' }, { player: 1, card: 'Ah' }, { player: 2, card: '7s' }, { player: 3, card: 'Th' }];
  assert.equal(currentWinnerIndex(trick, 's'), 2);
  assert.equal(currentWinnerIndex(trick, null), 3);
  assert.equal(currentWinnerIndex(trick, 'c'), 3);
});

test('volgen is verplicht en je moet hoger leggen als je kan', () => {
  const deal = makeDeal({
    hands: [['9h', 'Ah', '7c'], ['8h', '7h', '8c'], ['Kh', 'Qh', '9c'], ['Jh', 'Th', 'Tc']],
    trump: 's',
    trick: [{ player: 1, card: 'Kh' }],
    turn: 2,
  });
  // Speler 2 (maat van 0) moet hoger dan Kh: enkel Ah niet in hand, dus Kh/Qh kunnen niet hoger → beide mogen
  assert.deepEqual(legalMoves(deal, 2).sort(), ['Kh', 'Qh'].sort());
  // Speler 0 heeft Ah: die klopt Kh en moet dus
  deal.turn = 0;
  deal.trick = [{ player: 3, card: 'Kh' }];
  assert.deepEqual(legalMoves(deal, 0), ['Ah']);
});

test('maat ligt voor: volgen zonder hoger te moeten', () => {
  const deal = makeDeal({
    hands: [['9h', 'Ah'], ['8h'], ['Kh'], ['Jh']],
    trump: 's',
    trick: [{ player: 2, card: 'Kh' }, { player: 3, card: 'Jh' }],
    turn: 0,
  });
  assert.deepEqual(legalMoves(deal, 0).sort(), ['9h', 'Ah']);
});

test('geen kleur en tegenpartij voor: troeven is verplicht', () => {
  const deal = makeDeal({
    hands: [['7s', 'Ac', '9d'], ['8h'], ['Kh'], ['Jh']],
    trump: 's',
    trick: [{ player: 3, card: 'Jh' }],
    turn: 0,
  });
  const { cards, rule } = legalMovesExplained(deal, 0);
  assert.deepEqual(cards, ['7s']);
  assert.match(rule, /moet troeven/);
});

test('geen kleur, maat ligt voor: alles mag', () => {
  const deal = makeDeal({
    hands: [['7s', 'Ac', '9d'], ['8h'], ['Kh'], ['Jh']],
    trump: 's',
    trick: [{ player: 2, card: 'Kh' }, { player: 3, card: 'Jh' }],
    turn: 0,
  });
  assert.deepEqual(legalMoves(deal, 0).sort(), ['7s', '9d', 'Ac'].sort());
});

test('overtroeven verplicht als het kan, ondertroeven niet verplicht', () => {
  const deal = makeDeal({
    hands: [['9s', 'Ks', 'Ac'], ['8h'], ['Kh'], ['Jh']],
    trump: 's',
    trick: [{ player: 2, card: 'Kh' }, { player: 3, card: 'Qs' }],
    turn: 0,
  });
  assert.deepEqual(legalMoves(deal, 0), ['Ks']);
  deal.hands[0] = ['9s', '7s', 'Ac'];
  assert.deepEqual(legalMoves(deal, 0).sort(), ['7s', '9s', 'Ac'].sort());
});

test('zonder troef: geen kleur betekent vrij bijleggen', () => {
  const deal = makeDeal({
    hands: [['9s', 'Ac'], ['8h'], ['Kh'], ['Jh']],
    trump: 'sans',
    trick: [{ player: 3, card: 'Jh' }],
    turn: 0,
  });
  assert.deepEqual(legalMoves(deal, 0).sort(), ['9s', 'Ac']);
});

test('openbare informatie: wie niet volgt is die kleur kwijt', () => {
  const deal = makeDeal({
    hands: [['9s', 'Ac', '7d', '8d'], ['8h', '7c', '9d', 'Td'], ['Kh', '8c', 'Jd', 'Qd'], ['Jh', '9c', 'Kd', 'Ad']],
    trump: 's',
    trick: [{ player: 3, card: 'Jh' }],
    turn: 0,
  });
  playCard(deal, 0, '9s');
  assert.equal(deal.voids[0].h, true);
  assert.equal(deal.voids[0].s, false);
});

test('een volledige deal met enkel toegelaten zetten, punten kloppen', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const game = createGame({ seed });
    const deal = startDeal(game);
    setTrump(deal, seed % 5 === 0 ? 'sans' : ['h', 's', 'd', 'c'][seed % 4]);
    const rng = makeRng(seed);
    while (deal.phase === 'play') {
      const p = deal.turn;
      const legal = legalMoves(deal, p);
      assert.ok(legal.length > 0);
      playCard(deal, p, legal[Math.floor(rng() * legal.length)]);
    }
    assert.equal(deal.tricks.length, 8);
    assert.equal(deal.points[0] + deal.points[1], TOTAL_POINTS);
    const r = finishDeal(game);
    if (r.winnerTeam != null) assert.equal(game.scores[r.winnerTeam], (Math.max(...deal.points) - 30) * r.multiplier);
    assert.equal(game.dealer, (deal.dealer + 1) % 4);
  }
});

test('telling: verschil met 30, dubbel zonder troef', () => {
  assert.deepEqual(dealResult({ points: [38, 22], trump: 'h' }), { winnerTeam: 0, score: 8, multiplier: 1, points: [38, 22] });
  assert.deepEqual(dealResult({ points: [25, 35], trump: 'sans' }), { winnerTeam: 1, score: 10, multiplier: 2, points: [25, 35] });
  assert.equal(dealResult({ points: [30, 30], trump: 'h' }).score, 0);
});
