// Spelmotor voor Manillen: kaarten, regels, slagen en telling.
// Geen UI-code hier: dit bestand draait ook in Node voor de tests.

export const SUITS = ['h', 's', 'd', 'c'];
export const SUIT_NAME = { h: 'harten', s: 'schoppen', d: 'ruiten', c: 'klaveren' };
export const SUIT_SYMBOL = { h: '♥', s: '♠', d: '♦', c: '♣' };
export const RANKS = ['7', '8', '9', 'J', 'Q', 'K', 'A', 'T']; // van laag naar hoog
export const RANK_LABEL = { 7: '7', 8: '8', 9: '9', J: 'B', Q: 'V', K: 'H', A: 'A', T: '10' };
export const RANK_NAME = { 7: 'zeven', 8: 'acht', 9: 'negen', J: 'boer', Q: 'vrouw', K: 'heer', A: 'aas', T: 'manille' };
export const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i]));
export const RANK_VALUE = { 7: 0, 8: 0, 9: 0, J: 1, Q: 2, K: 3, A: 4, T: 5 };
export const DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s));
export const TOTAL_POINTS = 60;
export const PLAYER_NAME = ['Zuid', 'West', 'Noord', 'Oost'];
export const PLAYER_LABEL = ['Zuid (jij)', 'West', 'Noord (je maat)', 'Oost'];

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const valueOf = (c) => RANK_VALUE[c[0]];
export const orderOf = (c) => RANK_ORDER[c[0]];
export const cardName = (c) => `${RANK_LABEL[c[0]]}${SUIT_SYMBOL[c[1]]}`;
export const cardLongName = (c) => `${SUIT_NAME[c[1]]} ${RANK_NAME[c[0]]}`;
export const partnerOf = (p) => (p + 2) % 4;
export const teamOf = (p) => p % 2;
export const nextPlayer = (p) => (p + 1) % 4;
export const sameTeam = (a, b) => teamOf(a) === teamOf(b);
export const trumpSuitOf = (deal) => (deal.trump === 'sans' || deal.trump == null ? null : deal.trump);

const SUIT_SORT = { h: 0, c: 1, d: 2, s: 3 };
export function sortHand(hand) {
  return [...hand].sort((a, b) => {
    if (suitOf(a) !== suitOf(b)) return SUIT_SORT[suitOf(a)] - SUIT_SORT[suitOf(b)];
    return orderOf(b) - orderOf(a);
  });
}

// Deterministische toevalsgenerator (mulberry32) zodat een deal herhaalbaar is.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Spel en deal ----------

export function createGame({ seed = Date.now() % 2147483647, firstDealer = 0, target = 101 } = {}) {
  return {
    seed,
    rng: makeRng(seed),
    scores: [0, 0], // team 0 = Zuid + Noord, team 1 = West + Oost
    target,
    dealer: firstDealer,
    dealNo: 0,
    deal: null,
    history: [],
  };
}

export function startDeal(game) {
  const cards = shuffle(DECK, game.rng);
  const hands = [0, 1, 2, 3].map((p) => sortHand(cards.slice(p * 8, p * 8 + 8)));
  const dealer = game.dealer;
  game.dealNo += 1;
  game.deal = {
    no: game.dealNo,
    dealer,
    chooser: dealer,
    phase: 'trump', // 'trump' → 'play' → 'done'
    trump: null, // kleur, 'sans' of null zolang niet gekozen
    hands,
    turn: dealer,
    leader: null,
    trick: [], // [{ player, card }]
    tricks: [], // [{ cards, winner, points, leader }]
    played: [],
    // Openbare informatie die iedereen aan tafel kan afleiden:
    voids: [0, 1, 2, 3].map(() => ({ h: false, s: false, d: false, c: false })),
    maxRank: [0, 1, 2, 3].map(() => ({ h: null, s: null, d: null, c: null })), // geen kaart hoger dan deze rangorde
    points: [0, 0],
    result: null,
  };
  return game.deal;
}

