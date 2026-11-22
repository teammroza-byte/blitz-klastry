'use strict';

const APP_VERSION = 'v1.0';

// Klastry wg strony pomocy Wargaming (PingPlotter). Lokalizacje EU wg graczy –
// prawdziwą odległość pokazuje ping.
const DEFAULT_REGIONS = {
  eu: {
    name: 'EU',
    clusters: [
      { domain: 'login0.wotblitz.eu', where: 'Amsterdam (Holandia)' },
      { domain: 'login1.wotblitz.eu', where: 'Amsterdam (Holandia)' },
      { domain: 'login2.wotblitz.eu', where: 'Frankfurt (Niemcy)' },
      { domain: 'login3.wotblitz.eu', where: 'Warszawa (Polska)' },
      { domain: 'login4.wotblitz.eu', where: '' }
    ]
  },
  na: {
    name: 'NA',
    clusters: [
      { domain: 'login0.wotblitz.com', where: '' },
      { domain: 'login1.wotblitz.com', where: '' },
      { domain: 'login2.wotblitz.com', where: '' }
    ]
  },
  asia: {
    name: 'ASIA',
    clusters: [
      { domain: 'login0.wotblitz.asia', where: '' },
      { domain: 'login1.wotblitz.asia', where: '' },
      { domain: 'login2.wotblitz.asia', where: '' }
    ]
  }
};

// ---------- Pamięć ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('bk:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bk:' + k, JSON.stringify(v)); } catch { /* ignoruj */ } }
};

const S = {
  region: store.get('region', 'eu'),
  extra: store.get('extra', { eu: [], na: [], asia: [] }), // klastry dodane ręcznie
  saved: new Set(),     // stan w pliku hosts
  desired: new Set(),   // stan ustawiony przełącznikami
  pings: {},
  pinging: false,
  busy: false,
  hasBackup: false,
  error: null
};

// W przeglądarce (bez .exe) – atrapa do podglądu wyglądu
const bridge = window.bridge || {
  _blocked: new Set(['login1.wotblitz.eu']),
  async state(domains) { return { ok: true, blocked: domains.filter((d) => this._blocked.has(d)), hasBackup: true }; },
  async apply(managed, block) { managed.forEach((d) => this._blocked.delete(d)); block.forEach((d) => this._blocked.add(d)); return { ok: true, blocked: block }; },
  async restore() { this._blocked.clear(); return { ok: true }; },
  async ping(d) { await new Promise((r) => setTimeout(r, 300)); const n = Number(d.match(/\d/)?.[0] || 0); return { ok: true, ip: `92.223.31.${130 + n}`, ms: [24, 27, 41, 18, 63][n] || 80 }; },
  openHosts() { toast('W aplikacji otworzy się Notatnik z plikiem hosts.'); },
  async confirm(_t, m) { return window.confirm(m); }
};

// ---------- Pomocnicze ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (d) => String(d || '').trim().toLowerCase();

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

function clusters(regionKey = S.region) {
  const base = DEFAULT_REGIONS[regionKey].clusters.map((c) => ({ ...c, custom: false }));
  const extra = (S.extra[regionKey] || []).map((d) => ({ domain: d, where: '', custom: true }));
  return [...base, ...extra];
}
function allDomains() {
  return Object.keys(DEFAULT_REGIONS).flatMap((r) => clusters(r).map((c) => c.domain));
}
const code = (domain) => {
  const m = domain.match(/^login(\d+)\./i);
  return m ? `C${m[1]}` : '•';
};
const pendingCount = () => allDomains().filter((d) => S.saved.has(d) !== S.desired.has(d)).length;

// ---------- Dane ----------
async function loadState() {
  const res = await bridge.state(allDomains());
  if (!res.ok) {
    S.error = res.error;
  } else {
    S.error = null;
    S.saved = new Set(res.blocked.map(norm));
    S.desired = new Set(S.saved);
    S.hasBackup = !!res.hasBackup;
  }
  render();
}

