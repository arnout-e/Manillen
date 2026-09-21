// Adviseur: beoordeelt elke toegelaten kaart, legt uit waarom, en verfijnt
// de rangschikking met simulaties van de verborgen handen.
// Dezelfde heuristiek stuurt de computerspelers: die zien enkel hun eigen kaarten
// en wat er openbaar op tafel gebeurde. Ze spieken niet.

import {
  DECK, SUITS, SUIT_NAME, RANK_NAME, suitOf, valueOf, orderOf, cardName, partnerOf, teamOf, sameTeam,
  trumpSuitOf, legalMovesExplained, trickInfo, beats, playCard, cloneDeal, setTrump, makeRng, shuffle,
} from './engine.js';

const pct = (p) => `${Math.round(p * 100)}%`;
const listNames = (cards) => cards.map(cardName).join(', ');

// Kans dat een hand van h kaarten, getrokken uit U onbekende kaarten, géén van k specifieke kaarten bevat.
function probNone(k, U, h) {
  if (k <= 0) return 1;
  if (h <= 0) return 1;
  if (k > U - h) return 0;
  let p = 1;
  for (let i = 0; i < h; i++) p *= (U - k - i) / (U - i);
  return p;
}

// Alles wat de speler weet, netjes bij elkaar.
export function buildContext(deal, player) {
  const trump = trumpSuitOf(deal);
  const hand = deal.hands[player];
  const played = new Set(deal.played);
  const unseen = DECK.filter((c) => !played.has(c) && !hand.includes(c));
  const U = unseen.length;
  const bySuit = (cards) => Object.fromEntries(SUITS.map((s) => [s, cards.filter((c) => suitOf(c) === s)]));
  const unseenBySuit = bySuit(unseen);
  const handBySuit = bySuit(hand);
  const partner = partnerOf(player);
  const others = [0, 1, 2, 3].filter((p) => p !== player);
  const handSize = (p) => deal.hands[p].length;

  // Kan speler p deze kaart in handen hebben, gelet op wat hij toonde?
  const couldHold = (p, c) => {
    const s = suitOf(c);
    if (deal.voids[p][s]) return false;
    const m = deal.maxRank[p][s];
    if (m != null && orderOf(c) > m) return false;
    return true;
  };
  // Kans dat speler p geen enkele kaart van kleur s heeft.
  const pVoid = (p, s) => {
    if (deal.voids[p][s]) return 1;
    const k = unseenBySuit[s].filter((c) => couldHold(p, c)).length;
    return probNone(k, U, handSize(p));
  };
  // Kans dat speler p minstens één van deze kaarten heeft.
  const pHoldsAny = (p, cards) => {
    const k = cards.filter((c) => couldHold(p, c)).length;
    return 1 - probNone(k, U, handSize(p));
  };
  const isMaster = (c) => !unseenBySuit[suitOf(c)].some((u) => orderOf(u) > orderOf(c));
  const higherOut = (c) => unseenBySuit[suitOf(c)].filter((u) => orderOf(u) > orderOf(c));
  const trumpsUnseen = trump ? unseenBySuit[trump].length : 0;
  const myTrumps = trump ? handBySuit[trump].length : 0;
  const opps = others.filter((p) => !sameTeam(p, player));

  // Kans dat minstens één van `players` de kaart `top` nog kan kloppen in een slag met gevraagde kleur `led`.
  // Ze zijn verplicht te kloppen als ze kunnen, dus "kan" is hier ook "zal".
  const pBeatenBy = (top, led, players) => {
    if (!players.length) return 0;
    let none = 1;
    for (const p of players) {
      const beaters = unseen.filter((u) => beats(u, top, led, trump) && couldHold(p, u));
      const inLed = beaters.filter((u) => suitOf(u) === led);
      const withTrump = trump && led !== trump ? beaters.filter((u) => suitOf(u) === trump) : [];
      const pSuit = pHoldsAny(p, inLed);
      const pTrump = withTrump.length ? pVoid(p, led) * pHoldsAny(p, withTrump) : 0;
      const pThis = 1 - (1 - pSuit) * (1 - pTrump);
      none *= 1 - pThis;
    }
    return 1 - none;
  };
  // Kans dat een tegenstander kan troeven als ik kleur s uitkom (niet-troef).
  const oppTrumpRisk = (s) => {
    if (!trump || s === trump || trumpsUnseen === 0) return 0;
    let none = 1;
    for (const p of opps) none *= 1 - pVoid(p, s) * (1 - probNone(unseenBySuit[trump].filter((c) => couldHold(p, c)).length, U, handSize(p)));
    return 1 - none;
  };
  const partnerMayTrump = trump && !deal.voids[partner][trump] && trumpsUnseen > 0;

  return {
    trump, hand, unseen, U, unseenBySuit, handBySuit, partner, opps, handSize, couldHold, pVoid, pHoldsAny,
    isMaster, higherOut, trumpsUnseen, myTrumps, pBeatenBy, oppTrumpRisk, partnerMayTrump,
    partnerChoseTrump: deal.chooser === partner && trump != null,
    oppChoseTrump: !sameTeam(deal.chooser, player) && trump != null,
    sans: deal.trump === 'sans',
  };
}

