/* Lapisan API: timeout, retry, reqId idempoten, dedupe baca, SWR, pengukur (gas-instant-ux-pro) */
(function () {
  const PFX = 'pkd:v1:', S = window.AppState = { token: '', user: null };
  const Store = {
    get(k, d) { try { const v = localStorage.getItem(PFX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { /* kuota penuh: lanjut tanpa cache */ } },
    del(k) { try { localStorage.removeItem(PFX + k); } catch (e) { /* abaikan */ } }
  };
  S.token = Store.get('token', ''); S.user = Store.get('user', null);
  const uk = k => 'u:' + ((S.user && S.user.user_id) || 'anon') + ':' + k;
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; };
  const Perf = { rows: [], add(a, t, s) { this.rows.push({ action: a, total: t, server: s == null ? null : s, net: s == null ? null : t - s }); if (this.rows.length > 100) this.rows.shift(); }, table() { console.table(this.rows.slice(-30)); } };
  const READ = /^(boot|catalog|course|lesson|order\.get|admin\.queue|batch)$/;
  const URL_ = () => (window.APP_CONFIG || {}).GAS_URL || '';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitOnline = ms => new Promise(r => { if (navigator.onLine !== false) return r(); const t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); });

  async function once(action, data, timeout, reqId) {
    if (/GANTI|XXXX/.test(URL_())) return { success: false, message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js.' };
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
    try {
      const res = await fetch(URL_(), { method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },           // hindari CORS preflight
        body: JSON.stringify({ action, token: S.token || '', reqId, data: data || {} }) });
      const text = await res.text();
      try { const j = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), j.ms); return j; }
      catch (e) { return { success: false, retryable: true, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON).' }; }
    } catch (err) {
      return { success: false, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus.' };
    } finally { clearTimeout(timer); }
  }

  let epoch = 0; const inflight = {};
  async function run(action, data, opt) {
    const isRead = READ.test(action), reqId = isRead ? '' : (opt.reqId || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()));
    let res;
    for (let i = 0; i < (isRead ? 3 : 2); i++) {
      if (i) { await wait(1200 * i); if (navigator.onLine === false) await waitOnline(15000); }
      res = await once(action, data, isRead ? (i ? 40000 : 25000) : 90000, reqId);
      if (res.success || !res.retryable) break;
    }
    if (!res.success && res.data && res.data.code === 'AUTH') { S.token = ''; S.user = null; Store.del('token'); Store.del('user'); window.dispatchEvent(new Event('session-expired')); }
    return res;
  }
  function api(action, data, opt) {
    opt = opt || {};
    if (!READ.test(action)) { epoch++; return run(action, data, opt); }
    const k = epoch + '|' + action + '|' + S.token + '|' + JSON.stringify(data || {});
    if (inflight[k]) return inflight[k];                                  // permintaan identik menumpang
    const p = run(action, data, opt); inflight[k] = p; p.then(() => delete inflight[k], () => delete inflight[k]);
    return p;
  }
  /** Tampilkan cache dulu, segarkan di latar; render ulang hanya bila data berubah. */
  async function swr(key, action, payload, render, opt) {
    opt = opt || {}; const fresh = opt.fresh == null ? 60000 : opt.fresh, ck = uk(key), c = Store.get(ck, null);
    if (c) render(c.data, true);
    if (c && !opt.force && Date.now() - c.t < fresh) return;
    const res = await api(action, payload);
    if (res.success) { const h = hashStr(JSON.stringify(res.data)); Store.set(ck, { t: Date.now(), h, data: res.data }); if (!c || c.h !== h) render(res.data, false); }
    else if (opt.onError && !c) opt.onError(res);
  }
  const put = (key, data) => Store.set(uk(key), { t: Date.now(), h: hashStr(JSON.stringify(data)), data });
  const warm = () => { if (!/GANTI|XXXX/.test(URL_())) fetch(URL_() + '?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); };
  window.Api = { api, swr, Store, Perf, uk, put, warm };
})();
