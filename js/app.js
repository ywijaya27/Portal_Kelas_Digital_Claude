/* Portal Kelas Digital — SPA vanilla. Semua teks lewat textContent (aman XSS). */
(function () {
  'use strict';
  const { api, swr, Store, uk, put, warm } = window.Api, S = window.AppState;
  const $ = s => document.querySelector(s);
  const fmt = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const tgl = v => v ? new Date(v).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB' : '';
  function h(tag, p, ...kids) {
    const e = document.createElement(tag);
    Object.keys(p || {}).forEach(k => { const v = p[k]; if (v == null || v === false) return; if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); });
    kids.flat(9).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const view = n => $('#view').replaceChildren(n);
  const skel = () => view(h('div', { class: 'skel' }));
  let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(tt); tt = setTimeout(() => { t.style.display = 'none'; }, 3200); }
  const errBox = (m, retry) => h('div', { class: 'err' }, m + ' ', retry && h('button', { class: 'btn ghost sm', onclick: retry }, 'Coba lagi'));
  const needLogin = () => view(h('div', { class: 'panel' }, h('h2', {}, 'Masuk diperlukan'), h('p', {}, 'Masuk dengan Google di menu samping untuk melanjutkan.')));
  const stale = k => { const b = Store.get(uk(k), null); if (b) { b.t = 0; Store.set(uk(k), b); } };
  const ST = { Pending: ['Menunggu pembayaran', 'wait'], Paid: ['Lunas', 'ok'], Expired: ['Kedaluwarsa', 'bad'], Cancelled: ['Dibatalkan', 'bad'], Refunded: ['Dikembalikan', 'wait'] };
  const PS = { AwaitingPayment: ['Belum ada bukti', 'wait'], AwaitingReview: ['Menunggu verifikasi admin', 'wait'], Verified: ['Terverifikasi', 'ok'], Rejected: ['Ditolak', 'bad'] };
  const badge = (t, k) => h('span', { class: 'badge ' + k }, (k === 'ok' ? '✓ ' : k === 'bad' ? '✕ ' : '… ') + t);   // status tidak hanya warna

  /** Render dari cache dulu (instan), segarkan di latar; abaikan hasil bila user sudah pindah halaman. */
  function load(key, action, payload, render, opt) {
    const stamp = location.hash;
    if (!Store.get(uk(key), null)) skel();
    return swr(key, action, payload, (d, c) => { if (location.hash === stamp) render(d, c); }, Object.assign({ onError: r => { if (location.hash === stamp) view(errBox(r.message, route)); } }, opt));
  }

  // ---------- Tema ----------
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() { const t = Store.get('theme', 'system'); document.documentElement.dataset.theme = t === 'dark' || (t === 'system' && mq.matches) ? 'dark' : 'light'; $('#theme').value = t; }

  // ---------- Sesi (Google Identity Services; server memverifikasi token) ----------
  function renderUser() {
    const on = !!S.token;
    $('#who').textContent = on && S.user ? S.user.name : ''; $('#gbtn').hidden = on; $('#out').hidden = !on; $('#navAdmin').hidden = !(S.user && S.user.role === 'admin');
  }
  let gInit = false;
  async function initGoogle(n) {
    if (gInit || S.token) return;
    if (!window.google || !google.accounts) { if ((n || 0) < 40) setTimeout(() => initGoogle((n || 0) + 1), 250); return; }
    const c = await api('auth.config', {});
    if (!c.success || !c.data.googleClientId) { $('#gbtn').textContent = c.success ? 'Login belum dikonfigurasi.' : c.message; return; }
    gInit = true;
    google.accounts.id.initialize({ client_id: c.data.googleClientId, callback: async r => {
      const x = await api('auth.login', { idToken: r.credential });
      if (!x.success) return toast(x.message);
      S.token = x.data.token; S.user = x.data.user; Store.set('token', S.token); Store.set('user', S.user); put('boot', x.data.boot);
      renderUser(); route();
    } });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'medium', shape: 'pill' });
  }
  $('#out').onclick = async () => {
    await api('auth.logout', {});
    S.token = ''; S.user = null; Store.del('token'); Store.del('user'); renderUser(); initGoogle(); location.hash = '#/katalog'; route();
  };

  // ---------- Progres: optimistis + antrean lokal + reqId tetap (aman di-retry) ----------
  const Q = { get: () => Store.get(uk('pq'), []), set: v => Store.set(uk('pq'), v) };
  let flushing = false, statusEl = null;
  function pend(lid, done) { Q.set(Q.get().filter(x => x.lessonId !== lid).concat([{ lessonId: lid, done, rid: crypto.randomUUID(), ts: Date.now() }])); flush(); }
  async function flush() {
    if (flushing || !S.token || !Q.get().length) return; flushing = true;
    try {
      for (const j of Q.get()) {
        const r = await api('progress.set', { lessonId: j.lessonId, done: j.done }, { reqId: j.rid });
        if (r.success || (r.data && r.data.code === 'FORBIDDEN')) Q.set(Q.get().filter(x => x.ts !== j.ts)); else break;
      }
    } finally { flushing = false; }
    stale('boot'); if (statusEl) statusEl.textContent = Q.get().length ? 'Belum tersimpan — dicoba ulang otomatis' : 'Progres tersimpan';
  }

  // ---------- Halaman ----------
  function katalog() {
    load('catalog', 'catalog', {}, list => view(h('div', {}, h('h1', {}, 'Katalog Kelas'), h('p', { class: 'muted' }, 'Pilih kelas, beli, lalu belajar kapan saja.'),
      list.length ? h('div', { class: 'grid' }, list.map((c, i) => h('a', { class: 'card c' + (i % 3), href: '#/kelas/' + encodeURIComponent(c.course_id) },
        h('span', { class: 'pill' }, fmt(c.price_idr)), h('h3', { style: 'margin-top:10px' }, c.title), h('p', { class: 'muted' }, c.description)))) : h('p', {}, 'Belum ada kelas yang dipublikasikan.'))));
  }
  function kelas(id) {
    load('course:' + id, 'course', { courseId: id }, d => {
      const c = d.course, done = new Set(d.done), first = (d.modules[0] || { lessons: [] }).lessons[0], rid = crypto.randomUUID();
      const buy = h('button', { class: 'btn' }, 'Beli Sekarang');
      buy.onclick = async () => {
        if (!S.token) return toast('Masuk dengan Google terlebih dahulu.');
        buy.disabled = true; buy.textContent = 'Memproses…';
        const r = await api('order.create', { courseId: c.course_id }, { reqId: rid });
        if (!r.success) { buy.disabled = false; buy.textContent = 'Beli Sekarang'; return toast(r.message); }
        stale('boot'); put('order:' + r.data.orderId, r.data); location.hash = '#/checkout/' + r.data.orderId;
      };
      view(h('div', {}, h('h1', {}, c.title), h('p', {}, c.description),
        h('div', { class: 'panel' }, h('span', { class: 'pill' }, fmt(c.price_idr)), ' ',
          d.enrolled ? (first && h('a', { class: 'btn', href: '#/belajar/' + c.course_id + '/' + first.lesson_id }, 'Mulai Belajar')) : buy,
          h('p', { class: 'muted', style: 'margin:10px 0 0' }, 'Akses aktif setelah pembayaran diverifikasi admin.')),
        h('div', { class: 'panel' }, h('h2', {}, 'Kurikulum'), d.modules.map(m => h('div', {}, h('h3', { style: 'margin-top:12px' }, m.title), m.lessons.map(l => {
          const open = d.enrolled || l.is_preview;
          return h(open ? 'a' : 'div', { class: 'lesson' + (open ? '' : ' lock'), href: open ? '#/belajar/' + c.course_id + '/' + l.lesson_id : null },
            h('span', {}, (done.has(l.lesson_id) ? '✓ ' : '') + l.title), h('span', { class: 'muted' }, l.is_preview ? 'Preview' : d.enrolled ? 'Tersedia' : 'Terkunci'));
        }))))));
    }, { fresh: 0 });
  }
  function checkout(oid) {
    if (!S.token) return needLogin();
    load('order:' + oid, 'order.get', { orderId: oid }, draw, { fresh: 5000 });
    function draw(o) {
      const st = ST[o.status] || [o.status, 'wait'], ps = PS[o.paymentStatus] || [o.paymentStatus || '', 'wait'], can = o.status === 'Pending' && o.paymentStatus !== 'AwaitingReview';
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf', 'aria-label': 'Berkas bukti pembayaran' });
      const send = h('button', { class: 'btn' }, o.paymentStatus === 'Rejected' ? 'Unggah Ulang Bukti' : 'Kirim Bukti Pembayaran');
      send.onclick = async () => {
        const f = file.files[0]; if (!f) return toast('Pilih berkas bukti terlebih dahulu.');
        if (['image/jpeg', 'image/png', 'application/pdf'].indexOf(f.type) < 0) return toast('Format harus JPG, PNG, atau PDF.');
        if (f.size > 5 * 1048576) return toast('Ukuran berkas maksimal 5 MB.');
        const label = send.textContent; send.disabled = true; send.textContent = 'Mengunggah…';
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
        const r = await api('proof.upload', { orderId: o.orderId, mime: f.type, data });
        if (!r.success) { send.disabled = false; send.textContent = label; return toast(r.message); }
        const nx = Object.assign({}, o, r.data); stale('boot'); put('order:' + oid, nx); toast('Bukti terkirim. Menunggu verifikasi admin.'); draw(nx);
      };
      view(h('div', {}, h('h1', {}, 'Pembayaran Pesanan'), h('p', { class: 'muted' }, o.orderId + ' • ' + o.title),
        h('div', { class: 'panel' }, h('div', { class: 'row' }, badge(st[0], st[1]), o.status === 'Pending' && badge(ps[0], ps[1])), h('h2', { style: 'margin-top:12px' }, 'Total ' + fmt(o.total)),
          h('p', { class: 'muted' }, 'Berlaku sampai ' + tgl(o.expiresAt)), o.reason && h('div', { class: 'err' }, 'Pembayaran ditolak: ' + o.reason)),
        can && h('div', { class: 'panel' }, h('h3', {}, 'Instruksi Transfer'), h('p', { style: 'white-space:pre-line' }, o.bank || 'Instruksi pembayaran belum diatur admin.'),
          h('p', { class: 'muted' }, 'Transfer persis sesuai total, lalu unggah bukti (JPG, PNG, atau PDF, maks. 5 MB).'), file, h('div', { style: 'margin-top:12px' }, send)),
        o.paymentStatus === 'AwaitingReview' && h('div', { class: 'panel' }, h('p', {}, 'Bukti Anda diterima dan sedang diperiksa admin. Akses kelas aktif setelah verifikasi.')),
        o.status === 'Paid' && h('div', { class: 'panel' }, h('p', {}, 'Pembayaran terverifikasi.'), h('a', { class: 'btn', href: '#/kelas-saya' }, 'Buka Kelas Saya'))));
    }
  }
  function mine() {
    if (!S.token) return needLogin();
    load('boot', 'boot', {}, d => view(h('div', {}, h('h1', {}, 'Kelas Saya'), h('p', { class: 'muted' }, 'Lanjutkan belajar dari pelajaran terakhir Anda.'),
      d.mine.length ? h('div', { class: 'grid' }, d.mine.map((c, i) => {
        const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
        return h('a', { class: 'card c' + (i % 3), href: c.resume ? '#/belajar/' + c.course_id + '/' + c.resume : '#/kelas/' + c.course_id },
          h('h3', {}, c.title), h('p', { class: 'muted' }, c.done + ' dari ' + c.total + ' pelajaran wajib selesai • ' + pct + '%'),
          h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: 'width:' + pct + '%' })),
          h('p', { style: 'margin:12px 0 0;font-weight:600' }, c.done ? 'Lanjutkan Belajar →' : 'Mulai Belajar →'));
      })) : h('div', { class: 'panel' }, h('p', {}, 'Belum ada kelas aktif.'), h('a', { class: 'btn', href: '#/katalog' }, 'Jelajahi Katalog')))), { fresh: 30000 });
  }
  function transaksi() {
    if (!S.token) return needLogin();
    load('boot', 'boot', {}, d => view(h('div', {}, h('h1', {}, 'Transaksi'), d.orders.length ? d.orders.map(o => {
      const st = ST[o.status] || [o.status, 'wait'], ps = PS[o.paymentStatus] || [o.paymentStatus || '', 'wait'];
      return h('a', { class: 'card', style: 'margin-bottom:12px', href: '#/checkout/' + o.orderId }, h('div', { class: 'row' }, h('b', {}, o.title), badge(st[0], st[1]), o.status === 'Pending' && badge(ps[0], ps[1])),
        h('p', { class: 'muted', style: 'margin:6px 0 0' }, o.orderId + ' • ' + fmt(o.total) + ' • ' + tgl(o.createdAt)));
    }) : h('p', {}, 'Belum ada transaksi.'))), { fresh: 30000 });
  }
  function learn(cid, lid) {
    if (!lid) return kelas(cid);
    load('lesson:' + lid, 'lesson', { lessonId: lid }, draw, { fresh: 0 });
    function draw(d) {
      const flat = [].concat(...d.modules.map(m => m.lessons)), idx = flat.findIndex(l => l.lesson_id === lid), prev = flat[idx - 1], next = flat[idx + 1], pq = Q.get();
      const isDone = id => { const p = pq.find(x => x.lessonId === id); return p ? p.done : d.done.indexOf(id) > -1; };
      const cur = d.lesson, yt = String(cur.video_url || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
      statusEl = h('span', { class: 'muted', 'aria-live': 'polite' }, pq.length ? 'Belum tersimpan — dicoba ulang otomatis' : '');
      const nav = (l, t) => l ? h('a', { class: 'btn ghost', href: '#/belajar/' + d.course.course_id + '/' + l.lesson_id }, t) : null;
      view(h('div', {}, h('p', { class: 'muted' }, d.course.title + ' • Pelajaran ' + (idx + 1) + ' dari ' + flat.length), h('h1', {}, cur.title),
        h('div', { class: 'panel' }, yt ? h('iframe', { class: 'v', src: 'https://www.youtube-nocookie.com/embed/' + yt[1], title: cur.title, allow: 'encrypted-media; picture-in-picture', allowfullscreen: true }) : null, h('p', { style: 'margin-top:12px;white-space:pre-line' }, cur.description || '')),
        h('div', { class: 'panel' }, h('div', { class: 'row' }, nav(prev, '← Sebelumnya'),
          h('button', { class: 'btn', onclick: () => { if (!d.enrolled) return toast('Beli kelas untuk menyimpan progres.'); pend(lid, !isDone(lid)); draw(d); } }, isDone(lid) ? '✓ Selesai (batalkan)' : 'Tandai Selesai'), nav(next, 'Berikutnya →')), h('p', { style: 'margin:10px 0 0' }, statusEl)),
        h('div', { class: 'panel' }, h('h3', {}, 'Daftar Pelajaran'), d.modules.map(m => h('div', {}, h('p', { class: 'muted', style: 'margin:10px 0 0' }, m.title), m.lessons.map(l => {
          const open = d.enrolled || l.is_preview;
          return h(open ? 'a' : 'div', { class: 'lesson' + (l.lesson_id === lid ? ' on' : '') + (open ? '' : ' lock'), href: open ? '#/belajar/' + d.course.course_id + '/' + l.lesson_id : null }, h('span', {}, (isDone(l.lesson_id) ? '✓ ' : '') + l.title));
        }))))));
    }
  }
  function adminPage() {
    if (!S.user || S.user.role !== 'admin') return view(errBox('Halaman ini khusus admin.'));
    load('admin', 'admin.queue', {}, draw, { fresh: 15000 });
    const refresh = () => swr('admin', 'admin.queue', {}, draw, { force: true });
    async function act(btn, action, data, okMsg) {
      const t = btn.textContent; btn.disabled = true; btn.textContent = 'Memproses…';
      const r = await api(action, data);
      if (!r.success) { btn.disabled = false; btn.textContent = t; return toast(r.message); }
      toast(okMsg); refresh();
    }
    async function proof(id) {
      const r = await api('proof.view', { paymentId: id });
      if (!r.success || ['image/jpeg', 'image/png', 'application/pdf'].indexOf(r.data.mime) < 0) return toast(r.message || 'Bukti tidak dapat ditampilkan.');
      const src = 'data:' + r.data.mime + ';base64,' + r.data.data, m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } },
        h('div', {}, r.data.mime === 'application/pdf' ? h('object', { data: src, type: r.data.mime }) : h('img', { src, alt: 'Bukti pembayaran' }), h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: () => m.remove() }, 'Tutup'))));
      document.body.append(m);
    }
    function draw(d) {
      const k = d.kpi;
      view(h('div', {}, h('h1', {}, 'Verifikasi Pembayaran'),
        h('div', { class: 'kpis' }, [['Menunggu verifikasi', k.review], ['Pesanan lunas', k.paidOrders], ['Pendapatan terverifikasi', fmt(k.revenue)], ['Notifikasi gagal', k.failedJobs]].map((x, i) => h('div', { class: 'card c' + (i % 3) }, h('p', { class: 'muted', style: 'margin:0' }, x[0]), h('b', {}, x[1])))),
        d.queue.length ? d.queue.map(q => {
          const ap = h('button', { class: 'btn sm' }, 'Setujui'), rj = h('button', { class: 'btn ghost sm' }, 'Tolak');
          ap.onclick = () => { if (confirm('Setujui pembayaran ' + q.orderId + '? Akses kelas akan aktif.')) act(ap, 'payment.approve', { paymentId: q.paymentId }, 'Disetujui. Akses kelas aktif.'); };
          rj.onclick = () => { const why = prompt('Alasan penolakan (dikirim ke member):'); if (why && why.trim().length >= 3) act(rj, 'payment.reject', { paymentId: q.paymentId, reason: why.trim() }, 'Pembayaran ditolak.'); };
          return h('div', { class: 'panel' }, h('div', { class: 'row' }, h('b', {}, q.title), badge('Menunggu verifikasi', 'wait')),
            h('p', { class: 'muted' }, q.name + ' (' + q.email + ') • ' + q.orderId + ' • ' + fmt(q.amount) + ' • ' + tgl(q.createdAt)),
            h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: () => proof(q.paymentId) }, 'Lihat Bukti'), ap, rj));
        }) : h('div', { class: 'panel' }, h('p', {}, 'Tidak ada bukti yang menunggu verifikasi.')),
        h('button', { class: 'btn ghost sm', onclick: refresh }, 'Segarkan')));
    }
  }

  // ---------- Panel kanan ----------
  function rail() {
    const r = $('#rail');
    if (!S.token) return r.replaceChildren(h('div', { class: 'panel' }, h('h3', {}, 'Selamat datang'), h('p', { class: 'muted' }, 'Masuk dengan Google untuk membeli kelas dan melacak progres belajar Anda.')));
    swr('boot', 'boot', {}, d => {
      const tot = d.mine.reduce((a, c) => a + c.total, 0), dn = d.mine.reduce((a, c) => a + c.done, 0), pct = tot ? Math.round(dn / tot * 100) : 0;
      const wa = h('input', { type: 'tel', value: d.profile.wa || '', placeholder: '08xxxxxxxxxx', 'aria-label': 'Nomor WhatsApp' });
      const save = h('button', { class: 'btn sm', onclick: async () => { const x = await api('profile.save', { wa: wa.value }); toast(x.success ? 'Nomor WhatsApp tersimpan.' : x.message); if (x.success) stale('boot'); } }, 'Simpan');
      r.replaceChildren(...[
        h('div', { class: 'panel' }, h('h3', {}, 'Ringkasan Progres'), h('p', { class: 'muted' }, tot ? dn + ' dari ' + tot + ' pelajaran wajib selesai (' + pct + '%)' : 'Belum ada kelas aktif.'), h('div', { class: 'bar' }, h('i', { style: 'width:' + pct + '%' }))),
        h('div', { class: 'panel' }, h('h3', {}, 'Notifikasi WhatsApp'), h('p', { class: 'muted' }, 'Nomor untuk info pesanan dan akses kelas.'), wa, h('div', { style: 'margin-top:10px' }, save)),
        d.settings.cs_wa ? h('div', { class: 'panel' }, h('h3', {}, 'Butuh bantuan?'), h('a', { class: 'btn ghost sm', href: 'https://wa.me/' + d.settings.cs_wa, target: '_blank', rel: 'noopener' }, 'Hubungi Admin')) : null
      ].filter(Boolean));
    }, { fresh: 30000 });
  }

  // ---------- Router ----------
  function route() {
    const p = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent), name = p[0] || 'katalog';
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name || (name === 'kelas' && a.dataset.nav === 'katalog') || (name === 'belajar' && a.dataset.nav === 'kelas-saya') || (name === 'checkout' && a.dataset.nav === 'transaksi')));
    const pages = { katalog, kelas, checkout, 'kelas-saya': mine, belajar: learn, transaksi, admin: adminPage };
    (pages[name] || katalog)(p[1], p[2]); rail(); window.scrollTo(0, 0);
  }
  $('#theme').onchange = e => { Store.set('theme', e.target.value); applyTheme(); };
  mq.addEventListener('change', applyTheme);
  window.addEventListener('hashchange', route);
  window.addEventListener('session-expired', () => { renderUser(); toast('Sesi berakhir. Silakan masuk lagi.'); initGoogle(); route(); });
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { warm(); flush(); } });
  setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 15000);
  applyTheme(); renderUser(); warm(); route(); initGoogle(); flush();
})();