// Hoe kostbaar is het om deze kaart nu op te spelen?
function resourceCost(ctx, c) {
  const s = suitOf(c);
  if (ctx.trump && s === ctx.trump) return ctx.isMaster(c) ? 3 : 1.2 + orderOf(c) * 0.15;
  if (ctx.isMaster(c)) return 1.5;
  return 0;
}

function voidBonus(ctx, c, reasons) {
  const s = suitOf(c);
  if (!ctx.trump || s === ctx.trump || ctx.myTrumps === 0 || valueOf(c) > 0) return 0;
  if (ctx.handBySuit[s].length === 1) {
    reasons.push(`Je laatste ${SUIT_NAME[s]}: daarna kan je die kleur troeven.`);
    return 1.2;
  }
  return 0;
}

// ---------- Uitkomen ----------

function evalLead(ctx, c) {
  const s = suitOf(c);
  const v = valueOf(c);
  const reasons = [];
  let score = 0;
  const master = ctx.isMaster(c);
  const suitLen = ctx.handBySuit[s].length;
  const higher = ctx.higherOut(c);

  if (ctx.trump && s === ctx.trump) {
    if (ctx.trumpsUnseen === 0) {
      score += 2 + v;
      reasons.push('De anderen hebben geen troef meer: deze slag is voor jou.');
    } else if (master) {
      score += 7 + v * 0.5;
      reasons.push(`Hoogste troef die nog in het spel is. Je wint zeker en je trekt troeven (de anderen hebben er samen nog ${ctx.trumpsUnseen}).`);
    } else if (ctx.myTrumps >= ctx.trumpsUnseen) {
      score += 3 - v * 0.8;
      reasons.push(`Troef trekken: jij hebt ${ctx.myTrumps} troeven, de anderen samen nog ${ctx.trumpsUnseen}. Zo haal je hun troeven eruit.`);
      if (v > 0) reasons.push(`Liever een lagere troef: ${listNames(higher)} zit nog buiten en pakt deze ${RANK_NAME[c[0]]}.`);
    } else {
      score -= 2 + v;
      reasons.push(`Je hebt maar ${ctx.myTrumps} troeven tegenover ${ctx.trumpsUnseen} bij de anderen. Hou ze om later een slag te pakken.`);
    }
    if (ctx.partnerChoseTrump && !master) {
      score += 1.5;
      reasons.push('Je maat koos troef: troef spelen helpt hem zijn troeven uit te spelen.');
    }
    if (ctx.oppChoseTrump && !master) {
      score -= 1.5;
      reasons.push('De tegenpartij koos troef en zit wellicht sterker in troef.');
    }
    return { score, reasons };
  }

  if (master) {
    score += 4 + v;
    reasons.push(`Hoogste ${SUIT_NAME[s]} die nog in het spel is (meester).`);
    const risk = ctx.oppTrumpRisk(s);
    if (risk > 0.15) {
      score -= risk * (v + 4);
      reasons.push(`Kans ${pct(risk)} dat een tegenstander geen ${SUIT_NAME[s]} meer heeft en troeft.`);
    } else if (ctx.trump) {
      reasons.push('Weinig kans dat er getroefd wordt.');
    }
    if (higher.length === 0 && ctx.unseenBySuit[s].length === 0) {
      score -= 2;
      reasons.push(`Niemand heeft nog ${SUIT_NAME[s]}: wie geen troef heeft, gooit gewoon af.`);
    }
    return { score, reasons };
  }

  if (v > 0) {
    score -= v + 1;
    reasons.push(`${listNames(higher)} zit nog bij de anderen: je riskeert ${v} punt${v > 1 ? 'en' : ''} weg te geven.`);
    if (ctx.partner != null && ctx.pHoldsAny(ctx.partner, higher) > 0.5) reasons.push('Al kan die hogere kaart ook bij je maat zitten.');
    return { score, reasons };
  }

  score += 1;
  reasons.push('Lage kaart: je geeft geen punten weg.');
  const risk = ctx.oppTrumpRisk(s);
  if (suitLen <= 2 && ctx.myTrumps > 0 && ctx.trump) {
    score += 1.5;
    reasons.push(`Kort in ${SUIT_NAME[s]}: na ${suitLen === 1 ? 'deze kaart' : 'twee keer'} ben je de kleur kwijt en kan je troeven.`);
  }
  if (ctx.trump && ctx.pVoid(ctx.partner, s) > 0.5 && ctx.partnerMayTrump) {
    score += 2.5;
    reasons.push(`Je maat heeft wellicht geen ${SUIT_NAME[s]} meer en kan troeven.`);
  }
  if (risk > 0.5 && ctx.myTrumps === 0) {
    score -= 1.5;
    reasons.push(`Een tegenstander heeft wellicht geen ${SUIT_NAME[s]} meer en troeft.`);
  }
  if (suitLen >= 4 && higher.length <= 2) {
    score += 0.5;
    reasons.push(`Lange kleur: na een paar rondes ${SUIT_NAME[s]} zijn de anderen die kwijt en word jij meester.`);
  }
  if (ctx.oppChoseTrump && ctx.higherOut(c).length && higher.some((h) => valueOf(h) >= 4)) {
    reasons.push('Je verkent de kleur zonder risico.');
  }
  return { score, reasons };
}

