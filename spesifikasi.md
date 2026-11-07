GATEOPS

SPESIFIKASI LENGKAP FINAL BASELINE

Status: Baseline Utama Resmi
Versi: 1.0
Platform: Web Application / Mobile Responsive
Frontend: Next.js + React
Backend: Supabase
Database: PostgreSQL
Authentication: Supabase Auth dengan mekanisme login NRP dan PIN
Lokasi: GPS perangkat pengguna
Identifikasi pos: QR Code statis

---

1. DESKRIPSI SISTEM

GateOps merupakan sistem informasi terintegrasi untuk mengelola aktivitas keluar-masuk personel dan keluarga/Persit, rencana izin, pemantauan lokasi GPS, pencatatan tamu dan kendaraan, serta pengelolaan petugas jaga sementara.

Sistem memiliki satu pusat data dan empat jenis peran pengguna:

1. Admin.
2. Personel.
3. Keluarga/Persit.
4. Petugas jaga sementara.

GateOps dirancang agar proses pencatatan keluar-masuk berjalan otomatis melalui QR Code yang dipasang di pos penjagaan. Pengguna memindai QR menggunakan smartphone masing-masing tanpa memerlukan akun operator pos.

Admin memiliki kewenangan pengelolaan dan pengawasan sesuai satuan yang menjadi tanggung jawabnya.

2. TUJUAN SISTEM

1. Digitalisasi pencatatan keluar-masuk personel dan keluarga.
2. Digitalisasi pembuatan rencana izin.
3. Otomatisasi pencatatan waktu keluar dan kembali.
4. Pemantauan lokasi pengguna yang sedang berada di luar.
5. Pengelolaan data personel dan keluarga.
6. Pengelolaan pos dan QR Code.
7. Pencatatan identitas tamu dan kendaraan.
8. Pengelolaan penugasan petugas jaga sementara.
9. Pembuatan laporan dan riwayat aktivitas.
10. Peningkatan keamanan, ketertiban, dan akuntabilitas administrasi.

3. TEKNOLOGI DAN ARSITEKTUR

3.1 Teknologi utama

- Next.js sebagai framework aplikasi.
- React sebagai library antarmuka.
- TypeScript untuk konsistensi tipe data.
- Supabase Auth untuk autentikasi.
- PostgreSQL sebagai database utama.
- Supabase Storage untuk dokumentasi dan foto.
- Supabase Realtime untuk pembaruan data dashboard.
- Supabase Edge Functions atau backend server untuk proses autentikasi dan operasi sensitif.
- GPS perangkat untuk pengambilan koordinat.
- QR Code untuk transaksi keluar-masuk.
- Peta digital untuk visualisasi lokasi.

3.2 Arsitektur

Frontend mengakses backend melalui jalur yang terotorisasi.

Operasi sensitif tidak boleh hanya mengandalkan validasi di frontend.

Seluruh proses penting harus divalidasi di backend atau fungsi database yang memiliki hak akses terbatas.

Arsitektur utama:

1. Frontend Next.js dan React.
2. Backend dan API.
3. Supabase Auth.
4. PostgreSQL.
5. Row Level Security.
6. Database RPC.
7. Supabase Storage.
8. Realtime.
9. GPS dan peta.

3.3 Prinsip arsitektur

- Satu aplikasi.
- Satu pusat database.
- Empat peran pengguna.
- Hak akses berdasarkan peran dan satuan.
- Semua transaksi penting tercatat.
- Data sensitif tidak dapat diakses tanpa otorisasi.
- Tidak ada akses lintas satuan tanpa kewenangan.

4. JENIS AKUN DAN HAK AKSES

4.1 ADMIN

Admin merupakan pengelola utama GateOps.

Hak akses:

- Mengakses dashboard admin.
- Melihat statistik keseluruhan.
- Melihat personel di dalam dan di luar satuan.
- Melihat keluarga/Persit di dalam dan di luar satuan.
- Memantau lokasi GPS pengguna yang sedang berada di luar.
- Melihat lokasi terakhir dan waktu pembaruan GPS.
- Melihat riwayat perjalanan.
- Mengelola data personel.
- Mengelola akun keluarga/Persit.
- Mengelola pos penjagaan.
- Membuat dan mengelola QR Code.
- Mengaktifkan dan menonaktifkan QR.
- Melihat rencana izin.
- Melihat riwayat keluar-masuk.
- Melakukan tindakan administratif terhadap sesi yang bermasalah.
- Mengelola data tamu dan kendaraan.
- Mengundang petugas jaga sementara.
- Mengatur durasi penugasan.
- Melihat laporan penjagaan.
- Melihat audit log.
- Mengelola konfigurasi sistem.

