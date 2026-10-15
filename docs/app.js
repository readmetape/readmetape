// readmetape.com builder: paste a token, pick a look, copy the embed.
// Data comes straight from DexScreener and GeckoTerminal in this browser; the
// card is drawn by docs/lib/, the same renderer the CLI and the action use.
import * as W from './web.js';
import { formatPrice, formatUsd, formatChange, chainName, shortAddress } from './lib/format.js';

const $ = (id) => document.getElementById(id);
const els = {
  form: $('form'), token: $('token'), chain: $('chain'), go: $('go'), example: $('example'),
  plate: $('plate'), stage: $('stage'), status: $('status'), note: $('note'), controls: $('controls'),
  label: $('label'), nums: $('nums'), source: $('source'),
};

// ?api= points the page at local mock APIs. Only honoured on localhost.
const params = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const testApi = LOCAL ? params.get('api') : null;
const net = { dexApi: testApi || W.DEX_API, geckoApi: testApi || W.GECKO_API, retryDelayMs: testApi ? 30 : 1500 };

let state = W.readState(location.search);
let data = null; // { spec, token, coins: Map(timeframe or 'none' -> coin) }
let seq = 0;
let userBg = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- state <-> url and controls ----------

function syncUrl() {
  let q = W.writeState(state);
  if (testApi) q = (q ? `${q}&` : '?') + `api=${encodeURIComponent(testApi)}`;
  history.replaceState(null, '', location.pathname + q + location.hash);
}

function syncControls() {
  for (const seg of els.controls.querySelectorAll('.seg')) {
    const key = seg.dataset.key;
    const forTypes = seg.dataset.for?.split(' ');
    seg.hidden = forTypes ? !forTypes.includes(state.type) : false;
    const value = key === 'metric' ? W.metricFor(state) : state[key];
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === value));
  }
  $('look-name').textContent = state.type === 'card' ? 'theme' : 'style';
  $('win-name').textContent = state.type === 'badge' ? 'metric' : 'window';
  if (els.label.value !== state.label) els.label.value = state.label;
  els.go.textContent = `Build ${state.type}`;
  if (state.token && els.token.value.trim() === '') els.token.value = state.token;
  setChain(state.chain);
}

function setChain(chain) {
  if (![...els.chain.options].some((o) => o.value === chain)) els.chain.add(new Option(chain, chain));
  els.chain.value = chain;
}

function setBackdrop(bg, byUser = false) {
  if (byUser) userBg = true;
  els.plate.dataset.bg = bg;
  for (const b of document.querySelectorAll('.backs button')) b.setAttribute('aria-pressed', String(b.dataset.bg === bg));
}

// Dark card themes sit on a dark backdrop unless the visitor picked one.
function autoBackdrop() {
  if (userBg || state.type !== 'card') return;
  const bg = { cream: 'cream', espresso: 'espresso', dark: 'github_dark', github_dark: 'github_dark', light: 'github' }[state.theme];
  if (bg) setBackdrop(bg);
}

// ---------- embeds ----------

function updateEmbeds() {
  const token = data?.token ?? null;
  const s = { ...state, token: state.token };
  $('md-hosted').textContent = W.hostedMarkdown(s, token);
  $('url-hosted').textContent = W.hostedUrl(s);
  // "Open" previews the image on this deployment, so it also works on preview URLs.
  $('open-hosted').href = W.hostedUrl(s, location.origin);
  $('yaml-action').textContent = W.workflowYaml(s);
  $('md-action').textContent = W.actionMarkdown(s, token);
}

// ---------- preview states ----------

function setStatus(kind, text) {
  els.status.dataset.s = kind;
  els.status.textContent = text;
}

function setNote(text, tone = '') {
  els.note.textContent = text;
  if (tone) els.note.dataset.tone = tone;
  else delete els.note.dataset.tone;
}

function setNums(values, cls = {}) {
  for (const dd of els.nums.querySelectorAll('dd')) {
    const k = dd.dataset.k;
    dd.className = cls[k] || '';
    if (k === 'pair' && values.pairHtml) dd.innerHTML = values.pairHtml;
    else dd.textContent = values[k] ?? '--';
  }
}

function showLoading() {
  els.stage.dataset.state = 'loading';
  els.stage.setAttribute('aria-busy', 'true');
  els.stage.innerHTML = '<div class="skel" aria-label="loading"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><i class="e"></i><i class="f"></i></div>';
  setStatus('loading', 'loading');
  setNote('asking DexScreener and GeckoTerminal');
  const wait = { price: 'wait', change: 'wait', mcap: 'wait', liq: 'wait', vol: 'wait', pair: 'wait' };
  setNums({}, wait);
  els.go.disabled = true;
}

const TITLES = {
  RATE_LIMITED: 'rate limited', NETWORK: 'could not connect', TIMEOUT: 'no answer', HTTP: 'upstream error',
  BAD_ADDRESS: 'check the address', WRONG_CHAIN: 'check the chain', EMPTY: 'nothing to build yet',
};