// ---------- Bijleggen ----------

function evalFollow(ctx, deal, player, c, legal) {
  const info = trickInfo(deal, player);
  const { trump, led, winning, partnerWinning, later, points: trickPts } = info;
  const s = suitOf(c);
  const v = valueOf(c);
  const reasons = [];
  let score = 0;
  const laterOpps = later.filter((p) => !sameTeam(p, player));
  const partnerLater = later.includes(ctx.partner);
  const wins = beats(c, winning.card, led, trump);
  const master = ctx.isMaster(c);
  const isLast = later.length === 0;

  if (partnerWinning && !wins) {
    const pLose = ctx.pBeatenBy(winning.card, led, laterOpps);
    if (pLose < 0.05) {
      score += v * 1.5 + 1;
      reasons.push(isLast ? 'Je maat wint de slag: leg punten bij (vetten).' : 'Je maat wint de slag en niemand kan er nog over: leg punten bij (vetten).');
      if (v === 0) reasons.push('Deze kaart brengt geen punten aan.');
    } else {
      score += v * 1.5 * (1 - pLose) - v * 1.5 * pLose;
      if (v > 0) reasons.push(`Je maat ligt voor, maar een tegenstander kan er nog over (kans ${pct(pLose)}). Punten bijleggen is een gok.`);
      else reasons.push('Je maat ligt voor, maar de slag is nog niet zeker: leg een kaart zonder punten.');
    }
    if (master && s !== led) {
      score -= 3;
      reasons.push(`Dit is je hoogste ${SUIT_NAME[s]} (meester): hou die voor een eigen slag.`);
    } else if (master && s === led && v > 0 && suitOf(winning.card) === trump && led !== trump) {
      score -= 1;
      reasons.push('Deze meester kan later zelf nog een slag winnen.');
    }
    if (!master && v > 0 && ctx.higherOut(c).length && s !== led) {
      score += 0.8;
      reasons.push(`${listNames(ctx.higherOut(c))} zit nog buiten: deze punten zou je later toch kwijtspelen.`);
    }
    score += voidBonus(ctx, c, reasons);
    return { score, reasons };
  }

  if (partnerWinning && wins) {
    const pLosePartner = ctx.pBeatenBy(winning.card, led, laterOpps);
    const pLoseMine = ctx.pBeatenBy(c, led, laterOpps);
    if (pLosePartner > 0.3 && pLoseMine < 0.1) {
      score += 3 + trickPts * 0.3 + v * 0.5;
      reasons.push(`Je neemt over van je maat met een zekere kaart: zo is de slag (${trickPts + v} punten) veilig. Anders kan een tegenstander er nog over (kans ${pct(pLosePartner)}).`);
    } else {
      score -= 2 + v * 0.5;
      reasons.push('Je maat wint de slag al: overnemen is overbodig.');
      if (master) {
        score -= 2;
        reasons.push('Je zou een meester verspillen.');
      }
    }
    return { score, reasons };
  }

  // De tegenpartij ligt voor.
  if (wins) {
    const p = ctx.pBeatenBy(c, led, laterOpps);
    const gain = trickPts + v;
    const cost = resourceCost(ctx, c);
    if (p < 0.05) {
      score += gain + 2 - cost;
      reasons.push(`Wint de slag (${gain} punten) en niemand kan er nog over.`);
    } else {
      score += (1 - p) * (gain + 2) - p * (v + 2) - cost;
      reasons.push(`Wint voorlopig (${gain} punten), maar een tegenstander kan er nog over (kans ${pct(p)}).`);
    }
    if (trump && s === trump && led !== trump) reasons.push(master ? 'Je troeft met je hoogste troef.' : 'Je troeft.');
    if (cost >= 3) reasons.push('Je gebruikt wel je hoogste troef: die is straks weg.');
    const cheaperWinners = legal.filter((o) => o !== c && beats(o, winning.card, led, trump) && ctx.pBeatenBy(o, led, laterOpps) < 0.05 && orderOf(o) < orderOf(c) && suitOf(o) === s);
    score -= orderOf(c) * 0.15;
    if (cheaperWinners.length) {
      score -= 1;
      reasons.push(`${listNames(cheaperWinners)} wint ook al: hou de hogere kaart voor later.`);
    } else if (p < 0.05 && legal.some((o) => o !== c && beats(o, winning.card, led, trump))) {
      reasons.push('Goedkoopste kaart die de slag zeker wint.');
    }
    if (partnerLater && p >= 0.05) reasons.push('Je maat komt nog na jou.');
    return { score, reasons };
  }

  // Ik kan de slag niet winnen.
  const pPartner = partnerLater ? ctx.pBeatenBy(winning.card, led, [ctx.partner]) : 0;
  if (pPartner > 0.4) {
    score += v * pPartner * 1.2 - v * (1 - pPartner);
    reasons.push(`Je maat komt nog en kan de slag pakken (kans ${pct(pPartner)}).`);
    if (v > 0) reasons.push('Dan zijn deze punten voor jullie.');
  } else {
    score -= v * 1.5;
    if (v > 0) reasons.push(`Je kan de slag niet winnen: geef geen ${v} punt${v > 1 ? 'en' : ''} mee aan de tegenpartij.`);
    else reasons.push('Je kan de slag niet winnen: leg een kaart zonder punten.');
  }
  if (master) {
    score -= 3;
    reasons.push(`Bewaar deze meester (hoogste ${SUIT_NAME[s]}) voor een latere slag.`);
  }
  score += voidBonus(ctx, c, reasons);
  if (trump && s === trump) {
    score -= 1;
    reasons.push('Je gooit een troef weg zonder de slag te winnen.');
  }
  return { score, reasons };
}