Setiap tindakan administratif penting wajib disertai catatan alasan dan disimpan di audit log.

4.2 PERSONEL

Login menggunakan:

- NRP.
- PIN.

Hak akses:

- Melihat profil pribadi.
- Membuat rencana izin.
- Melihat status rencana izin.
- Melakukan scan QR untuk keluar.
- Melakukan scan QR untuk kembali.
- Mengaktifkan GPS melalui transaksi keluar.
- Mengakhiri GPS melalui transaksi kembali.
- Melihat status perjalanan pribadi.
- Melihat riwayat keluar-masuk pribadi.
- Melihat dan mengubah informasi akun yang diizinkan.
- Menerima undangan tugas jaga sementara.

Personel tidak dapat melihat data GPS pengguna lain.

4.3 KELUARGA/PERSIT

Setiap akun keluarga/Persit merupakan akun tersendiri.

Data akun:

- Nama.
- Kode akun keluarga unik.
- PIN.
- NRP personel yang menjadi penghubung.
- Status akun.
- Satuan terkait.

Login menggunakan:

- Kode akun keluarga unik.
- PIN.

NRP suami/personel digunakan sebagai referensi hubungan akun. Jika antarmuka membutuhkan NRP suami sebagai identitas tambahan, sistem tetap harus menggunakan kode akun keluarga unik agar akun yang terhubung dengan NRP sama tidak tertukar.

Hak akses:

- Melihat profil sendiri.
- Membuat rencana izin.
- Melihat status izin.
- Scan QR keluar dan kembali.
- Mengaktifkan GPS selama berada di luar.
- Mengakhiri GPS saat kembali.
- Melihat riwayat pribadi.

Keluarga/Persit tidak dapat melihat lokasi keluarga lain atau mengakses dashboard admin.

4.4 PETUGAS JAGA SEMENTARA

Petugas jaga sementara bukan jenis akun baru. Petugas merupakan personel yang mendapatkan penugasan tambahan untuk periode tertentu.

Hak akses:

- Menerima undangan tugas dari admin.
- Mengaktifkan mode penjagaan.
- Mencatat tamu masuk.
- Mencatat kendaraan.
- Mengambil foto identitas tamu.
- Mengunggah dokumentasi.
- Mencatat tamu keluar.
- Melihat kunjungan yang ditanganinya.
- Melihat laporan tugas sendiri.

Tidak memiliki hak akses:

- Dashboard admin.
- Pemantauan GPS.
- Data lokasi personel lain.
- Pengelolaan akun.
- Pengelolaan QR.
- Pengelolaan personel.
- Pengelolaan konfigurasi sistem.

Setelah masa tugas berakhir, hak akses penjagaan otomatis dicabut dan akun kembali ke hak akses personel biasa.

5. LOGIN DAN AUTENTIKASI

5.1 Login personel

NRP + PIN.

5.2 Login keluarga/Persit

Kode akun keluarga unik + PIN.

Akun keluarga terhubung ke NRP personel melalui data relasi.

5.3 Login admin

NRP admin khusus tujuh digit + PIN.

Pendaftaran admin tidak tersedia untuk pengguna umum. Akun admin dibuat atau ditetapkan melalui proses administrasi yang berwenang.

5.4 Keamanan autentikasi

- PIN tidak boleh disimpan sebagai teks biasa.
- PIN harus di-hash melalui mekanisme autentikasi yang aman.
- Percobaan login dibatasi.
- Percobaan gagal berulang dapat menyebabkan penguncian sementara.
- Sistem tidak boleh membocorkan apakah suatu NRP atau akun terdaftar.
- Token autentikasi harus memiliki masa berlaku dan mekanisme pencabutan.
- Hak akses harus diverifikasi di backend.
- Kunci rahasia Supabase tidak boleh dikirim ke frontend.

NRP bukan email native Supabase Auth. Oleh karena itu, proses login NRP dan PIN memerlukan resolver identitas yang aman melalui backend atau Edge Function. Penggunaan alamat email sintetis, jika dipilih, harus dikelola di server dan tidak ditampilkan sebagai kredensial pengguna.

6. MANAJEMEN DATA PENGGUNA

Admin dapat:

- Menambahkan personel.
- Mengubah data personel.
- Menonaktifkan akun.
- Mengaktifkan kembali akun.
- Mengelola NRP.
- Mengelola data satuan.
- Menambahkan akun keluarga.
- Menghubungkan akun keluarga dengan personel.
- Mengubah status akun keluarga.
- Mengatur hubungan pengguna dengan satuan.

Setiap akun memiliki identitas internal berupa UUID yang tidak berubah walaupun informasi profil diperbarui.

