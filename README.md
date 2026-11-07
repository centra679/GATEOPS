# GateOps

GateOps adalah platform operasional berbasis web yang dirancang untuk mendukung keamanan, kontrol akses, perjalanan personel, kunjungan tamu, dan tugas jaga di lingkungan satuan atau unit operasional. Sistem ini mengikuti spesifikasi yang berlaku sebagai sumber kebenaran utama dan menempatkan keamanan, validasi server-side, serta kontrol akses berbasis unit sebagai prinsip inti.

Dokumen ini bertujuan menjadi panduan implementasi, konfigurasi, operasional, dan deployment untuk seluruh tim pengembang, administrator, dan pemangku kepentingan yang terlibat dalam pengelolaan platform.

## Ringkasan proyek

GateOps menggabungkan empat komponen utama:

- Frontend web modern berbasis Next.js dan React
- Backend autentikasi dan otorisasi berbasis Supabase Edge Functions
- Database relasional PostgreSQL yang diproteksi dengan Row Level Security (RLS)
- Operasional domain seperti rencana izin, QR scan, GPS, jaga, dan kunjungan tamu

Sistem ini tidak menyamarkan data, tidak mengandalkan konfigurasi dummy, dan tidak mengizinkan penulisan langsung ke tabel sensitif dari sisi client. Semua operasi kritis dikendalikan melalui prosedur server-side dan fungsi RPC yang disusun untuk menjaga integritas data, audit trail, serta pembatasan unit.

## Prinsip desain

- Satu sumber kebenaran: `spesifikasi.md`
- Data tidak boleh diproses secara imajiner atau seed palsu
- Akses diberlakukan berdasarkan unit, peran, dan konteks tugas
- Semua operasi sensitif dijalankan melalui backend dengan validasi server
- Auth login dilakukan melalui resolver khusus, bukan penyimpanan PIN di tabel operasional
- Setiap perubahan signifikan dicatat untuk audit dan pemulihan

## Arsitektur sistem

### 1. Frontend
- Next.js App Router
- React + TypeScript
- Tailwind CSS v4
- Antarmuka responsif dengan tema hijau militer modern

### 2. Backend dan autentikasi
- Supabase Auth untuk credential dan sesi
- Edge Functions untuk resolver login NRP/PIN dan provisioning akun
- Validasi origin, URL, dan otorisasi berbasis token

### 3. Database
- PostgreSQL di Supabase
- Migrasi SQL berurutan dalam `supabase/migrations`
- RLS dan GRANT yang membatasi akses per unit dan per role
- RPC `SECURITY DEFINER` untuk mutasi sensitif

### 4. Domain operasional
- Izin / perjalanan personel
- QR keluar masuk
- Pelacakan lokasi GPS
- Manajemen post/unit
- Tugas jaga dan undangan sementara
- Kunjungan tamu dan dokumen privat

## Teknologi utama

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS v4
- Supabase Auth, PostgreSQL, RLS, Storage
- `@supabase/ssr` dan `@supabase/supabase-js`
- `lucide-react` untuk ikon UI
- `qrcode.react`, `@zxing/browser`, `leaflet`, `react-leaflet`
- `exceljs` dan `jspdf` untuk kebutuhan ekspor data

## Struktur proyek

```text
.
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── app/
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth/
│   │   └── workspace/
│   ├── lib/
│   │   ├── auth/
│   │   ├── gateops/
│   │   ├── http/
│   │   └── supabase/
│   └── proxy.ts
├── supabase/
│   ├── functions/
│   └── migrations/
├── .env.example
├── package.json
├── next.config.ts
├── README.md
├── spesifikasi.md
├── tsconfig.json
└── eslint.config.mjs
```

## Persyaratan lingkungan

- Node.js 20.9+
- npm 10+
- Supabase project aktif
- CLI Supabase terinstall
- akses ke environment project untuk deploy fungsi dan migrasi

## Konfigurasi environment

Salin contoh environment:

```bash
cp .env.example .env.local
```