// Beoordeelt elke toegelaten kaart. Gesorteerd van beste naar slechtste.
export function evaluateMoves(deal, player) {
  const { cards: legal, rule } = legalMovesExplained(deal, player);
  const ctx = buildContext(deal, player);
  const empty = deal.trick.length === 0;
  const evals = legal.map((c) => {
    const r = empty ? evalLead(ctx, c) : evalFollow(ctx, deal, player, c, legal);
    return { card: c, score: r.score, reasons: r.reasons };
  });
  evals.sort((a, b) => b.score - a.score);
  if (legal.length === 1) evals[0].reasons.unshift('Enige toegelaten kaart.');
  return { evals, rule, legal };
}

export function bestMove(deal, player) {
  return evaluateMoves(deal, player).evals[0].card;
}

// ---------- Simulaties (determinisatie) ----------

// Verdeelt de onbekende kaarten willekeurig over de andere spelers, in lijn met wat zij al toonden.
export function determinize(deal, player, rng) {
  const ctx = buildContext(deal, player);
  const others = [0, 1, 2, 3].filter((p) => p !== player);
  const sizes = Object.fromEntries(others.map((p) => [p, deal.hands[p].length]));
  const consistent = (assign) => others.every((p) => assign[p].every((c) => ctx.couldHold(p, c)));
  let assign = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const cards = shuffle(ctx.unseen, rng);
    let i = 0;
    const a = {};
    for (const p of others) {
      a[p] = cards.slice(i, i + sizes[p]);
      i += sizes[p];
    }
    if (consistent(a)) {
      assign = a;
      break;
    }
    if (!assign) assign = a; // noodoplossing als niets past
  }
  // Probeer stapsgewijs: kaarten die maar bij één speler kunnen, eerst.
  if (!consistent(assign)) {
    const a = Object.fromEntries(others.map((p) => [p, []]));
    const cards = shuffle(ctx.unseen, rng).sort((x, y) => others.filter((p) => ctx.couldHold(p, x)).length - others.filter((p) => ctx.couldHold(p, y)).length);
    let ok = true;
    for (const c of cards) {
      const opts = others.filter((p) => a[p].length < sizes[p] && ctx.couldHold(p, c));
      if (!opts.length) {
        ok = false;
        break;
      }
      a[opts[Math.floor(rng() * opts.length)]].push(c);
    }
    if (ok) assign = a;
  }
  const d = cloneDeal(deal);
  for (const p of others) d.hands[p] = assign[p];
  return d;
}