NRP dan kode akun keluarga harus unik sesuai ketentuan masing-masing.

7. RENCANA IZIN KELUAR

Personel dan keluarga wajib membuat rencana izin sebelum melakukan scan QR untuk keluar.

7.1 Data rencana izin

- Identitas pengguna.
- Tanggal keluar.
- Jam rencana keluar.
- Perkiraan waktu kembali.
- Tujuan.
- Keperluan.
- Keterangan tambahan.
- Waktu pembuatan.
- Status rencana.

7.2 Status rencana

Status:

- Disetujui.
- Digunakan.
- Selesai.
- Dibatalkan.
- Kedaluwarsa sesuai aturan sistem.

7.3 Persetujuan otomatis

Setelah rencana berhasil dibuat dan validasi sistem terpenuhi, status otomatis menjadi disetujui.

Tidak ada persetujuan manual admin sebagai langkah wajib.

Admin tetap dapat melihat rencana, melakukan pengawasan, dan menjalankan tindakan administratif sesuai kewenangan.

7.4 Validasi rencana

Sistem memeriksa:

- Akun aktif.
- Rencana memiliki tanggal dan waktu yang valid.
- Tidak terdapat sesi keluar aktif yang bertentangan.
- Rencana belum digunakan.
- Rencana sesuai dengan satuan pengguna.

Satu rencana hanya boleh digunakan untuk satu sesi keluar.

8. SISTEM QR CODE

8.1 Konsep QR

Setiap pos memiliki QR Code statis yang dipasang secara fisik.

QR dipindai menggunakan smartphone personel atau keluarga.

Tidak diperlukan akun operator pos untuk proses scan.

Setiap QR terhubung dengan:

- Identitas internal pos.
- Satuan.
- Token QR acak.
- Status aktif.
- Riwayat penggunaan.

Token QR tidak boleh mengandung NRP, nama pengguna, atau informasi sensitif.

8.2 Scan pertama: keluar

Ketika pengguna belum memiliki sesi keluar aktif dan memindai QR yang valid:

1. Sistem memvalidasi akun.
2. Sistem memvalidasi QR.
3. Sistem memvalidasi rencana izin.
4. Sistem mencatat waktu keluar dari server.
5. Sistem membuat sesi perjalanan.
6. Sistem mengaktifkan sesi GPS.
7. Sistem mengubah status pengguna menjadi di luar.
8. Sistem menyimpan peristiwa scan.

8.3 Scan kedua: kembali

Ketika pengguna memiliki sesi keluar aktif dan melakukan scan kembali yang sah:

1. Sistem menemukan sesi keluar aktif milik pengguna.
2. Sistem memvalidasi proses kepulangan.
3. Sistem mencatat waktu kembali.
4. Sistem menutup sesi perjalanan.
5. Sistem mengakhiri sesi GPS.
6. Sistem mengubah status pengguna menjadi di dalam.
7. Sistem menyimpan peristiwa scan.

Tidak perlu memilih tombol keluar atau masuk secara manual.

8.4 Pengendalian transaksi

- Semua waktu transaksi menggunakan waktu server.
- Setiap permintaan memiliki request ID unik.
- Permintaan berulang tidak boleh membuat transaksi ganda.
- Satu pengguna tidak boleh memiliki lebih dari satu sesi keluar aktif.
- Transaksi scan harus atomik.
- Proses bersamaan harus dikendalikan dengan penguncian baris atau mekanisme transaksi yang tepat.
- Riwayat scan tidak boleh dihapus oleh pengguna biasa.

8.5 QR dinonaktifkan

Admin dapat menonaktifkan QR untuk kondisi khusus.

Namun, sistem wajib menyediakan jalur kepulangan alternatif yang sah bagi pengguna yang sedang berada di luar.

Contoh:

- QR khusus kepulangan.
- Prosedur validasi oleh admin.
- Mekanisme kepulangan darurat.

QR yang dinonaktifkan tidak boleh membuat pengguna kehilangan kemampuan mencatat kepulangan.

8.6 Batasan keamanan QR

QR statis dapat difoto atau disalin. Karena itu, scan QR hanya membuktikan bahwa token QR digunakan, bukan membuktikan secara mutlak bahwa pengguna hadir secara fisik di pos.

Validasi tambahan dapat menggunakan lokasi GPS dan radius pos, tetapi GPS juga dapat dipalsukan. Sistem harus menyimpan hasil validasi dan tingkat keyakinannya tanpa mengklaim bukti kehadiran yang sempurna.

9. SISTEM GPS

9.1 Aktivasi

GPS otomatis diaktifkan setelah transaksi keluar berhasil.