async function pingAll() {
  if (S.pinging) return;
  S.pinging = true;
  render();
  const list = clusters();
  for (const c of list) S.pings[c.domain] = { loading: true };
  render();
  await Promise.all(list.map(async (c) => {
    try { S.pings[c.domain] = await bridge.ping(c.domain); } catch { S.pings[c.domain] = { ok: false, error: 'Błąd' }; }
    render();
  }));
  S.pinging = false;
  render();
}

async function apply() {
  if (S.busy || !pendingCount()) return;
  // Zabezpieczenie: w każdym regionie musi zostać otwarty co najmniej jeden klaster
  for (const r of Object.keys(DEFAULT_REGIONS)) {
    const list = clusters(r);
    if (list.length && list.every((c) => S.desired.has(c.domain))) {
      toast(`Nie można zablokować wszystkich klastrów ${DEFAULT_REGIONS[r].name}. Gra nie miałaby się z czym połączyć.`);
      return;
    }
  }
  S.busy = true;
  render();
  const res = await bridge.apply(allDomains(), [...S.desired]);
  S.busy = false;
  if (!res.ok) {
    S.error = res.error;
    render();
    return;
  }
  S.error = null;
  S.saved = new Set(res.blocked.map(norm));
  S.hasBackup = true;
  render();
  toast('Zapisano. Uruchom grę ponownie, żeby połączyła się z otwartym klastrem.');
}

// ---------- Widok ----------
function pingCell(c) {
  const p = S.pings[c.domain];
  if (!p) return '<span class="c-ping">—</span>';
  if (p.loading) return '<span class="c-ping">…</span>';
  if (!p.ok) return `<span class="c-ping"><span class="p-bad">✕</span><small>${esc(p.error || 'brak')}</small></span>`;
  const cls = p.ms < 50 ? 'p-good' : p.ms < 90 ? 'p-mid' : 'p-bad';
  return `<span class="c-ping"><span class="${cls}">${p.ms} ms</span><small>${esc(p.ip || '')}</small></span>`;
}

function render() {
  // Regiony
  $('#regions').innerHTML = Object.entries(DEFAULT_REGIONS).map(([k, r]) => {
    const n = clusters(k).filter((c) => S.desired.has(c.domain)).length;
    return `<button data-region="${k}" class="${S.region === k ? 'active' : ''}" aria-pressed="${S.region === k}">${r.name}${n ? ` (${n})` : ''}</button>`;
  }).join('');

  const list = clusters();
  const blockedHere = list.filter((c) => S.saved.has(c.domain)).length;
  $('#status').textContent = S.error ? 'Nie udało się odczytać pliku hosts'
    : blockedHere ? `Zablokowane klastry ${DEFAULT_REGIONS[S.region].name}: ${blockedHere} z ${list.length}`
    : `Wszystkie klastry ${DEFAULT_REGIONS[S.region].name} są otwarte`;

  // Ostrzeżenia
  const openLeft = list.filter((c) => !S.desired.has(c.domain)).length;
  const banner = $('#banner');
  if (S.error) {
    banner.hidden = false; banner.className = 'banner'; banner.textContent = S.error;
  } else if (openLeft === 1 && list.length > 1) {
    banner.hidden = false; banner.className = 'banner warn';
    banner.textContent = 'Zostanie otwarty tylko jeden klaster. Gdy będzie miał restart (zwykle po północy), nie zalogujesz się, dopóki się nie skończy.';
  } else {
    banner.hidden = true;
  }

  // Lista
  $('#clusters').innerHTML = list.map((c) => {
    const on = S.desired.has(c.domain);
    const changed = on !== S.saved.has(c.domain);
    return `
      <li class="cluster ${on ? 'is-blocked' : ''} ${changed ? 'changed' : ''}">
        <div class="c-name">
          <span class="c-code">${code(c.domain)}</span>
          <span class="c-domain">${esc(c.domain)}</span>
          ${c.custom ? `<button class="c-del" data-remove="${esc(c.domain)}">usuń</button>` : ''}
          ${c.where ? `<span class="c-where">${esc(c.where)}</span>` : ''}
        </div>
        ${pingCell(c)}
        <label class="toggle">
          <input type="checkbox" data-domain="${esc(c.domain)}" ${on ? 'checked' : ''} ${S.error ? 'disabled' : ''}>
          <span class="track" aria-hidden="true"></span>
          <span class="t-label">${on ? 'Zablokowany' : 'Otwarty'}</span>
        </label>
      </li>`;
  }).join('');

  // Pasek
  const pend = pendingCount();
  $('#pending').textContent = pend ? `Niezapisane zmiany: ${pend}` : '';
  const btn = $('#btnApply');
  btn.disabled = !pend || S.busy || !!S.error;
  btn.textContent = S.busy ? 'Zapisywanie…' : 'Zastosuj';
  $('#btnPing').disabled = S.pinging;
  $('#btnPing').textContent = S.pinging ? 'Mierzenie…' : 'Zmierz ping';
  $('#version').textContent = APP_VERSION;
}