function playOut(d) {
  while (d.phase === 'play') {
    const p = d.turn;
    playCard(d, p, bestMove(d, p));
  }
  return d.points;
}

// Speelt elke kandidaat n keer uit tegen willekeurige verdelingen van de onbekende kaarten.
// Geeft per kaart de gemiddelde eindscore van jouw ploeg in deze deal.
export function simulateMoves(deal, player, candidates, n, seed = 12345) {
  const rng = makeRng(seed);
  const totals = Object.fromEntries(candidates.map((c) => [c, 0]));
  for (let i = 0; i < n; i++) {
    const world = determinize(deal, player, rng);
    for (const c of candidates) {
      const d = cloneDeal(world);
      playCard(d, player, c);
      const pts = playOut(d);
      totals[c] += pts[teamOf(player)];
    }
  }
  return Object.fromEntries(candidates.map((c) => [c, totals[c] / n]));
}

// Volledig advies voor de speler aan zet.
export function advise(deal, player, { simulations = 100, seed } = {}) {
  const { evals, rule, legal } = evaluateMoves(deal, player);
  const result = { rule, evals, forced: legal.length === 1, simulations: 0, notes: [] };
  if (legal.length > 1 && simulations > 0) {
    const exp = simulateMoves(deal, player, legal, simulations, seed ?? deal.played.length * 7919 + 17);
    for (const e of evals) e.expected = exp[e.card];
    const heuristicBest = evals[0].card;
    evals.sort((a, b) => (b.expected + b.score * 0.25) - (a.expected + a.score * 0.25));
    result.simulations = simulations;
    if (evals[0].card !== heuristicBest) {
      const h = evals.find((e) => e.card === heuristicBest);
      result.notes.push(`De vuistregels wijzen naar ${cardName(heuristicBest)}, maar in ${simulations} uitgespeelde verdelingen levert ${cardName(evals[0].card)} gemiddeld ${(evals[0].expected - h.expected).toFixed(1)} punten meer op.`);
    }
  }
  result.best = evals[0];
  return result;
}

