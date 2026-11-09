# Panduan Instalasi — Portal Kelas Digital (Tahap 1)

Dua bagian: **backend** (Google Apps Script, file `Kode.gs` + `appsscript.json`) dan **frontend** (folder `portal-kelas-digital` dari ZIP, untuk GitHub Pages).

## A. Backend (Google Apps Script)
1. Buka https://script.google.com → **Proyek baru**.
2. Ganti isi `Code.gs` dengan isi `Kode.gs` (rename file menjadi `Kode`).
3. **Project Settings** → centang **Show "appsscript.json" manifest file** → ganti isinya dengan `appsscript.json`.
4. Pilih fungsi `setupAppEnvironment` → **Run** (hanya perlu sekali, aman diulang) → beri izin. Ini membuat folder Drive, spreadsheet database, semua sheet, rahasia sesi, dan trigger antrean notifikasi. Alamat spreadsheet ada di Execution log.
5. **Project Settings → Script Properties** → tambah:
   - `GOOGLE_CLIENT_ID` — dari langkah B di bawah.
   - `OWNER_EMAIL` — email Google Anda. Akun ini otomatis menjadi **admin** saat login pertama.
   - `FONNTE_TOKEN` — opsional, hanya jika memakai WhatsApp (Fonnte).
   - Jangan menulis nilai-nilai ini di kode, sheet, atau README. Jangan menambah editor proyek sembarangan: editor bisa melihat Script Properties.
6. Buka spreadsheet → sheet **Settings**: isi `bank_instruction` (rekening/QRIS), `admin_wa`, `admin_email`, `cs_wa`. Ubah `notif_wa` / `notif_email` menjadi `ON` bila ingin notifikasi aktif.
7. (Opsional, untuk uji) jalankan `seedDemo` → membuat satu kelas contoh dengan 3 pelajaran.
8. **Deploy → New deployment → Web app** → *Execute as: Me*, *Who has access: Anyone* → salin URL yang berakhiran `/exec`.
9. Setiap kali kode diubah: **Deploy → Manage deployments → ✏️ Edit → Version: New version**. Jangan "New deployment" — URL akan berubah dan frontend mati.

## B. Google Login (OAuth Client ID)
1. https://console.cloud.google.com → pilih/buat project → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized JavaScript origins**: `https://USERNAME.github.io` (ganti USERNAME dengan username GitHub Anda; tanpa garis miring di akhir).
3. Salin Client ID → isi ke Script Properties `GOOGLE_CLIENT_ID` (langkah A5). Client ID tidak ditulis di frontend; frontend mengambilnya dari server.

## C. Frontend (GitHub Pages)
1. Ekstrak `portal-kelas-digital.zip`. Folder hasil ekstraksi bernama **`portal-kelas-digital`**.
2. Buka `js/config.js` → ganti nilai `GAS_URL` dengan URL `/exec` dari langkah A8. Simpan.
3. Buka terminal **di dalam folder `portal-kelas-digital`** (folder yang langsung berisi `index.html`, `css`, `js`). Cek dulu:
   ```
   ls        # Mac/Linux/Git Bash      |   dir   # PowerShell
   ```
   `index.html` harus tampil di daftar. Jika tidak terlihat, Anda di folder yang salah — jangan lanjut.
4. Buat repository **Public** baru di GitHub (jangan centang README/.gitignore/license), lalu jalankan:
   ```
   git init
   git add .
   git commit -m "Upload pertama"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
   Saat diminta password, gunakan **Personal Access Token** (scope `repo`), bukan password akun. Layar tidak menampilkan karakter saat Anda menempel token — itu normal.
5. Repo → **Settings → Pages → Deploy from a branch → main / (root)** → Save. Tunggu 1–2 menit, buka `https://USERNAME.github.io/NAMA-REPO/`.
6. Setelah mengubah file: `git add .` → `git commit -m "pesan"` → `git push`, lalu Ctrl+Shift+R.

## D. Uji alur (pakai dua akun Google)
1. Akun admin (= `OWNER_EMAIL`): masuk → menu **Admin** muncul.
2. Akun member: masuk → buka kelas → **Beli** → unggah bukti (JPG/PNG/PDF ≤ 5 MB).
3. Akun admin: **Admin** → **Lihat Bukti** → **Setujui** → akun member melihat kelas di **Kelas Saya**, lalu coba **Tandai Selesai**.
4. Coba **Tolak** dengan alasan, lalu unggah ulang bukti dari akun member.

## Batasan Tahap 1 (jujur)
- Kode **baru dicek sintaksnya** dan belum dijalankan di Apps Script/browser sungguhan. Uji dulu sebelum dipakai publik; kirim pesan error bila ada.
- Panggilan pertama setelah lama tidak dipakai bisa 1–4 detik (cold start Google). Frontend menampilkan data tersimpan lebih dulu dan memanaskan server saat dibuka.
- Kelas, modul, dan pelajaran masih diisi langsung di spreadsheet (sheet `Courses`, `Modules`, `Lessons`); perubahan tampil maksimal ±10 menit, atau jalankan aksi `admin.bump`. Editor kelas di dashboard ada di tahap berikutnya.
- Belum ada: payment gateway/webhook, materi unduhan, CRM, laporan, modul impor data lama, kalender/pengumuman, chat dua arah. Pesanan kedaluwarsa hanya ditandai saat dibaca.
- Notifikasi hanya transaksional (pesanan, bukti masuk, ditolak, akses aktif) lewat antrean + trigger 1 menit; tanpa token Fonnte, pesan WA akan berstatus gagal setelah beberapa percobaan.
- Trigger berjalan tiap menit memakai kuota runtime harian Google (akun gratis ±90 menit/hari).