function showError(err) {
  const code = err?.code || 'HTTP';
  const input = ['BAD_ADDRESS', 'WRONG_CHAIN', 'EMPTY'].includes(code);
  els.stage.dataset.state = 'error';
  els.stage.dataset.code = code;
  els.stage.setAttribute('aria-busy', 'false');
  els.stage.innerHTML =
    `<div class="err" role="alert"><span class="caps">${esc(TITLES[code] ?? 'error')}</span>` +
    `<b>${input ? 'that address will not work.' : 'no data right now.'}</b><p>${esc(err?.message || 'something went wrong. try again.')}</p></div>`;
  setStatus('error', input ? 'check input' : 'error');
  setNote(input ? '' : 'nothing was rendered, so nothing here is a real price.');
  setNums({});
  if (input) els.form.dataset.invalid = '';
  els.go.disabled = false;
}

function showCoin(coin) {
  els.stage.dataset.state = coin.token ? 'ok' : 'nopair';
  delete els.stage.dataset.code;
  els.stage.setAttribute('aria-busy', 'false');
  try {
    els.stage.innerHTML = W.renderPreview(coin, state);
  } catch (err) {
    return showError(err);
  }
  const t = coin.token;
  const time = new Date(coin.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setStatus('live', `live, ${time}`);
  if (!t) {
    setNote(`DexScreener has no trading pair for this address on ${chainName(coin.chain)} yet. this is what your README shows until it trades; if it trades elsewhere, pick that chain.`, 'warn');
    setNums({});
  } else {
    setNote(coin.warnings.length ? coin.warnings.join(' ') : `$${t.symbol} on ${chainName(coin.chain)}${t.dexId ? `, ${t.dexId}` : ''}. copy the embed below.`, coin.warnings.length ? 'warn' : '');
    const tf = state.type === 'badge' ? '24h' : coin.timeframe;
    const change = state.type === 'badge' ? t.change24h : coin.change;
    $('chg-name').textContent = `change ${tf}`;
    const mcap = t.marketCap ?? t.fdv;
    $('mcap-name').textContent = t.marketCap == null && t.fdv != null ? 'fdv' : 'market cap';
    const pairHtml = t.url && /^https:\/\//.test(t.url)
      ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.dexId || 'pair')} ${esc(shortAddress(t.pairAddress) || '')}</a>`
      : null;
    setNums(
      { price: formatPrice(t.priceUsd), change: formatChange(change), mcap: formatUsd(mcap), liq: formatUsd(t.liquidityUsd), vol: formatUsd(t.volume24h), pair: t.dexId, pairHtml },
      { price: 'key', change: typeof change === 'number' ? (change >= 0 ? 'up' : 'down') : '' },
    );
  }
  els.source.textContent = `prices from DexScreener, charts from GeckoTerminal, loaded ${time}. market data only, not financial advice.`;
  els.go.disabled = false;
  updateEmbeds();
}

// ---------- loading ----------

async function draw() {
  const d = data;
  if (!d) return;
  const my = ++seq;
  const chart = state.type !== 'badge';
  const key = chart ? state.timeframe : 'none';
  let coin = d.coins.get(key) ?? (chart ? null : d.coins.values().next().value);
  if (!coin) {
    showLoading();
    try {
      coin = await W.loadCoinWeb(d.spec, { timeframe: state.timeframe, chart, token: d.token, ...net });
    } catch (err) {
      if (my === seq) showError(err);
      return;
    }
    if (d !== data) return;
    d.token = coin.token;
    d.coins.set(key, coin);
  }
  if (my === seq) showCoin(coin);
}

function build() {
  delete els.form.dataset.invalid;
  let spec;
  try {
    spec = W.parseInput(els.token.value, els.chain.value);
  } catch (err) {
    data = null;
    seq++;
    return showError(err);
  }
  state.token = spec.address;
  state.chain = spec.chain;
  els.token.value = spec.address;
  setChain(spec.chain);
  data = { spec, token: undefined, coins: new Map() };
  syncUrl();
  updateEmbeds();
  return draw();
}

// ---------- events ----------

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  build();
});

els.example.addEventListener('click', (e) => {
  e.preventDefault();
  els.token.value = W.EXAMPLE.token;
  setChain(W.EXAMPLE.chain);
  build();
});

els.token.addEventListener('input', () => delete els.form.dataset.invalid);
els.chain.addEventListener('change', () => {
  state.chain = els.chain.value;
  if (data) build();
  else updateEmbeds();
});

els.controls.addEventListener('click', (e) => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  const key = b.parentElement.dataset.key;
  state[key] = b.dataset.v;
  if (key === 'type') state.metric = '';
  syncControls();
  autoBackdrop();
  syncUrl();
  updateEmbeds();
  draw();
});

let labelTimer;
els.label.addEventListener('input', () => {
  state.label = els.label.value.slice(0, 40);
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => {
    syncUrl();
    updateEmbeds();
    draw();
  }, 120);
});

for (const b of document.querySelectorAll('.backs button')) b.addEventListener('click', () => setBackdrop(b.dataset.bg, true));

// Tabs with arrow-key support.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
}
for (const t of tabs) {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
}

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', async () => {
    const text = $(b.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Copied';
    } catch {
      const r = document.createRange();
      r.selectNodeContents($(b.dataset.copy));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      b.textContent = 'Selected';
    }
    setTimeout(() => (b.textContent = 'Copy'), 1400);
  });
}

// ---------- start ----------

syncControls();
autoBackdrop();
updateEmbeds();
if (state.token) {
  els.token.value = state.token;
  build();
}