GPS berlaku untuk:

- Personel.
- Keluarga/Persit.

GPS berakhir setelah transaksi kepulangan berhasil atau tindakan administratif yang sah.

9.2 Data GPS

Setiap titik lokasi menyimpan:

- ID pengguna.
- ID sesi perjalanan.
- Latitude.
- Longitude.
- Akurasi.
- Waktu pengambilan.
- Waktu penerimaan server.
- Informasi sumber/perangkat jika diperlukan.

9.3 Dashboard GPS admin

Admin dapat melihat:

- Personel yang sedang di luar.
- Keluarga yang sedang di luar.
- Posisi terakhir.
- Identitas pengguna.
- Waktu keluar.
- Tujuan.
- Waktu pembaruan GPS terakhir.
- Akurasi GPS.
- Status GPS.
- Durasi berada di luar.
- Riwayat pergerakan.

Admin dapat memilih pengguna tertentu untuk melihat detail perjalanan.

9.4 Status GPS

Status:

- Aktif.
- Terakhir terdeteksi.
- Tidak tersedia.
- Selesai.

Jika GPS berhenti mengirim lokasi, sistem tidak boleh otomatis mengubah status pengguna menjadi di dalam.

Sesi keluar tetap aktif sampai ada transaksi kepulangan yang sah atau tindakan administratif.

9.5 Batasan perangkat

Browser dan PWA tidak menjamin pengiriman GPS terus-menerus saat aplikasi berada di latar belakang atau ditutup.

Untuk kebutuhan pemantauan background yang lebih andal, aplikasi harus dikembangkan menggunakan pendekatan mobile native atau Capacitor dengan izin background location sesuai kebijakan Android dan iOS.

Sistem harus tetap dapat menangani:

- Izin lokasi dicabut.
- Koneksi internet terputus.
- Baterai habis.
- GPS tidak tersedia.
- Perangkat tidak mengirim data.
- Data lokasi terlambat diterima.

9.6 Privasi GPS

- Pengguna hanya melihat lokasi sendiri.
- Admin berwenang melihat lokasi pengguna dalam cakupan satuannya.
- Keluarga tidak dapat melihat lokasi keluarga lain.
- Petugas jaga tidak dapat melihat GPS.
- Akses GPS admin dicatat.
- Data GPS memiliki masa retensi.
- Riwayat lokasi tidak dapat diakses tanpa hak yang sesuai.

10. DASHBOARD ADMIN

Dashboard admin menjadi pusat pengawasan.

10.1 Statistik

Menampilkan:

- Total personel.
- Total keluarga.
- Total pengguna aktif.
- Personel di dalam.
- Personel di luar.
- Keluarga di dalam.
- Keluarga di luar.
- Izin berjalan.
- Tamu berada di dalam.
- Petugas jaga aktif.

10.2 Peta

Menampilkan lokasi pengguna yang sedang berada di luar.

Fitur:

- Marker pengguna.
- Identitas pengguna.
- Status lokasi.
- Waktu pembaruan.
- Akurasi GPS.
- Detail sesi perjalanan.
- Riwayat pergerakan.

10.3 Manajemen

Menu admin:

1. Dashboard.
2. Pemantauan GPS.
3. Data personel.
4. Data keluarga/Persit.
5. Data akun.
6. Data satuan.
7. Data pos.
8. QR Code.
9. Rencana izin.
10. Riwayat keluar-masuk.
11. Tamu.
12. Kendaraan.
13. Petugas jaga.
14. Laporan.
15. Audit log.
16. Pengaturan.

11. PENCATATAN TAMU DAN KENDARAAN

Tamu yang bukan personel dan bukan keluarga/Persit wajib dicatat.

11.1 Data tamu

- Nama lengkap.
- Jenis identitas.
- Nomor identitas/KTP.
- Nomor telepon jika diperlukan.
- Keperluan kunjungan.
- Tujuan atau pihak yang dikunjungi.
- Waktu masuk.
- Waktu keluar.
- Petugas pencatat.

11.2 Data kendaraan

Jika membawa kendaraan:

- Jenis kendaraan.
- Merek/tipe.
- Warna.
- Nomor polisi.
- Foto kendaraan atau plat nomor bila diperlukan.

11.3 Dokumentasi

- Foto identitas/KTP.
- Foto kendaraan.
- Dokumen tambahan bila diperlukan.

Dokumen disimpan pada private Storage bucket. Akses diberikan hanya kepada pihak berwenang menggunakan mekanisme otorisasi atau URL bertanda tangan yang memiliki masa berlaku terbatas.

11.4 Proses kunjungan

