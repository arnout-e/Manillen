import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startDeal, setTrump, playCard, legalMoves, suitOf } from '../js/engine.js';
import { evaluateMoves, advise, adviseTrump, chooseTrump, determinize, bestMove, trumpOptions } from '../js/advisor.js';

function makeDeal({ hands, trump = 'h', trick = [], turn, played = [] }) {
  const game = createGame({ seed: 1 });
  const deal = startDeal(game);
  deal.hands = hands.map((h) => [...h]);
  setTrump(deal, trump);
  deal.trick = trick.map((t) => ({ ...t }));
  deal.played = [...played, ...trick.map((t) => t.card)];
  deal.turn = turn ?? (trick.length ? (trick[trick.length - 1].player + 1) % 4 : deal.leader);
  return deal;
}

test('advies is altijd een toegelaten kaart en heeft een reden', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const game = createGame({ seed });
    const deal = startDeal(game);
    setTrump(deal, chooseTrump(deal.hands[deal.dealer]));
    while (deal.phase === 'play') {
      const p = deal.turn;
      const { evals } = evaluateMoves(deal, p);
      assert.ok(legalMoves(deal, p).includes(evals[0].card));
      assert.ok(evals[0].reasons.length > 0);
      playCard(deal, p, evals[0].card);
    }
  }
});

test('smeren: leg punten bij als je maat de slag zeker heeft', () => {
  // Noord (2) speelde de manille harten; Zuid (0) is laatste en heeft geen harten.
  const deal = makeDeal({
    hands: [['Ac', '7d', '8d'], ['7h'], ['9h'], ['8h']],
    trump: 's',
    trick: [{ player: 1, card: 'Kh' }, { player: 2, card: 'Th' }, { player: 3, card: 'Qh' }],
    turn: 0,
  });
  const { evals } = evaluateMoves(deal, 0);
  assert.equal(evals[0].card, 'Ac');
  assert.match(evals[0].reasons.join(' '), /smeren/);
});

test('geen punten weggeven als je niet kan winnen', () => {
  const deal = makeDeal({
    hands: [['7h', 'Kh'], ['Qc'], ['9c'], ['8c']],
    trump: 's',
    trick: [{ player: 3, card: 'Th' }],
    turn: 0,
  });
  const { evals } = evaluateMoves(deal, 0);
  assert.equal(evals[0].card, '7h');
});

test('win met de goedkoopste zekere kaart', () => {
  // Zuid is laatste, heeft Ah en Th, Kh ligt voor.
  const deal = makeDeal({
    hands: [['Ah', 'Th'], ['7c'], ['8c'], ['9c']],
    trump: 's',
    trick: [{ player: 1, card: 'Kh' }, { player: 2, card: '7h' }, { player: 3, card: '8h' }],
    turn: 0,
  });
  const { evals } = evaluateMoves(deal, 0);
  assert.equal(evals[0].card, 'Ah');
});

test('troefadvies: lange kleur met manille en aas', () => {
  const hand = ['Th', 'Ah', 'Kh', '9h', '7s', '8c', '9c', 'Jd'];
  const opts = trumpOptions(hand);
  assert.equal(opts[0].trump, 'h');
  assert.match(opts[0].reasons.join(' '), /Manille én aas/);
});

test('determinisatie respecteert bekende renonces', () => {
  const game = createGame({ seed: 3 });
  const deal = startDeal(game);
  setTrump(deal, 'h');
  deal.voids[1].h = true;
  deal.hands[1] = deal.hands[1].filter((c) => suitOf(c) !== 'h');
  // Zorg dat de aantallen kloppen: verwijder evenveel kaarten bij speler 0 zodat het totaal 32 blijft niet nodig; unseen = rest.
  const rng = () => Math.random();
  for (let i = 0; i < 20; i++) {
    const d = determinize(deal, 0, rng);
    assert.ok(d.hands[1].every((c) => suitOf(c) !== 'h'));
    assert.equal(d.hands[1].length, deal.hands[1].length);
    assert.equal(d.hands[0].join(), deal.hands[0].join());
  }
});

test('advies met simulaties geeft verwachte punten per kaart', () => {
  const game = createGame({ seed: 5 });
  const deal = startDeal(game);
  setTrump(deal, chooseTrump(deal.hands[deal.dealer]));
  const p = deal.turn;
  const a = advise(deal, p, { simulations: 20 });
  assert.ok(legalMoves(deal, p).includes(a.best.card));
  assert.ok(a.evals.every((e) => typeof e.expected === 'number' && e.expected >= 0 && e.expected <= 60));
});

test('troefadvies met simulaties', () => {
  const game = createGame({ seed: 8 });
  const deal = startDeal(game);
  const a = adviseTrump(deal, deal.dealer, { simulations: 10 });
  assert.equal(a.options.length, 5);
  assert.ok(a.options.every((o) => typeof o.expected === 'number'));
  assert.ok(['h', 's', 'd', 'c', 'sans'].includes(a.best.trump));
});

test('bestMove is een toegelaten kaart', () => {
  const game = createGame({ seed: 9 });
  const deal = startDeal(game);
  setTrump(deal, 'd');
  assert.ok(legalMoves(deal, deal.turn).includes(bestMove(deal, deal.turn)));
});