// ---------- Troef kiezen ----------

const TRUMP_BONUS = { T: 3.5, A: 2.5, K: 1.2, Q: 0.7, J: 0.4, 9: 0.2, 8: 0.2, 7: 0.2 };

export function trumpOptions(hand) {
  const options = [];
  for (const s of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === s).sort((a, b) => orderOf(b) - orderOf(a));
    const n = cards.length;
    const strength = n * 1.6 + cards.reduce((t, c) => t + TRUMP_BONUS[c[0]], 0);
    const reasons = [];
    const hasT = cards.some((c) => c[0] === 'T');
    const hasA = cards.some((c) => c[0] === 'A');
    if (n === 0) reasons.push('Je hebt deze kleur niet: de tegenpartij zou alle troeven hebben.');
    else {
      reasons.push(`${n} kaart${n > 1 ? 'en' : ''}: ${listNames(cards)}.`);
      if (hasT && hasA) reasons.push('Manille én aas: jij hebt de twee hoogste troeven en kan troef trekken.');
      else if (hasT) reasons.push('Je hebt de manille, de hoogste troef.');
      else if (hasA) reasons.push('De aas is je hoogste troef, maar de manille zit bij een ander.');
      else reasons.push('Zonder manille of aas verlies je het troefgevecht wellicht.');
      if (n >= 4) reasons.push('Vier of meer troeven: je houdt de controle over het spel.');
      else if (n <= 2) reasons.push('Weinig troeven: riskant, tenzij je maat er veel heeft.');
    }
    options.push({ trump: s, label: SUIT_NAME[s], strength, reasons });
  }
  const tens = hand.filter((c) => c[0] === 'T');
  const aces = hand.filter((c) => c[0] === 'A' && !tens.some((t) => suitOf(t) === suitOf(c)));
  const masters = tens.length + aces.length;
  const shortSuits = SUITS.filter((s) => hand.filter((c) => suitOf(c) === s).length <= 1).length;
  const sansStrength = masters * 2.6 + tens.length * 0.8 - shortSuits * 1.2 + 1;
  const sansReasons = [];
  sansReasons.push(`Zonder troef telt de score dubbel. Je hebt ${masters} zekere meester${masters !== 1 ? 's' : ''}: ${listNames([...tens, ...aces]) || 'geen'}.`);
  if (masters >= 3) sansReasons.push('Veel hoge kaarten verspreid over de kleuren: sterk zonder troef.');
  else sansReasons.push('Te weinig hoge kaarten om zonder troef te spelen.');
  if (shortSuits >= 2) sansReasons.push('Korte kleuren zijn zonder troef geen voordeel: je kan niet troeven.');
  options.push({ trump: 'sans', label: 'zonder troef (sans)', strength: sansStrength, reasons: sansReasons });
  options.sort((a, b) => b.strength - a.strength);
  return options;
}

export function chooseTrump(hand) {
  return trumpOptions(hand)[0].trump;
}

// Advies bij het kiezen van troef, met simulatie per optie.
export function adviseTrump(deal, player, { simulations = 40, seed = 777 } = {}) {
  const options = trumpOptions(deal.hands[player]);
  if (simulations > 0) {
    const rng = makeRng(seed);
    const totals = Object.fromEntries(options.map((o) => [o.trump, 0]));
    for (let i = 0; i < simulations; i++) {
      const world = determinize(deal, player, rng);
      for (const o of options) {
        const d = cloneDeal(world);
        setTrump(d, o.trump);
        const pts = playOut(d);
        totals[o.trump] += pts[teamOf(player)];
      }
    }
    for (const o of options) {
      o.expected = totals[o.trump] / simulations;
      o.expectedScore = (o.expected - 30) * (o.trump === 'sans' ? 2 : 1);
    }
    options.sort((a, b) => b.expectedScore + b.strength * 0.3 - (a.expectedScore + a.strength * 0.3));
  }
  return { options, best: options[0], simulations };
}
