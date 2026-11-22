// Operacje na pliku hosts – czyste funkcje, bez dostępu do dysku (łatwe do testowania)
'use strict';

const START = '# >>> Blitz Klastry - zarzadzane przez aplikacje, nie edytuj';
const END = '# <<< Blitz Klastry';

const norm = (d) => String(d || '').trim().toLowerCase();

// Dzieli linię na adres IP i nazwy hostów (bez komentarza na końcu)
function parseLine(line) {
  const body = line.replace(/#.*/, '').trim();
  if (!body) return null;
  const parts = body.split(/\s+/);
  if (parts.length < 2) return null;
  return { ip: parts[0], hosts: parts.slice(1) };
}

// Zwraca zbiór domen (spośród podanych), które są zablokowane w pliku
function blockedDomains(text, domains) {
  const wanted = new Set(domains.map(norm));
  const found = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const p = parseLine(line);
    if (!p) continue;
    for (const h of p.hosts) if (wanted.has(norm(h))) found.add(norm(h));
  }
  return found;
}

// Buduje nową treść pliku: usuwa wszystkie wpisy dla zarządzanych domen
// (także dopisane ręcznie) i dodaje własny blok z domenami do zablokowania.
function buildHosts(text, managedDomains, toBlock) {
  const src = String(text);
  const eol = src.includes('\r\n') || !src.includes('\n') ? '\r\n' : '\n';
  const managed = new Set(managedDomains.map(norm));
  const out = [];
  let inBlock = false;

  for (const line of src.split(/\r?\n/)) {
    const t = line.trim();
    if (t === START) { inBlock = true; continue; }
    if (t === END) { inBlock = false; continue; }
    if (inBlock) continue;

    const p = parseLine(line);
    if (!p || !p.hosts.some((h) => managed.has(norm(h)))) { out.push(line); continue; }
    // Linia z zarządzaną domeną: zostaw pozostałe hosty, jeśli jakieś są
    const rest = p.hosts.filter((h) => !managed.has(norm(h)));
    if (rest.length) out.push(`${p.ip} ${rest.join(' ')}`);
  }

  while (out.length && out[out.length - 1].trim() === '') out.pop();
  const block = [...new Set(toBlock.map(norm))].filter(Boolean);
  if (block.length) {
    out.push('', START, ...block.map((d) => `0.0.0.0 ${d}`), END);
  }
  return out.join(eol) + eol;
}

// Średni czas z wyniku polecenia ping (polski i angielski Windows, Linux)
function parsePing(output) {
  const s = String(output);
  const avg = s.match(/(?:średni|średnia|average|avg)[^0-9<]*<?(\d+(?:[.,]\d+)?)\s*ms/i);
  if (avg) return Math.round(parseFloat(avg[1].replace(',', '.')));
  const linux = s.match(/=\s*[\d.]+\/([\d.]+)\//);
  if (linux) return Math.round(parseFloat(linux[1]));
  const times = [...s.matchAll(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/gi)].map((m) => parseFloat(m[1].replace(',', '.')));
  if (!times.length) return null;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

module.exports = { START, END, blockedDomains, buildHosts, parsePing };