1. Tamu datang.
2. Petugas membuka form.
3. Petugas mengisi identitas.
4. Petugas mengisi data kendaraan jika ada.
5. Petugas mengunggah dokumentasi.
6. Sistem mencatat waktu masuk.
7. Status kunjungan menjadi aktif.
8. Ketika tamu keluar, petugas mencatat waktu keluar.
9. Status kunjungan menjadi selesai.

Satu kunjungan aktif tidak boleh ditutup lebih dari satu kali.

12. PETUGAS JAGA SEMENTARA

12.1 Pembuatan undangan

Admin membuat undangan yang berisi:

- Personel yang ditugaskan.
- Pos.
- Waktu mulai.
- Waktu berakhir.
- Keterangan.

Admin mengirim tautan undangan kepada personel.

12.2 Aktivasi

1. Personel membuka undangan.
2. Sistem memvalidasi token.
3. Personel melakukan autentikasi.
4. Sistem memastikan undangan masih berlaku.
5. Sistem memastikan undangan ditujukan kepada personel tersebut.
6. Sistem mengaktifkan penugasan.
7. Hak akses pencatatan tamu diberikan.

Token undangan disimpan dalam bentuk hash dan tidak boleh dapat digunakan berulang kali di luar aturan undangan.

12.3 Masa tugas

Hak akses berlaku sesuai rentang waktu penugasan.

Pemeriksaan masa tugas dilakukan di backend pada setiap permintaan sensitif.

Ketika masa tugas berakhir:

- Penugasan tidak lagi aktif.
- Hak pencatatan tamu sebagai petugas jaga dicabut.
- Akun kembali ke akses personel.
- Riwayat tugas tetap tersimpan.

Admin dapat mencabut penugasan lebih awal.

12.4 Laporan otomatis

Laporan berisi:

- Nama petugas.
- Pos.
- Waktu mulai dan selesai.
- Jumlah tamu masuk.
- Jumlah tamu keluar.
- Daftar kunjungan.
- Data kendaraan.
- Tamu yang belum tercatat keluar.
- Catatan petugas.
- Waktu pembuatan laporan.

Admin dapat melihat dan mengunduh laporan.

13. RIWAYAT DAN LAPORAN

13.1 Riwayat pengguna

Personel dan keluarga dapat melihat:

- Tanggal keluar.
- Jam keluar.
- Jam kembali.
- Tujuan.
- Keperluan.
- Durasi.
- Status perjalanan.

13.2 Riwayat admin

Admin dapat melihat:

- Semua rencana izin sesuai kewenangan.
- Riwayat keluar-masuk.
- Riwayat GPS.
- Riwayat scan.
- Riwayat tamu.
- Riwayat kendaraan.
- Riwayat penjagaan.
- Perubahan data.
- Tindakan administratif.

13.3 Format laporan

- Tampilan dashboard.
- PDF.
- Excel.

Filter:

- Tanggal.
- Rentang waktu.
- NRP.
- Nama.
- Jenis pengguna.
- Pos.
- Status perjalanan.
- Petugas jaga.
- Status tamu.

14. NOTIFIKASI

14.1 Notifikasi pengguna

- Rencana izin berhasil dibuat.
- Rencana otomatis disetujui.
- Scan keluar berhasil.
- Scan kembali berhasil.
- GPS aktif.
- GPS selesai.
- Scan gagal.
- Undangan penjagaan.
- Tugas penjagaan berakhir.

14.2 Notifikasi admin

- Pengguna keluar.
- Pengguna kembali.
- GPS tidak diperbarui.
- Tamu masuk.
- Tamu belum tercatat keluar.
- Petugas jaga mulai bertugas.
- Petugas jaga selesai.
- Kejadian keamanan.

Saluran notifikasi dapat berupa notifikasi aplikasi dan push notification.

15. STRUKTUR DATABASE SUPABASE

Tabel utama:

Tabel| Fungsi
units| Data satuan
profiles| Identitas akun
personnel| Data personel
family_accounts| Data akun keluarga
unit_memberships| Relasi pengguna dan satuan
posts| Data pos
post_qr_codes| Token dan status QR
movement_plans| Rencana izin
movement_sessions| Sesi keluar-masuk
movement_events| Riwayat peristiwa
location_sessions| Sesi GPS
location_points| Titik koordinat
qr_scan_receipts| Idempotensi scan
guard_invites| Undangan petugas
temporary_assignments| Penugasan sementara
visitors| Identitas tamu
visitor_visits| Kunjungan tamu
visitor_documents| Metadata dokumen
guard_reports| Laporan penjagaan
notifications| Notifikasi
audit_logs| Catatan aktivitas
security_events| Catatan keamanan

