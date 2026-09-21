// Interface: tafel, hand, adviespaneel. Alle spellogica zit in engine.js en advisor.js.
import {
  SUITS, SUIT_NAME, SUIT_SYMBOL, RANKS, RANK_LABEL, PLAYER_NAME, PLAYER_LABEL, suitOf, rankOf, valueOf, orderOf, cardName,
  cardLongName, partnerOf, teamOf, trumpSuitOf, createGame, startDeal, setTrump, playCard, finishDeal, gameOver,
  legalMovesExplained, isLegal,
} from './engine.js';
import { advise, adviseTrump, chooseTrump, bestMove } from './advisor.js';

const SPEEDS = { snel: 350, normaal: 750, traag: 1300 };
const SEAT = ['south', 'west', 'north', 'east'];
const RED = { h: true, d: true };

const store = {
  get(k, dflt) { try { const v = localStorage.getItem(k); return v ? { ...dflt, ...JSON.parse(v) } : dflt; } catch { return dflt; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* geen opslag beschikbaar */ } },
};

const S = {
  settings: store.get('manillen.settings', { mode: 'vooraf', sims: 100, speed: 'normaal' }),
  stats: store.get('manillen.stats', { total: 0, followed: 0, deals: 0 }),
  game: null, deal: null, advice: null, trumpAdvice: null, feedback: null, lastTrick: null, computing: false, timer: null, log: [],
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mini = (c) => `<span class="mini ${RED[suitOf(c)] ? 'red' : ''}">${cardName(c)}</span>`;
const cardHtml = (c, cls = '', attrs = '') => `<div class="card ${RED[suitOf(c)] ? 'red' : ''} ${cls}" data-card="${c}" ${attrs}><span class="r">${RANK_LABEL[rankOf(c)]}${valueOf(c) ? `<small>${valueOf(c)} pt</small>` : ''}</span><span class="s">${SUIT_SYMBOL[suitOf(c)]}</span></div>`;
const trumpLabel = (t) => (t === 'sans' ? 'zonder troef' : t ? `${SUIT_SYMBOL[t]} ${SUIT_NAME[t]}` : 'nog te kiezen');
const delay = () => SPEEDS[S.settings.speed] ?? 750;

function schedule(fn, ms) {
  clearTimeout(S.timer);
  S.timer = setTimeout(fn, ms);
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Spelverloop ----------

function newGame() {
  S.game = createGame({ firstDealer: 0 });
  S.log = [];
  newDeal();
}

function newDeal() {
  S.deal = startDeal(S.game);
  S.advice = null; S.trumpAdvice = null; S.feedback = null; S.lastTrick = null;
  render();
  step();
}

function step() {
  const d = S.deal;
  if (d.phase === 'trump') {
    if (d.chooser === 0) {
      computeTrumpAdvice();
      return;
    }
    schedule(() => {
      setTrump(d, chooseTrump(d.hands[d.chooser]));
      render();
      step();
    }, delay());
    return;
  }
  if (d.phase === 'play') {
    if (d.turn === 0) {
      computeAdvice();
      return;
    }
    schedule(() => {
      const p = d.turn;
      const r = playCard(d, p, bestMove(d, p));
      afterPlay(r);
    }, delay());
    return;
  }
  render();
}

function afterPlay(r) {
  if (r.trickComplete) {
    S.lastTrick = S.deal.tricks[S.deal.tricks.length - 1];
    render();
    schedule(() => {
      S.lastTrick = null;
      if (S.deal.phase === 'done') {
        finishDeal(S.game);
        S.stats.deals += 1;
        store.set('manillen.stats', S.stats);
      }
      render();
      step();
    }, delay() * 2.2);
  } else {
    render();
    step();
  }
}

function computeAdvice() {
  S.computing = true;
  render();
  setTimeout(() => {
    S.advice = advise(S.deal, 0, { simulations: Number(S.settings.sims) });
    S.computing = false;
    render();
  }, 20);
}

function computeTrumpAdvice() {
  S.computing = true;
  render();
  setTimeout(() => {
    S.trumpAdvice = adviseTrump(S.deal, 0, { simulations: Number(S.settings.sims) > 0 ? 40 : 0 });
    S.computing = false;
    render();
  }, 20);
}

function userPlay(card) {
  const d = S.deal;
  if (d.phase !== 'play' || d.turn !== 0 || S.computing) return;
  if (!isLegal(d, 0, card)) {
    toast(legalMovesExplained(d, 0).rule);
    return;
  }
  const adv = S.advice;
  if (adv && !adv.forced) {
    S.stats.total += 1;
    if (adv.best.card === card) S.stats.followed += 1;
    store.set('manillen.stats', S.stats);
    S.feedback = S.settings.mode === 'geen' ? null : { card, advice: adv, trickNo: d.tricks.length + 1 };
  } else {
    S.feedback = null;
  }
  S.advice = null;
  const r = playCard(d, 0, card);
  afterPlay(r);
}

function userTrump(t) {
  const d = S.deal;
  if (d.phase !== 'trump' || d.chooser !== 0) return;
  const adv = S.trumpAdvice;
  if (adv) {
    S.stats.total += 1;
    if (adv.best.trump === t) S.stats.followed += 1;
    store.set('manillen.stats', S.stats);
    S.feedback = S.settings.mode === 'geen' ? null : { trump: t, advice: adv };
  }
  setTrump(d, t);
  S.trumpAdvice = null;
  render();
  step();
}

// ---------- Weergave ----------

function render() {
  renderScore();
  renderTable();
  renderHand();
  renderPanel();
}

function renderScore() {
  const g = S.game, d = S.deal;
  const chips = [
    `<div class="score"><span class="who">Wij</span><span class="n">${g.scores[0]}</span></div>`,
    `<div class="score"><span class="who">Zij</span><span class="n">${g.scores[1]}</span></div>`,
    `<span class="chip">Deal ${d.no}</span>`,
    `<span class="chip">Deler: ${PLAYER_NAME[d.dealer]}</span>`,
    `<span class="chip ${RED[d.trump] ? 'red' : ''} ${d.trump ? 'accent' : ''}">Troef: ${trumpLabel(d.trump)}</span>`,
    d.phase !== 'trump' ? `<span class="chip">Deze deal: wij ${d.points[0]} · zij ${d.points[1]}</span>` : '',
  ];
  $('scoreboard').innerHTML = chips.join('');
}

// Wat weet iedereen aan tafel over speler p? Enkel tonen als het nog iets zegt.
function knowledge(p) {
  const d = S.deal;
  const trump = trumpSuitOf(d);
  const played = new Set(d.played);
  const out = [];
  for (const s of SUITS) {
    const stillOut = RANKS.filter((r) => !played.has(r + s) && !d.hands[0].includes(r + s));
    if (!stillOut.length) continue;
    if (d.voids[p][s]) out.push(`geen ${SUIT_SYMBOL[s]}${s === trump ? ' (troef)' : ''}`);
    else if (d.maxRank[p][s] != null && stillOut.some((r) => orderOf(r + s) > d.maxRank[p][s])) out.push(`geen ${SUIT_SYMBOL[s]} boven ${RANK_LABEL[RANKS[d.maxRank[p][s]]]}`);
  }
  return out;
}

function renderTable() {
  const d = S.deal;
  const seats = [0, 1, 2, 3].map((p) => {
    const tags = [];
    if (d.dealer === p) tags.push('<span class="tag">deler</span>');
    if (d.trump && d.chooser === p) tags.push('<span class="tag">koos troef</span>');
    if (d.phase !== 'done' && d.turn === p && !S.lastTrick) tags.push('<span class="tag turn">aan zet</span>');
    const backs = p === 0 ? '' : `<div class="backs">${'<span class="back"></span>'.repeat(d.hands[p].length)}</div>`;
    const know = p === 0 ? '' : `<div class="know">${knowledge(p).join(' · ') || '&nbsp;'}</div>`;
    return `<div class="seat ${SEAT[p]} ${d.turn === p && d.phase === 'play' && !S.lastTrick ? 'active' : ''}"><div class="name">${PLAYER_LABEL[p]}</div><div class="tags">${tags.join('')}</div>${backs}${know}</div>`;
  });
  let center = '';
  if (d.phase === 'trump') {
    if (d.chooser === 0) {
      const adv = S.trumpAdvice;
      const opts = ['h', 'c', 'd', 's', 'sans'].map((t) => {
        const o = adv?.options.find((x) => x.trump === t);
        const exp = o?.expectedScore != null ? `<span class="exp">${o.expectedScore >= 0 ? '+' : ''}${o.expectedScore.toFixed(1)}</span>` : '';
        const sym = t === 'sans' ? '<span class="sym">∅</span>' : `<span class="sym ${RED[t] ? 'red' : ''}">${SUIT_SYMBOL[t]}</span>`;
        return `<button class="trump-btn ${adv?.best.trump === t && S.settings.mode === 'vooraf' ? 'best' : ''}" data-trump="${t}">${sym}<span>${t === 'sans' ? 'sans' : SUIT_NAME[t]}</span>${exp}</button>`;
      });
      center = `<div class="trump-pick"><div class="title">Jij deelt: kies troef</div><div class="options">${opts.join('')}</div>${S.computing ? '<div class="notice">Even rekenen…</div>' : ''}</div>`;
    } else {
      center = `<div class="notice"><strong>${PLAYER_NAME[d.chooser]}</strong> deelt en kiest troef…</div>`;
    }
  } else if (d.phase === 'done' && !S.lastTrick) {
    const r = d.result;
    const ours = r.winnerTeam === 0;
    const title = r.winnerTeam == null ? 'Gelijk: 30 tegen 30' : ours ? `Gewonnen: +${r.score}` : `Verloren: ${r.score} voor hen`;
    center = `<div class="result"><h2>${title}</h2><div class="pts">Wij ${r.points[0]} · zij ${r.points[1]} punten${r.multiplier > 1 ? ' · dubbel (sans)' : ''}</div><button class="btn primary" id="next-deal">${gameOver(S.game) ? 'Nieuw spel' : 'Volgende deal'}</button></div>`;
  } else {
    const trick = S.lastTrick ? S.lastTrick.cards : d.trick;
    const winner = S.lastTrick ? S.lastTrick.winner : null;
    const slots = trick.map((t) => `<div class="slot p${t.player} ${t.player === winner ? 'winner' : ''}">${cardHtml(t.card)}<span class="who">${PLAYER_NAME[t.player]}</span></div>`);
    const res = S.lastTrick ? `<div class="trick-result">${PLAYER_NAME[winner]} pakt de slag: ${S.lastTrick.points} punt${S.lastTrick.points === 1 ? '' : 'en'}</div>` : '';
    const empty = !trick.length && d.turn !== 0 ? `<div class="notice">${PLAYER_NAME[d.turn]} komt uit…</div>` : '';
    center = `<div class="trick">${slots.join('')}</div>${res}${empty}`;
  }
  $('table').innerHTML = seats.join('') + `<div class="center">${center}</div>`;
}

function renderHand() {
  const d = S.deal;
  const myTurn = d.phase === 'play' && d.turn === 0 && !S.lastTrick && !S.computing;
  const legal = myTurn ? new Set(legalMovesExplained(d, 0).cards) : null;
  const advised = myTurn && S.settings.mode === 'vooraf' && S.advice && !S.advice.forced ? S.advice.best.card : null;
  $('hand').innerHTML = d.hands[0].map((c) => {
    const cls = myTurn ? (legal.has(c) ? 'legal' : 'illegal') : 'waiting';
    return cardHtml(c, `${cls} ${advised === c ? 'advised' : ''}`, 'tabindex="0" role="button"');
  }).join('');
  let hint = '';
  if (d.phase === 'trump') hint = d.chooser === 0 ? 'Bekijk je kaarten en kies troef op de tafel.' : 'Wachten op de troefkeuze.';
  else if (S.computing) hint = 'Even rekenen…';
  else if (myTurn) hint = S.advice?.forced ? 'Je hebt maar één toegelaten kaart.' : 'Klik op een kaart om ze te spelen.';
  else if (d.phase === 'play') hint = 'De anderen spelen…';
  $('hand-hint').textContent = hint;
}

function reasonsHtml(reasons) {
  return `<ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
}

function optionsTable(evals, bestCard) {
  const rows = evals.map((e) => `<tr class="${e.card === bestCard ? 'best' : ''}"><td class="mini ${RED[suitOf(e.card)] ? 'red' : ''}">${cardName(e.card)}</td><td class="exp">${e.expected != null ? `${e.expected.toFixed(1)} pt` : ''}</td><td>${esc(e.reasons[0] || '')}</td></tr>`);
  return `<table class="options"><tbody>${rows.join('')}</tbody></table>`;
}

function renderPanel() {
  const d = S.deal;
  const blocks = [];
  const mode = S.settings.mode;

  // 1. Advies of status
  if (d.phase === 'trump' && d.chooser === 0) {
    const adv = S.trumpAdvice;
    if (S.computing || !adv) blocks.push('<div class="block"><h2>Troef kiezen</h2><p>Even rekenen…</p></div>');
    else if (mode === 'vooraf') {
      const b = adv.best;
      blocks.push(`<div class="block"><h2>Advies: ${b.trump === 'sans' ? 'zonder troef' : `${SUIT_SYMBOL[b.trump]} ${b.label}`}</h2>${reasonsHtml(b.reasons)}${adv.simulations ? `<p class="stats">In ${adv.simulations} uitgespeelde verdelingen: gemiddeld ${b.expected.toFixed(1)} punten voor jullie.</p>` : ''}<h3>Alle opties</h3><table class="options"><tbody>${adv.options.map((o) => `<tr class="${o === b ? 'best' : ''}"><td class="mini ${RED[o.trump] ? 'red' : ''}">${o.trump === 'sans' ? 'sans' : SUIT_SYMBOL[o.trump] + ' ' + o.label}</td><td class="exp">${o.expectedScore != null ? `${o.expectedScore >= 0 ? '+' : ''}${o.expectedScore.toFixed(1)}` : ''}</td><td>${esc(o.reasons[1] || o.reasons[0])}</td></tr>`).join('')}</tbody></table><div class="actions"><button class="btn primary" data-trump="${b.trump}">Kies ${b.trump === 'sans' ? 'sans' : b.label}</button></div></div>`);
    } else {
      blocks.push(`<div class="block"><h2>Troef kiezen</h2><p>${mode === 'achteraf' ? 'Kies zelf. Daarna vergelijk ik met het advies.' : 'Kies zelf een troef.'}</p><p class="stats">Vuistregel: je langste kleur, liefst met manille of aas.</p></div>`);
    }
  } else if (d.phase === 'play' && d.turn === 0 && !S.lastTrick) {
    const adv = S.advice;
    const rule = legalMovesExplained(d, 0).rule;
    if (S.computing || !adv) blocks.push(`<div class="block"><h2>Jij bent aan zet</h2><div class="rule">${esc(rule)}</div><p>Even rekenen…</p></div>`);
    else if (adv.forced) {
      blocks.push(`<div class="block"><h2>Verplichte kaart</h2><div class="rule">${esc(rule)}</div><div class="advice">${cardHtml(adv.best.card)}<div class="why">${reasonsHtml(adv.best.reasons.slice(1))}</div></div><div class="actions"><button class="btn primary" data-play="${adv.best.card}">Speel ${cardName(adv.best.card)}</button></div></div>`);
    } else if (mode === 'vooraf') {
      const b = adv.best;
      blocks.push(`<div class="block"><h2>Advies: speel ${cardName(b.card)}</h2><div class="rule">${esc(rule)}</div><div class="advice">${cardHtml(b.card)}<div class="why"><p><strong>${esc(cardLongName(b.card))}</strong>${b.expected != null ? ` · verwacht ${b.expected.toFixed(1)} pt voor jullie` : ''}</p>${reasonsHtml(b.reasons)}</div></div>${adv.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}<div class="actions"><button class="btn primary" data-play="${b.card}">Speel ${cardName(b.card)}</button></div><h3>Alle toegelaten kaarten</h3>${optionsTable(adv.evals, b.card)}${adv.simulations ? `<p class="stats">Verwachte punten: gemiddelde eindscore van jullie ploeg over ${adv.simulations} uitgespeelde verdelingen van de onbekende kaarten.</p>` : ''}</div>`);
    } else {
      blocks.push(`<div class="block"><h2>Jij bent aan zet</h2><div class="rule">${esc(rule)}</div><p>${mode === 'achteraf' ? 'Speel zelf een kaart. Daarna zie je wat de coach zou doen en waarom.' : 'Speel zelf. De coach zwijgt, maar telt wel mee hoe vaak je zijn keuze maakt.'}</p></div>`);
    }
  } else if (d.phase === 'play' || S.lastTrick) {
    blocks.push(`<div class="block"><h2>${S.lastTrick ? `${PLAYER_NAME[S.lastTrick.winner]} pakt de slag` : `${PLAYER_NAME[d.turn]} is aan zet`}</h2><p class="stats">Slag ${Math.min(d.tricks.length + (S.lastTrick ? 0 : 1), 8)} van 8</p></div>`);
  } else if (d.phase === 'done') {
    blocks.push(`<div class="block"><h2>Deal ${d.no} is gespeeld</h2><p>Troef was ${trumpLabel(d.trump)}, gekozen door ${PLAYER_NAME[d.chooser]}.</p></div>`);
  }

  // 2. Feedback op je laatste keuze
  const f = S.feedback;
  if (f && mode !== 'geen') {
    if (f.trump) {
      const adv = f.advice, chosen = adv.options.find((o) => o.trump === f.trump), best = adv.best;
      const good = f.trump === best.trump;
      blocks.push(`<div class="block feedback ${good ? 'good' : 'bad'}"><h2>${good ? 'Goede troefkeuze' : `Coach koos ${best.trump === 'sans' ? 'sans' : best.label}`}</h2><p>Jij koos ${chosen.trump === 'sans' ? 'zonder troef' : chosen.label}.</p>${reasonsHtml(good ? best.reasons : [...best.reasons.slice(0, 2), `Jouw keuze: ${chosen.reasons[1] || chosen.reasons[0]}`])}</div>`);
    } else {
      const adv = f.advice, best = adv.best, good = f.card === best.card;
      const mine = adv.evals.find((e) => e.card === f.card);
      const diff = mine?.expected != null && best.expected != null ? best.expected - mine.expected : null;
      blocks.push(`<div class="block feedback ${good ? 'good' : diff != null && diff < 1 ? 'good' : 'bad'}"><h2>${good ? `Goed gespeeld: ${cardName(f.card)}` : `Je speelde ${cardName(f.card)}, coach zegt ${cardName(best.card)}`}</h2>${good ? reasonsHtml(best.reasons) : `<p><strong>Waarom ${cardName(best.card)}:</strong></p>${reasonsHtml(best.reasons)}<p><strong>Over jouw ${cardName(f.card)}:</strong></p>${reasonsHtml(mine?.reasons || [])}${diff != null ? `<p class="stats">Verschil in verwachte punten: ${diff.toFixed(1)}${diff < 1 ? ' (bijna even goed)' : ''}.</p>` : ''}`}</div>`);
    }
  }

  // 3. Instellingen en statistiek
  const pctFollowed = S.stats.total ? Math.round((100 * S.stats.followed) / S.stats.total) : 0;
  blocks.push(`<div class="block"><h2>Coach</h2><div class="settings">
    <div class="row"><span class="label">Advies</span>
      <label><input type="radio" name="mode" value="vooraf" ${mode === 'vooraf' ? 'checked' : ''}> vooraf</label>
      <label><input type="radio" name="mode" value="achteraf" ${mode === 'achteraf' ? 'checked' : ''}> na mijn keuze</label>
      <label><input type="radio" name="mode" value="geen" ${mode === 'geen' ? 'checked' : ''}> geen</label></div>
    <div class="row"><label for="sims">Simulaties</label><select id="sims"><option value="0" ${S.settings.sims == 0 ? 'selected' : ''}>uit (enkel vuistregels)</option><option value="50" ${S.settings.sims == 50 ? 'selected' : ''}>50</option><option value="100" ${S.settings.sims == 100 ? 'selected' : ''}>100</option><option value="300" ${S.settings.sims == 300 ? 'selected' : ''}>300 (trager)</option></select>
      <label for="speed">Tempo</label><select id="speed"><option value="snel" ${S.settings.speed === 'snel' ? 'selected' : ''}>snel</option><option value="normaal" ${S.settings.speed === 'normaal' ? 'selected' : ''}>normaal</option><option value="traag" ${S.settings.speed === 'traag' ? 'selected' : ''}>traag</option></select></div>
    <div class="stats">Je volgde het advies ${S.stats.followed} van ${S.stats.total} keer (${pctFollowed}%) · ${S.stats.deals} deals gespeeld. <button class="btn" id="reset-stats" style="padding:2px 8px;font-size:.8rem">wis</button></div>
    <div class="actions"><button class="btn" id="new-game">Nieuw spel</button></div>
  </div></div>`);

  // 4. Kaarten in het spel
  const trump = trumpSuitOf(d);
  const played = new Set(d.played);
  const mine = new Set(d.hands[0]);
  const rows = ['h', 'c', 'd', 's'].map((s) => {
    const ranks = [...RANKS].reverse();
    const masterRank = ranks.find((r) => !played.has(r + s));
    const cells = ranks.map((r) => {
      const c = r + s;
      const cls = played.has(c) ? 'played' : mine.has(c) ? 'mine' : 'out';
      return `<span class="cell ${cls} ${r === masterRank && !played.has(c) ? 'master' : ''}" title="${esc(cardLongName(c))}">${RANK_LABEL[r]}</span>`;
    });
    return `<div class="suit-row"><span class="sym ${RED[s] ? 'red' : ''}">${SUIT_SYMBOL[s]}${s === trump ? '<small>*</small>' : ''}</span><div class="cells">${cells.join('')}</div></div>`;
  });
  const know = [1, 2, 3].map((p) => {
    const k = knowledge(p);
    return k.length ? `<li>${PLAYER_NAME[p]}: ${k.join(', ')}</li>` : '';
  }).join('');
  const trumpsOut = trump ? RANKS.filter((r) => !played.has(r + trump) && !mine.has(r + trump)).length : null;
  blocks.push(`<div class="block"><h2>Kaarten in het spel</h2><div class="tracker">${rows.join('')}<div class="legend">Geel: in jouw hand · doorstreept: al gespeeld · M: hoogste kaart die nog meedoet${trump ? ` · * troef: nog ${trumpsOut} bij de anderen` : ''}</div></div>${know ? `<ul class="knowledge">${know}</ul>` : ''}</div>`);

  // 5. Slagen
  if (d.tricks.length) {
    const items = d.tricks.map((t, i) => `<li><span class="n">${i + 1}.</span>${t.cards.map((x) => `<span>${PLAYER_NAME[x.player][0]} ${mini(x.card)}</span>`).join('')}<span class="win">${PLAYER_NAME[t.winner]} +${t.points}</span></li>`);
    blocks.push(`<div class="block"><h2>Slagen</h2><ul class="log">${items.join('')}</ul></div>`);
  }

  $('panel').innerHTML = blocks.join('');
}

// ---------- Gebeurtenissen ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-card], [data-play], [data-trump], #next-deal, #new-game, #reset-stats');
  if (!t) return;
  if (t.id === 'next-deal') {
    if (gameOver(S.game)) newGame(); else newDeal();
    return;
  }
  if (t.id === 'new-game') { newGame(); return; }
  if (t.id === 'reset-stats') { S.stats = { total: 0, followed: 0, deals: 0 }; store.set('manillen.stats', S.stats); render(); return; }
  if (t.dataset.trump) { userTrump(t.dataset.trump); return; }
  if (t.dataset.play) { userPlay(t.dataset.play); return; }
  if (t.dataset.card && t.closest('#hand')) userPlay(t.dataset.card);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.card && e.target.closest('#hand')) {
    e.preventDefault();
    userPlay(e.target.dataset.card);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'mode') S.settings.mode = el.value;
  else if (el.id === 'sims') S.settings.sims = Number(el.value);
  else if (el.id === 'speed') S.settings.speed = el.value;
  else return;
  store.set('manillen.settings', S.settings);
  const d = S.deal;
  if (el.id === 'sims' && d.phase === 'play' && d.turn === 0 && !S.lastTrick) computeAdvice();
  else if (el.id === 'sims' && d.phase === 'trump' && d.chooser === 0) computeTrumpAdvice();
  else render();
});

newGame();