export function setTrump(deal, trump) {
  if (deal.phase !== 'trump') throw new Error('Troef is al gekozen.');
  if (trump !== 'sans' && !SUITS.includes(trump)) throw new Error('Ongeldige troef: ' + trump);
  deal.trump = trump;
  deal.phase = 'play';
  deal.leader = nextPlayer(deal.dealer);
  deal.turn = deal.leader;
}

// ---------- Slagregels ----------

// Slaat kaart `cand` de kaart `winning` die nu de slag heeft?
export function beats(cand, winning, led, trump) {
  const cs = suitOf(cand);
  const ws = suitOf(winning);
  if (trump && cs === trump && ws !== trump) return true;
  if (cs === ws) return orderOf(cand) > orderOf(winning);
  return false;
}

export function currentWinnerIndex(trick, trump) {
  if (!trick.length) return -1;
  const led = suitOf(trick[0].card);
  let w = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[w].card, led, trump)) w = i;
  }
  return w;
}

export function trickPoints(trick) {
  return trick.reduce((s, t) => s + valueOf(t.card), 0);
}

// Beschrijft de situatie in de lopende slag vanuit een speler.
export function trickInfo(deal, player) {
  const trump = trumpSuitOf(deal);
  const trick = deal.trick;
  if (!trick.length) return { empty: true, trump, led: null, winning: null, partnerWinning: false, later: [] };
  const led = suitOf(trick[0].card);
  const wIdx = currentWinnerIndex(trick, trump);
  const winning = trick[wIdx];
  const later = [];
  let p = nextPlayer(player);
  for (let i = trick.length + 1; i < 4; i++) {
    later.push(p);
    p = nextPlayer(p);
  }
  return { empty: false, trump, led, winning, partnerWinning: winning.player === partnerOf(player), later, points: trickPoints(trick) };
}

// Welke kaarten mag een speler leggen? Samen met de regel die dat bepaalt.
export function legalMovesExplained(deal, player) {
  const hand = deal.hands[player];
  const info = trickInfo(deal, player);
  if (info.empty) return { cards: [...hand], rule: 'Je komt uit: je mag elke kaart spelen.' };
  const { trump, led, winning, partnerWinning } = info;
  const inSuit = hand.filter((c) => suitOf(c) === led);
  const ledName = SUIT_NAME[led];
  if (inSuit.length) {
    if (partnerWinning) return { cards: inSuit, rule: `Je moet ${ledName} volgen. Je maat ligt voor, dus je hoeft niet hoger te leggen.` };
    const higher = inSuit.filter((c) => beats(c, winning.card, led, trump));
    if (higher.length) return { cards: higher, rule: `Je moet ${ledName} volgen én hoger leggen dan ${cardName(winning.card)}, want je kan dat.` };
    if (suitOf(winning.card) === trump && led !== trump) return { cards: inSuit, rule: `Je moet ${ledName} volgen. Er ligt al troef, dus hoger leggen kan niet.` };
    return { cards: inSuit, rule: `Je moet ${ledName} volgen. Je hebt niets hoger dan ${cardName(winning.card)}, dus je mag elke ${ledName} leggen.` };
  }
  if (partnerWinning) return { cards: [...hand], rule: `Je hebt geen ${ledName}. Je maat ligt voor, dus je mag alles bijleggen.` };
  if (!trump) return { cards: [...hand], rule: `Je hebt geen ${ledName}. Zonder troef mag je alles bijleggen.` };
  const trumps = hand.filter((c) => suitOf(c) === trump);
  if (!trumps.length) return { cards: [...hand], rule: `Je hebt geen ${ledName} en geen troef: je mag alles bijleggen.` };
  if (suitOf(winning.card) === trump) {
    const higher = trumps.filter((c) => orderOf(c) > orderOf(winning.card));
    if (higher.length) return { cards: higher, rule: `Je hebt geen ${ledName}. Er ligt al troef (${cardName(winning.card)}) van de tegenpartij en je kan overtroeven, dus dat moet.` };
    return { cards: [...hand], rule: `Je hebt geen ${ledName}. De tegenpartij troefde met ${cardName(winning.card)} en je kan niet overtroeven: je mag alles bijleggen.` };
  }
  return { cards: trumps, rule: `Je hebt geen ${ledName} en de tegenpartij ligt voor: je moet troeven.` };
}