15.1 Relasi utama

- Satu satuan memiliki banyak personel.
- Satu satuan memiliki banyak pos.
- Satu pos dapat memiliki riwayat QR.
- Satu personel dapat terhubung dengan beberapa akun keluarga.
- Satu pengguna dapat memiliki banyak rencana izin.
- Satu rencana izin maksimal menghasilkan satu sesi perjalanan.
- Satu sesi perjalanan memiliki satu sesi GPS.
- Satu sesi GPS memiliki banyak titik koordinat.
- Satu personel dapat memiliki banyak penugasan dari waktu ke waktu.
- Satu petugas dapat menangani banyak kunjungan tamu.
- Setiap tindakan penting dapat memiliki catatan audit.

15.2 Aturan integritas

1. Satu pengguna hanya boleh memiliki satu sesi perjalanan aktif.
2. Satu sesi perjalanan hanya memiliki satu sesi GPS aktif.
3. Satu rencana izin tidak boleh dipakai berulang.
4. Transaksi scan harus idempotent.
5. Semua waktu transaksi menggunakan waktu server.
6. Pengguna tidak dapat menutup sesi orang lain.
7. Pengguna biasa tidak dapat membuat GPS atas nama pengguna lain.
8. Penugasan jaga harus divalidasi berdasarkan waktu.
9. Kode akun keluarga harus unik.
10. NRP personel harus unik sesuai cakupan identitas.
11. Data antar-satuan harus terisolasi.
12. Riwayat transaksi penting tidak dapat dihapus bebas.

16. FUNGSI BACKEND DAN DATABASE RPC

Operasi sensitif harus diproses melalui fungsi backend atau RPC yang tervalidasi.

Fungsi utama yang diperlukan:

- create_movement_plan
- process_qr_scan
- get_my_movement_status
- start_location_session
- record_location_point
- end_location_session
- admin_force_close_movement
- admin_manage_qr
- create_guard_invite
- accept_guard_invite
- revoke_guard_assignment
- create_visitor_visit
- record_visitor_exit
- generate_guard_report
- get_admin_dashboard
- get_admin_live_locations

Nama fungsi merupakan rancangan penamaan dan dapat disesuaikan ketika migrasi dibuat, tetapi fungsi operasionalnya wajib tersedia.

Semua fungsi harus:

- Memvalidasi identitas pengguna.
- Memvalidasi peran.
- Memvalidasi cakupan satuan.
- Memvalidasi status transaksi.
- Menggunakan transaksi database jika melibatkan beberapa perubahan.
- Membatasi hak eksekusi.
- Mencatat tindakan penting.

Fungsi SECURITY DEFINER harus memiliki pemilik tepercaya, search_path terkunci, serta pemeriksaan otorisasi yang eksplisit.

17. KEAMANAN DAN RLS

RLS wajib diterapkan pada seluruh tabel yang berisi data pengguna atau data operasional.

Prinsip hak akses:

Data| Personel| Keluarga| Admin| Petugas
Profil sendiri| Ya| Ya| Ya| Ya
Profil pengguna lain| Tidak| Tidak| Sesuai kewenangan| Tidak
Riwayat sendiri| Ya| Ya| Ya| Tidak
GPS sendiri| Ya| Ya| Ya| Tidak
GPS orang lain| Tidak| Tidak| Ya| Tidak
Data tamu| Tidak| Tidak| Ya| Sesuai tugas
Manajemen QR| Tidak| Tidak| Ya| Tidak
Dashboard admin| Tidak| Tidak| Ya| Tidak
Laporan tugas sendiri| Tidak| Tidak| Ya| Ya

Ketentuan keamanan:

- Terapkan RLS pada tabel.
- Batasi GRANT dan REVOKE hak tabel.
- Gunakan RPC untuk perubahan sensitif.
- Jangan pernah mengekspos service role key.
- Simpan foto identitas pada bucket privat.
- Batasi akses file berdasarkan hak pengguna.
- Catat akses dan perubahan penting.
- Gunakan validasi server.
- Terapkan pembatasan percobaan autentikasi.
- Terapkan pembatasan permintaan API.
- Sediakan pencabutan sesi.
- Terapkan kebijakan retensi data.

RLS bukan pengganti hak akses PostgreSQL. Keduanya harus dikonfigurasi dengan benar.

18. STRUKTUR MENU APLIKASI

18.1 Personel

1. Dashboard.
2. Rencana izin.
3. Status izin.
4. Scan QR.
5. Status perjalanan.
6. Riwayat.
7. Profil.
8. Pengaturan.

18.2 Keluarga/Persit