// ---------- Zdarzenia ----------
$('#regions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-region]');
  if (!b) return;
  S.region = b.dataset.region;
  store.set('region', S.region);
  render();
  if (!clusters().some((c) => S.pings[c.domain])) pingAll();
});

$('#clusters').addEventListener('change', (e) => {
  const d = e.target.dataset.domain;
  if (!d) return;
  if (e.target.checked) S.desired.add(d); else S.desired.delete(d);
  render();
});

$('#clusters').addEventListener('click', (e) => {
  const d = e.target.dataset.remove;
  if (!d) return;
  S.extra[S.region] = (S.extra[S.region] || []).filter((x) => x !== d);
  store.set('extra', S.extra);
  if (S.saved.has(d)) toast('Klaster usunięty z listy. Kliknij „Zastosuj”, żeby zdjąć jego blokadę.');
  S.desired.delete(d);
  render();
});

$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = norm($('#addInput').value);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { toast('Wpisz adres w postaci login5.wotblitz.eu'); return; }
  if (allDomains().includes(d)) { toast('Ten klaster jest już na liście.'); return; }
  S.extra[S.region] = [...(S.extra[S.region] || []), d];
  store.set('extra', S.extra);
  $('#addInput').value = '';
  render();
  bridge.ping(d).then((p) => { S.pings[d] = p; render(); });
});

$('#btnApply').addEventListener('click', apply);
$('#btnPing').addEventListener('click', pingAll);

$('#btnCopy').addEventListener('click', async () => {
  const list = clusters().filter((c) => S.desired.has(c.domain)).map((c) => c.domain);
  if (!list.length) { toast('Najpierw zaznacz klastry do zablokowania.'); return; }
  try {
    await navigator.clipboard.writeText(list.join('\n'));
    toast(`Skopiowano ${list.length} ${list.length === 1 ? 'domenę' : 'domeny'}. Wklej je do listy blokowanych w filtrze DNS na telefonie.`);
  } catch {
    toast(list.join('\n'));
  }
});

const menu = $('#menu');
$('#btnMore').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
  $('#btnMore').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', () => { menu.hidden = true; $('#btnMore').setAttribute('aria-expanded', 'false'); });

menu.addEventListener('click', async (e) => {
  const act = e.target.dataset.act;
  if (act === 'unblock-all') {
    S.desired.clear();
    render();
    toast('Wszystkie klastry odznaczone. Kliknij „Zastosuj”, żeby zapisać.');
  }
  if (act === 'restore') {
    if (!S.hasBackup) { toast('Kopia pliku hosts powstaje przy pierwszym zapisie. Jeszcze jej nie ma.'); return; }
    const ok = await bridge.confirm('Przywróć kopię', 'Przywrócić plik hosts do stanu sprzed pierwszej zmiany w tej aplikacji?', 'Przywróć');
    if (!ok) return;
    const res = await bridge.restore();
    if (!res.ok) { toast(res.error); return; }
    toast('Plik hosts przywrócony.');
    loadState();
  }
  if (act === 'open-hosts') bridge.openHosts();
});

// ---------- Start ----------
render();
loadState().then(pingAll);