export function legalMoves(deal, player) {
  return legalMovesExplained(deal, player).cards;
}

export function isLegal(deal, player, card) {
  return deal.phase === 'play' && deal.turn === player && legalMoves(deal, player).includes(card);
}

// Speelt een kaart. Werkt de openbare informatie bij en sluit de slag af als ze vol is.
export function playCard(deal, player, card) {
  if (!isLegal(deal, player, card)) throw new Error(`Ongeldige zet: ${card} door speler ${player}`);
  const info = trickInfo(deal, player);
  const trump = info.trump;
  if (!info.empty) {
    const { led, winning, partnerWinning } = info;
    const s = suitOf(card);
    if (s !== led) {
      deal.voids[player][led] = true;
      if (trump && !partnerWinning && s !== trump) {
        if (suitOf(winning.card) === trump) {
          const cur = deal.maxRank[player][trump];
          deal.maxRank[player][trump] = cur == null ? orderOf(winning.card) : Math.min(cur, orderOf(winning.card));
        } else {
          deal.voids[player][trump] = true;
        }
      }
    } else if (!partnerWinning && !beats(card, winning.card, led, trump) && suitOf(winning.card) === led) {
      // Kon niet hoger dan de winnende kaart in de gevraagde kleur.
      const cur = deal.maxRank[player][led];
      deal.maxRank[player][led] = cur == null ? orderOf(winning.card) : Math.min(cur, orderOf(winning.card));
    }
  }
  deal.hands[player] = deal.hands[player].filter((c) => c !== card);
  deal.played.push(card);
  deal.trick.push({ player, card });
  deal.turn = nextPlayer(player);
  if (deal.trick.length < 4) return { trickComplete: false };
  const wIdx = currentWinnerIndex(deal.trick, trump);
  const winner = deal.trick[wIdx].player;
  const points = trickPoints(deal.trick);
  deal.points[teamOf(winner)] += points;
  deal.tricks.push({ cards: deal.trick, winner, points, leader: deal.trick[0].player });
  deal.trick = [];
  deal.leader = winner;
  deal.turn = winner;
  if (deal.tricks.length === 8) {
    deal.phase = 'done';
    deal.result = dealResult(deal);
  }
  return { trickComplete: true, winner, points, dealDone: deal.phase === 'done' };
}

// De ploeg met meer dan 30 punten wint en schrijft het verschil met 30 op.
// Zonder troef (sans) telt dubbel.
export function dealResult(deal) {
  const [a, b] = deal.points;
  const multiplier = deal.trump === 'sans' ? 2 : 1;
  if (a === b) return { winnerTeam: null, score: 0, multiplier, points: [a, b] };
  const winnerTeam = a > b ? 0 : 1;
  const score = (Math.max(a, b) - 30) * multiplier;
  return { winnerTeam, score, multiplier, points: [a, b] };
}

export function finishDeal(game) {
  const deal = game.deal;
  if (deal.phase !== 'done') throw new Error('De deal is nog niet klaar.');
  const r = deal.result;
  if (r.winnerTeam != null) game.scores[r.winnerTeam] += r.score;
  game.history.push({ no: deal.no, dealer: deal.dealer, trump: deal.trump, ...r });
  game.dealer = nextPlayer(deal.dealer);
  return r;
}

export function gameOver(game) {
  return game.scores.some((s) => s >= game.target);
}

// Ondiepe maar voldoende kopie van een deal, voor simulaties.
export function cloneDeal(deal) {
  return {
    ...deal,
    hands: deal.hands.map((h) => [...h]),
    trick: deal.trick.map((t) => ({ ...t })),
    tricks: [...deal.tricks],
    played: [...deal.played],
    voids: deal.voids.map((v) => ({ ...v })),
    maxRank: deal.maxRank.map((v) => ({ ...v })),
    points: [...deal.points],
  };
}