1. Dashboard.
2. Rencana izin.
3. Status izin.
4. Scan QR.
5. Status perjalanan.
6. Riwayat pribadi.
7. Profil.
8. Pengaturan.

18.3 Admin

1. Dashboard utama.
2. Peta GPS.
3. Data personel.
4. Data keluarga.
5. Manajemen akun.
6. Manajemen satuan.
7. Manajemen pos.
8. Manajemen QR.
9. Rencana izin.
10. Riwayat keluar-masuk.
11. Data tamu.
12. Data kendaraan.
13. Petugas jaga.
14. Laporan.
15. Audit log.
16. Pengaturan.

18.4 Petugas jaga

1. Dashboard penjagaan.
2. Input tamu.
3. Input kendaraan.
4. Tamu aktif.
5. Pencatatan tamu keluar.
6. Riwayat kunjungan.
7. Laporan tugas.

19. DESAIN ANTARMUKA

Konsep visual utama:

- Profesional.
- Modern.
- Sederhana.
- Responsif.
- Mudah digunakan.
- Mengutamakan keterbacaan.

Arah desain:

- Hijau militer sebagai warna identitas utama.
- Putih dan abu-abu sebagai warna dasar.
- Warna status yang konsisten.
- Navigasi yang berbeda sesuai peran.
- Tampilan mobile-first untuk personel dan keluarga.
- Tampilan desktop yang optimal untuk admin.

Halaman visual utama:

1. Login.
2. Dashboard personel.
3. Dashboard keluarga.
4. Form izin.
5. Scanner QR.
6. Status perjalanan.
7. Peta GPS admin.
8. Dashboard statistik admin.
9. Manajemen personel.
10. Manajemen QR.
11. Data tamu.
12. Input kendaraan.
13. Dashboard petugas jaga.
14. Laporan.
15. Riwayat dan audit log.

20. PENANGANAN KONDISI KHUSUS

Sistem harus menangani:

- QR tidak aktif.
- QR diganti.
- QR dipindai berulang.
- Dua scan terjadi bersamaan.
- Pengguna belum memiliki rencana izin.
- Rencana izin sudah digunakan.
- Pengguna belum kembali.
- GPS tidak tersedia.
- Koneksi internet terputus.
- Pengguna menutup aplikasi.
- Perangkat kehabisan baterai.
- Tugas jaga kedaluwarsa.
- Undangan digunakan oleh akun yang salah.
- Tamu belum tercatat keluar.
- Admin menonaktifkan akun.
- Admin mengakhiri sesi secara manual.
- Pengguna berpindah satuan.
- Gangguan database atau layanan.

Setiap kondisi harus memiliki respons yang jelas dan tidak boleh menyebabkan status database menjadi tidak konsisten.

21. AUDIT DAN PERTANGGUNGJAWABAN

Audit log mencatat:

- Login berhasil dan gagal.
- Perubahan data pengguna.
- Pembuatan izin.
- Transaksi scan.
- Aktivasi dan penutupan GPS.
- Perubahan QR.
- Tindakan administratif.
- Akses lokasi oleh admin.
- Aktivasi tugas jaga.
- Pencabutan tugas.
- Pengelolaan tamu.
- Pengunduhan dokumen sensitif.
- Perubahan konfigurasi.

Audit log harus menyimpan:

- Pelaku.
- Waktu.
- Jenis tindakan.
- Objek yang diubah.
- Data relevan sebelum dan sesudah perubahan jika sesuai.
- Alasan tindakan jika diperlukan.

Data audit tidak boleh dapat diubah secara bebas oleh pengguna biasa.

22. PENGUJIAN DAN KRITERIA PENERIMAAN

Sistem dinyatakan memenuhi baseline apabila seluruh skenario berikut berhasil.

Autentikasi

- Personel dapat login menggunakan NRP dan PIN.
- Keluarga dapat login dengan kode akun unik dan PIN.
- Admin dapat login dengan NRP khusus tujuh digit dan PIN.
- Hak akses tidak dapat dimanipulasi dari frontend.

Rencana izin

- Pengguna dapat membuat rencana izin.
- Rencana otomatis disetujui setelah validasi.
- Rencana tidak dapat digunakan berulang.

QR

- Scan pertama mencatat keluar.
- Scan kedua yang sah mencatat kembali.
- GPS dimulai saat keluar.
- GPS diakhiri saat kembali.
- Scan ganda tidak menghasilkan transaksi ganda.
- Transaksi bersamaan tidak membuat dua sesi aktif.
- QR dinonaktifkan tetap memiliki prosedur kepulangan alternatif.

GPS

