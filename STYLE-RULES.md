# STYLE RULES

Berlaku untuk web utama, Drivemu, dan muAI, serta web baru di Kancamu Project.
muOS memakai visualnya sendiri dan ArtCraft adalah aplikasi dari pihak lain, jadi keduanya tidak terikat aturan visual di sini.

## id-ID

### HTML

#### 1. Container
Yang umumnya pakai header, main, footer, dan lainnya, sekarang pakai elemen div.
Kalau membungkus lebih dari satu elemen, maka wajib pakai display flex atau grid.

#### 2. Elemen Teks
Yang umumnya pakai elemen p, sekarang pakai elemen span.

#### 3. Gambar
Yang umumnya pakai elemen img, sekarang pakai elemen div dengan CSS background yang mengarah ke gambar.

#### 4. Tombol
jangan <button>Button</button>, tetapi <button><span>Button</span></button>.
Teks tetap berada di dalam elemen untuk teks.
Berguna untuk menambahkan elemen untuk icon di dalam button.

#### 5. File
Setiap web minimal punya tiga file: index.html, layout.css, dan script.js.
Jangan menaruh CSS atau JavaScript langsung di dalam HTML.
Kalau namanya beda, samakan.

### CSS

#### 1. Satuan
Yang umumnya pakai satuan px sekarang pakai satuan rem.
Pemakaian satuan rem menggunakan kelipatan 0.2rem, seperti 0.2rem, 0.4rem, 0.6rem, dan lainnya.
Tapi boleh memakai 1px, 2px, dan 0.1rem.
Jangan gunakan em.
1rem = 16px.

#### 2. Height
Tentukan height elemen, kecuali elemen untuk teks dan elemen yang tingginya bisa berubah.
Elemen button, input, dan lainnya, defaultnya 2.4rem.
Elemen yang heightnya sudah ditentukan, maka padding hanya boleh x, yaitu kanan dan kiri, y alias atas dan bawah tidak perlu.

#### 3. Variable
Buat variable yang bisa dipakai oleh lebih dari satu elemen, maka penamaannya harus universal.

#### 4. Jarak
Memberi jarak pakai padding dan gap, jangan pakai margin.

#### 5. Pembagian File
assets/style.css dipakai bersama oleh semua web. Isinya font, warna, tema, reset, dan dasar input dan select.
layout.css milik tiap web hanya berisi tata letak dan komponen web itu sendiri.
Urutan memuatnya: assets/style.css dulu, baru layout.css.
Yang sudah ada di assets/style.css jangan ditulis ulang di layout.css.

#### 6. Warna
Ada tujuh warna di assets/style.css, dinamai dengan nama warnanya dalam bahasa Inggris.
Hitam (tidak benar-benar hitam, asal gelap), abu-abu, dan putih untuk latar dan garis.
Merah, kuning (yang agak oren), biru, dan hijau untuk sorotan.
Warna lain diturunkan dari tujuh warna itu dengan color-mix, jangan menulis kode hex baru.
Komponen memakai nama peran (bg, fg, border, danger, dan lainnya), yang berganti mengikuti tema gelap dan terang.
Warna dari pihak lain, seperti warna asli sebuah aplikasi, boleh dipakai apa adanya.

#### 7. Tema
Tema gelap adalah bawaan, terang lewat data-theme="light" pada html.
Pilihan tema disimpan di localStorage dengan kunci "theme" dan dibaca oleh assets/theme.js, supaya semua web sama.

### OTHER

#### 1. Struktur
/favicon.png - icon web, biarkan dari saya.
/assets - berisi aset yang dipakai bersama.
/assets/style.css - gaya bersama.
/assets/theme.js - menerapkan tema tersimpan sebelum halaman tampil.
/assets/icons - berisi semua icon svg untuk GUI, jangan pakai Emoji.
/assets/fonts - berisi kumpulan font.
Setiap web punya foldernya sendiri di root, berisi index.html, layout.css, dan script.js.

#### 2. Icon
Semua icon ada di /assets/icons dan dipakai bersama, jadi tidak ada folder icon di tiap web.
Penamaannya universal (close, plus, trash), bukan nama khusus web.
Kalau ada icon yang sama tapi beda visual, pilih satu yang paling bagus dan cocok dipakai bersama.
Icon dipakai sebagai CSS mask dan warnanya memakai currentColor.

#### 3. Font
Semua web memakai font dari /assets/fonts. Jangan memuat font dari luar dan jangan menyimpan font di folder web.

#### 4. Penamaan Folder
Folder yang berisi banyak file sejenis memakai bentuk jamak, seperti assets, fonts, dan icons.

# NOTE
Currently, only humans are permitted to modify this file.