Isi variabel berikut sesuai project Supabase Anda:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_AUTH_RESOLVER_URL="https://<project-ref>.supabase.co/functions/v1/auth-nrp-pin"
```

> Jangan menyimpan service-role key di frontend atau repository. Secret sensitif hanya dipasang di environment Supabase Edge Function atau secret manager yang aman.

## Menjalankan aplikasi lokal

```bash
npm install
npm run dev
```

Akses aplikasi di:

```text
http://localhost:3000
```

Validasi kode yang direkomendasikan:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy database dan backend

Pasang CLI Supabase dan hubungkan ke project Anda:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Seluruh migrasi berada di direktori `supabase/migrations/`. Migrasi dibuat berurutan untuk membangun:

- profil pengguna dan satuan
- tabel transactional operasional
- kontrol akses dan permisian
- fungsi RPC untuk izin, QR, GPS, jaga, dan tamu
- backend autentikasi
- audit trail dan mekanisme keamanan

## Deploy Edge Functions

Set key rahasia yang diperlukan sebelum deploy fungsi:

```bash
supabase secrets set \
  IDENTITY_LOOKUP_SECRET='<random-secret-min-32-char>' \
  GATEOPS_BOOTSTRAP_SECRET='<one-time-random-secret-min-32-char>'
```

Deploy fungsi utama:

```bash
supabase functions deploy auth-nrp-pin
supabase functions deploy provision-account
supabase functions deploy manage-account
supabase functions deploy bootstrap-admin
```

## Bootstrap admin awal

Bootstrap admin adalah operasi satu kali yang harus dijalankan melalui kanal backend tepercaya, bukan dari browser.

Header yang digunakan:

```http
x-gateops-bootstrap-key: <secret>
```

Payload biasanya mencakup:

- NRP admin tujuh digit
- PIN
- nama lengkap
- nama satuan

Setelah bootstrap berhasil, hapus secret bootstrap dari environment untuk meminimalkan risiko.

## Model autentikasi dan keamanan

GateOps menggunakan mekanisme autentikasi yang disesuaikan dengan kebutuhan operasional:

- Login mengandalkan resolver khusus NRP/PIN
- PIN tidak disimpan di tabel operasional
- Suatu identitas dan IP dibatasi pada percobaan login tertentu
- Kegagalan login tidak membocorkan keberadaan akun
- Proses perubahan status akun dan sesi GoTrue dilakukan di backend agar sinkron dan aman

Semua operasi sensitif dipisahkan dari akses klien langsung. Ini termasuk:

- pembuatan rencana izin
- pengelolaan akun
- mutasi out/in QR
- tugas jaga
- pendaftaran tamu
- penyimpanan dokumen privat

## Fitur operasional

### Manajemen personel dan akun
- Admin dapat menyiapkan akun personel dan keluarga
- Pengelolaan status akun dan keanggotaan satuan
- Akses unit dibatasi sesuai konteks data

### Izin dan perjalanan
- Personel membuat rencana perjalanan
- Validasi otomatis terhadap waktu keluar dan kembali
- Pembatalan dan penyelesaian sesi perjalanan diatur dengan kontrol backend

### QR dan scanning
- Sistem QR pos dan token unik
- Validasi satu sesi aktif per pengguna
- Request ID dan locking di transaksi database untuk mencegah duplikasi dan race condition

### GPS dan lokasi
- Rekaman lokasi yang dikaitkan dengan sesi keluar/masuk
- History dan live location hanya dapat diakses melalui RPC yang terdokumentasi dan diaudit

### Jaga dan undangan sementara
- Undangan jaga dibuat untuk personel yang aktif
- Token disimpan dalam bentuk hash
- Tugas diverifikasi pada basis waktu dan status akun

### Tamu dan dokumen
- Pendaftaran kunjungan tamu
- Catat keluar saat tamu meninggalkan area
- Upload dokumen privat dengan path berbasis unit dan kunjungan
- RLS Storage membatasi akses sesuai tugas dan otoritas

## RPC utama

Fungsi operasional yang disediakan meliputi:

- Izin: `create_movement_plan`, `cancel_movement_plan`, `get_my_movement_status`
- QR: `process_qr_scan`, `admin_manage_qr`, `admin_force_close_movement`
- GPS: `record_location_point`, `get_admin_live_locations`, `get_admin_location_history`
- Admin: `get_admin_dashboard`, `admin_manage_unit`, `admin_manage_post`, `admin_manage_setting`, `admin_set_unit_membership_status`, `admin_set_account_status`
- Jaga: `admin_create_guard_invite`, `accept_guard_invite`, `revoke_guard_assignment`, `generate_guard_report`, `generate_due_guard_reports`
- Tamu: `create_visitor_visit`, `record_visitor_exit`, `register_visitor_document`

## Scheduler dan pemeliharaan

Aktifkan ekstensi `pg_cron` di proyek Supabase, lalu jadwalkan maintenance rutin dari SQL Editor:

```sql
select cron.schedule(
  'gateops-scheduled-maintenance',
  '* * * * *',
  $$select public.run_scheduled_maintenance()$$
);
```

Tujuan scheduler adalah:

- mengubah rencana yang sudah lewat waktu menjadi kedaluwarsa
- mengirim notifikasi yang relevan
- membuat laporan tugas yang belum tersedia

## Keamanan dan batasan integrasi

Beberapa prinsip keamanan yang harus dipatuhi:

- tabel operasional tidak boleh ditulis langsung dari frontend
- semua mutasi sensitif harus melewati RPC atau Edge Function
- `search_path` pada fungsi keamanan harus terkunci
- akses file dan dokumen privat harus difilter oleh RLS Storage
- service-role key tidak boleh dikirim ke frontend atau disimpan di repositori

## Batasan yang diketahui

Beberapa elemen bersifat pembatasan desain yang disadari dan tetap sesuai spesifikasi:

- GPS browser tidak menjamin pembaruan di latar belakang sepenuhnya
- PDF, Excel, push notification, dan UI modul khusus mungkin memerlukan pengerjaan lanjutan sesuai kebutuhan produk
- semua komponen backend dan database harus sudah dideploy ke project Supabase aktif sebelum aplikasi benar-benar digunakan untuk operasi produksi

## Panduan troubleshooting

### Login gagal
- Periksa variabel environment Supabase
- Pastikan `SUPABASE_AUTH_RESOLVER_URL` sesuai origin project
- Pastikan fungsi `auth-nrp-pin` sudah dideploy dengan secret yang valid

### Database tidak terhubung
- Jalankan `supabase db push` setelah menghubungkan project
- Periksa apakah migrasi SQL sudah lengkap dan berurutan
- Cek apakah RLS dan permission sudah diterapkan

### Edge Function error
- Verifikasi secret environment di Supabase
- Pastikan domain URL function sesuai dengan project dan path yang benar
- Cek log runtime pada dashboard Supabase

### Akses data tidak muncul
- Pastikan role user sesuai dengan unit dan keanggotaan
- Cek apakah akun sudah di-provision dan status aktif
- Pastikan RPC yang dipanggil valid untuk konteks role tersebut

## Status proyek

Proyek ini dirancang sebagai fondasi operasional GateOps yang siap dikembangkan dan dideploy ke lingkungan Supabase nyata. Ini adalah implementasi berorientasi produksi dengan penekanan pada keamanan, audit, validasi server, dan kontrol access yang konsisten.

`spesifikasi.md` adalah sumber kebenaran utama dan wajib dijadikan referensi final ketika ada kebutuhan interpretasi, kebutuhan perubahan bisnis, atau kebutuhan validasi implementasi.

## Catatan penting

Repository ini tidak mengandung akun operasional fiktif, seed pengguna dummy, atau data kunjungan tiruan. Semuanya harus dibuat melalui proses bootstrap, provisioning, dan operasi backend yang benar sesuai alur yang ditetapkan oleh spesifikasi.