- Lokasi pengguna dapat diterima.
- Admin dapat melihat lokasi sesuai kewenangan.
- Pengguna tidak dapat melihat lokasi pengguna lain.
- GPS terputus tidak otomatis mengubah status menjadi di dalam.
- Data lokasi menyimpan akurasi dan waktu.

Tamu

- Data tamu dapat dicatat.
- Data kendaraan dapat dicatat.
- Dokumentasi tersimpan privat.
- Tamu dapat dicatat keluar.
- Kunjungan tidak dapat ditutup berulang.

Petugas jaga

- Admin dapat membuat undangan.
- Undangan hanya dapat digunakan oleh personel yang ditentukan.
- Masa tugas berlaku sesuai jadwal.
- Akses otomatis berakhir.
- Petugas tidak dapat mengakses GPS dan dashboard admin.
- Laporan penjagaan dapat dibuat.

Keamanan

- RLS bekerja.
- Hak tabel dibatasi.
- Data antar-satuan terisolasi.
- File privat tidak dapat diakses tanpa izin.
- Audit log mencatat tindakan penting.

23. TAHAPAN PEMBANGUNAN

Tahap 1 — Fondasi:

- Setup Next.js.
- Setup Supabase.
- Struktur database.
- Auth.
- Profil.
- RLS.
- Fungsi backend.

Tahap 2 — Personel dan keluarga:

- Login.
- Profil.
- Relasi keluarga.
- Rencana izin.

Tahap 3 — QR:

- Manajemen pos.
- Pembuatan QR.
- Scan keluar.
- Scan kembali.
- Pencegahan transaksi ganda.

Tahap 4 — GPS:

- Aktivasi sesi lokasi.
- Penerimaan koordinat.
- Penyimpanan riwayat.
- Peta admin.
- Penanganan GPS terputus.

Tahap 5 — Admin:

- Dashboard.
- Statistik.
- Pengelolaan akun.
- Pengelolaan pos.
- Pengelolaan izin.
- Audit.

Tahap 6 — Tamu dan penjagaan:

- Pencatatan tamu.
- Kendaraan.
- Dokumentasi.
- Undangan petugas.
- Masa tugas.
- Laporan otomatis.

Tahap 7 — Penyelesaian:

- Laporan PDF dan Excel.
- Notifikasi.
- Pengujian keamanan.
- Pengujian integrasi.
- Deployment produksi.

24. KEPUTUSAN BASELINE YANG TIDAK BOLEH BERUBAH TANPA PERSETUJUAN

1. Nama sistem adalah GateOps.
2. Teknologi inti adalah Next.js, React, dan Supabase.
3. Sistem memiliki empat jenis peran: admin, personel, keluarga/Persit, dan petugas jaga sementara.
4. Personel login dengan NRP dan PIN.
5. Keluarga login dengan identitas akun unik dan PIN serta terhubung ke NRP personel.
6. Admin login dengan NRP khusus tujuh digit dan PIN.
7. Rencana izin dibuat sebelum keluar dan otomatis disetujui setelah validasi.
8. QR Code statis dipasang di pos.
9. Pengguna memindai QR melalui smartphone sendiri.
10. Tidak diperlukan akun operator pos untuk scan QR.
11. Scan pertama memulai sesi keluar dan GPS.
12. Scan berikutnya yang sah mengakhiri sesi keluar dan GPS.
13. Admin dapat memantau GPS pengguna yang sedang di luar.
14. Pengguna biasa hanya dapat melihat data pribadinya.
15. Tamu nonpersonel dan nonkeluarga wajib dicatat.
16. Data kendaraan dicatat apabila tamu membawa kendaraan.
17. Dokumentasi identitas tamu disimpan secara privat.
18. Admin dapat memberikan tugas jaga sementara melalui undangan.
19. Masa tugas petugas jaga dibatasi waktu dan dicabut otomatis.
20. Petugas jaga hanya memiliki akses pencatatan tamu.
21. Laporan penjagaan dibuat otomatis.
22. Semua operasi penting harus memiliki validasi backend dan audit log.
23. Keamanan, privasi, dan integritas database merupakan persyaratan wajib.

---

PENETAPAN DOKUMEN

Dokumen ini ditetapkan sebagai SPESIFIKASI LENGKAP FINAL BASELINE GATEOPS VERSI 1.0.

Seluruh desain, database, backend, frontend, pengujian, dan deployment harus mengacu pada dokumen ini.

Tidak dibuat arsitektur alternatif. Penyempurnaan teknis diperbolehkan sepanjang tidak mengubah keputusan operasional utama tanpa persetujuan.

GATEOPS — Satu sistem terintegrasi untuk izin, pergerakan, pengawasan, dan penjagaan.
