import { FAVICON_DATA_URI } from "./icon.ts";

export const PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PC Health Broadcaster</title>
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}">
<style>
:root{--bg:#0f1216;--panel:#171b21;--line:#262c35;--text:#e6e9ee;--muted:#8a93a3;--live:#3ddc84;--stale:#f5b942;--gone:#f25f5c;--accent:#5aa9ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
header h1{font-size:16px;margin:0 auto 0 0;font-weight:600}
header .self{color:var(--muted)}
button,input{font:inherit;color:var(--text);background:#20262f;border:1px solid var(--line);border-radius:6px;padding:6px 10px}
button{cursor:pointer}button:hover{border-color:var(--accent)}
input{width:9em}
main{padding:12px 16px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:1100px}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.num{font-variant-numeric:tabular-nums;text-align:right}
tr.stale td{color:var(--stale)}tr.gone td{color:var(--muted)}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.live .dot{background:var(--live)}.stale .dot{background:var(--stale)}.gone .dot{background:var(--gone)}
.obs{color:var(--accent);font-weight:600}
.dup{color:var(--gone);font-weight:600}
.role{width:5em}.tatami{width:3.5em}
.banner{margin:12px 16px 0;padding:10px 12px;border-radius:6px;background:#3a1c1c;border:1px solid var(--gone)}
.hidden{display:none}
.bar{display:inline-block;width:60px;height:8px;background:#262c35;border-radius:4px;vertical-align:middle;margin-right:6px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--live)}
.bar.warn i{background:var(--stale)}.bar.hot i{background:var(--gone)}
.empty{color:var(--muted);padding:32px;text-align:center}
dialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:20px;max-width:420px}
dialog::backdrop{background:rgba(0,0,0,.6)}
footer{padding:12px 16px;color:var(--muted);font-size:12px}
.muted{color:var(--muted);font-size:12px}
pre.copied{position:fixed;bottom:16px;right:16px;background:var(--panel);border:1px solid var(--accent);padding:8px 12px;border-radius:6px;margin:0}
</style>
</head>
<body>
<header>
  <h1>PC Health Broadcaster <span class="self" id="version"></span> <span class="self" id="self"></span></h1>
  <label>Gara <input id="session" placeholder="es. Lavis 2026"></label>
  <button id="csv">Scarica CSV sessione</button>
  <button id="copyAll">Copia tutte le specs</button>
</header>
<div id="dupBanner" class="banner hidden"></div>
<main>
  <table>
    <thead><tr>
      <th>N.</th><th>Host</th><th>Ruolo</th><th>Tatami</th><th>CPU</th><th>RAM</th><th>Batteria</th><th>Wi-Fi</th>
      <th>Rete ↓ / ↑</th><th>Disco R / W</th><th>Top processo</th><th>Ultimo beat</th><th>Stato</th><th></th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="empty" class="empty">In ascolto sulla porta UDP <span id="udpPort"></span>… nessuna macchina ancora vista.</div>
</main>
<footer id="footer"></footer>
<dialog id="numberDialog">
  <form method="dialog" id="numberForm">
    <h2 style="margin-top:0">Numero di questo PC</h2>
    <p>Scrivi il numero dell'etichetta fisica applicata al PC (es. 7). Viene salvato in <code>pc-number.txt</code> accanto all'eseguibile.</p>
    <input id="numberInput" pattern="[A-Za-z0-9_-]{1,16}" required autofocus>
    <button type="submit">Salva</button>
    <p id="numberError" class="dup"></p>
  </form>
</dialog>
<script>
(function () {
  var ROLE_KEY = 'phb.roles';
  var SESSION_KEY = 'phb.session';
  var roles = load(ROLE_KEY, {});
  var state = null;

  function pushRoles() {
    fetch('/api/roles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(roles) }).catch(function () {});
  }
  pushRoles();

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v) { return v === null || v === undefined ? '—' : Math.round(v) + '%'; }
  function bar(v) {
    if (v === null || v === undefined) return '—';
    var cls = v >= 90 ? ' hot' : v >= 70 ? ' warn' : '';
    return '<span class="bar' + cls + '"><i style="width:' + Math.min(100, v) + '%"></i></span>' + Math.round(v) + '%';
  }
  function bps(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB/s';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + ' kB/s';
    return v + ' B/s';
  }
  function gb(bytes) { return bytes === null || bytes === undefined ? '?' : Math.round(bytes / 1073741824) + ' GB'; }
  function batteryTrend(m, t) {
    var rate = m.batteryRatePctPerHour;
    if (rate === null || rate === undefined || rate === 0) return '';
    var text = ' <span class="muted">' + (rate > 0 ? '+' : '') + rate + '%/h';
    if (rate < 0) {
      var hours = t.batteryPct / -rate;
      text += ' · ' + (hours >= 1 ? Math.floor(hours) + 'h' + ('0' + Math.round((hours % 1) * 60)).slice(-2) : Math.round(hours * 60) + ' min');
    }
    return text + '</span>';
  }
  function role(m) { return roles[m.number] || { role: '', tatami: '' }; }
  function label(m) {
    var r = role(m);
    return r.role || r.tatami ? (r.role || '') + (r.tatami ? ' T' + r.tatami : '') : '';
  }
  function topProc(t) {
    if (!t || !t.topProcs || !t.topProcs.length) return '—';
    var p = t.topProcs[0];
    var cls = /obs/i.test(p.name) ? ' class="obs"' : '';
    return '<span' + cls + '>' + esc(p.name) + '</span> ' + Math.round(p.cpuPct) + '%';
  }
  function statusText(m) {
    if (m.status === 'live') return 'live';
    if (m.status === 'stale') return 'stale (' + m.sinceLastBeat + ' s)';
    return 'gone (' + m.sinceLastBeat + ' s)';
  }

  function specsText(m) {
    var s = m.specs || {};
    var l = label(m);
    return [
      'PC ' + m.number + (l ? ' (' + l + ')' : '') + ' — ' + m.hostname,
      'Modello: ' + (s.model || '?'),
      'CPU: ' + (s.cpu || '?') + (s.cores ? ' (' + s.cores + ' thread)' : ''),
      'RAM: ' + gb(s.ramBytes),
      'Storage: ' + (s.storageType || '?') + ' ' + gb(s.storageBytes),
      'OS: ' + (s.os || '?') + (s.osVersion ? ' ' + s.osVersion : '') + (s.kernel ? ' (kernel ' + s.kernel + ')' : ''),
      'Stato care system: ',
      'Porte HDMI/VGA/DP: ',
      'Note: '
    ].join('\\n');
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(function () {
      var box = document.createElement('pre');
      box.className = 'copied';
      box.textContent = 'Copiato';
      document.body.appendChild(box);
      setTimeout(function () { box.remove(); }, 1200);
    });
  }

  function render() {
    if (!state) return;
    el('self').textContent = state.self.number ? '· PC ' + state.self.number + ' (' + state.self.hostname + ')' : '· numero non impostato';
    el('udpPort').textContent = state.udpPort;
    el('version').textContent = 'v' + state.version;
    document.title = 'PC Health Broadcaster v' + state.version;
    el('footer').textContent = 'v' + state.version + ' · UDP ' + state.udpPort + ' · pagina 127.0.0.1:' + state.uiPort +
      ' · destinatari: ' + state.targets.join(', ') + ' · beat in memoria: ' + state.historyCount + (state.recordPath ? ' · registrazione: ' + state.recordPath : '');
    var machines = state.machines;
    el('empty').classList.toggle('hidden', machines.length > 0);
    var dups = {};
    machines.forEach(function (m) { if (m.duplicate) dups[m.number] = true; });
    var dupList = Object.keys(dups);
    el('dupBanner').classList.toggle('hidden', dupList.length === 0);
    el('dupBanner').textContent = 'Numero duplicato: ' + dupList.join(', ') + ' — più macchine dichiarano lo stesso numero. Controlla pc-number.txt.';
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.focus : null;
    el('rows').innerHTML = machines.map(function (m) {
      var t = m.telemetry || {};
      var r = role(m);
      var batt = t.batteryPct === null || t.batteryPct === undefined ? '—' : pct(t.batteryPct) + (t.power === 'ac' ? ' ⚡' : t.power === 'battery' ? ' 🔋' : '') + batteryTrend(m, t);
      var wifi = t.wifiPct === null || t.wifiPct === undefined ? '—' : pct(t.wifiPct) + (t.wifiDbm !== null && t.wifiDbm !== undefined ? ' (' + t.wifiDbm + ' dBm)' : '');
      return '<tr class="' + m.status + '">' +
        '<td' + (m.duplicate ? ' class="dup" title="numero duplicato"' : '') + '>' + esc(m.number) + (m.duplicate ? ' ⚠' : '') + '</td>' +
        '<td title="' + esc(m.from) + '">' + esc(m.hostname) + '</td>' +
        '<td><input class="role" data-focus="r' + esc(m.key) + '" data-number="' + esc(m.number) + '" data-field="role" value="' + esc(r.role) + '" placeholder="es. OBS"></td>' +
        '<td><input class="tatami" data-focus="t' + esc(m.key) + '" data-number="' + esc(m.number) + '" data-field="tatami" value="' + esc(r.tatami) + '" placeholder="n."></td>' +
        '<td>' + bar(t.cpuPct) + (t.tempC ? ' <span title="temperatura">' + Math.round(t.tempC) + '°</span>' : '') + '</td>' +
        '<td>' + bar(t.ramPct) + '</td>' +
        '<td>' + batt + '</td>' +
        '<td>' + wifi + '</td>' +
        '<td class="num">' + bps(t.netRxBps) + ' / ' + bps(t.netTxBps) + '</td>' +
        '<td class="num">' + bps(t.diskReadBps) + ' / ' + bps(t.diskWriteBps) + '</td>' +
        '<td>' + topProc(t) + '</td>' +
        '<td class="num">' + m.sinceLastBeat + ' s</td>' +
        '<td><span class="dot"></span>' + statusText(m) + '</td>' +
        '<td><button data-copy="' + esc(m.key) + '">Copia specs</button></td>' +
        '</tr>';
    }).join('');
    if (focusKey) {
      var again = document.querySelector('[data-focus="' + focusKey.replace(/"/g, '\\\\"') + '"]');
      if (again) { again.focus(); }
    }
  }

  el('rows').addEventListener('change', function (e) {
    var input = e.target;
    if (!input.dataset || !input.dataset.number) return;
    var entry = roles[input.dataset.number] || { role: '', tatami: '' };
    entry[input.dataset.field] = input.value.trim();
    roles[input.dataset.number] = entry;
    save(ROLE_KEY, roles);
    pushRoles();
    render();
  });
  el('rows').addEventListener('click', function (e) {
    var key = e.target.dataset && e.target.dataset.copy;
    if (!key || !state) return;
    var m = state.machines.find(function (x) { return x.key === key; });
    if (m) copy(specsText(m));
  });
  el('copyAll').addEventListener('click', function () {
    if (!state) return;
    copy(state.machines.map(specsText).join('\\n\\n'));
  });

  el('session').value = load(SESSION_KEY, '');
  el('session').addEventListener('change', function () { save(SESSION_KEY, el('session').value); });

  el('csv').addEventListener('click', function () {
    fetch('/api/history').then(function (r) { return r.json(); }).then(function (entries) {
      var head = ['time', 'number', 'hostname', 'role', 'tatami', 'cpuPct', 'ramPct', 'batteryPct', 'power', 'wifiPct', 'wifiDbm', 'netRxBps', 'netTxBps', 'diskReadBps', 'diskWriteBps', 'tempC', 'topProcess', 'topProcessCpuPct'];
      var lines = [head.join(',')];
      entries.forEach(function (e) {
        var t = e.telemetry;
        var r = roles[e.number] || { role: '', tatami: '' };
        var top = t.topProcs && t.topProcs[0] ? t.topProcs[0] : { name: '', cpuPct: '' };
        lines.push([new Date(e.t).toISOString(), e.number, e.hostname, r.role, r.tatami, t.cpuPct, t.ramPct, t.batteryPct, t.power, t.wifiPct, t.wifiDbm, t.netRxBps, t.netTxBps, t.diskReadBps, t.diskWriteBps, t.tempC, top.name, top.cpuPct]
          .map(function (v) { return v === null || v === undefined ? '' : /[",\\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); }).join(','));
      });
      var name = (el('session').value.trim() || 'sessione').replace(/[^\\w-]+/g, '_');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([lines.join('\\n')], { type: 'text/csv' }));
      a.download = 'pc-health_' + name + '_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  el('numberForm').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/api/number', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number: el('numberInput').value.trim() }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) { el('numberDialog').close(); poll(); } else { el('numberError').textContent = res.error || 'Errore'; }
      });
  });

  function poll() {
    fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {
      state = s;
      var dialog = el('numberDialog');
      if (s.needsNumber && !dialog.open) dialog.showModal();
      render();
    }).catch(function () {});
  }
  poll();
  setInterval(poll, 3000);
})();
</script>
</body>
</html>
`;
