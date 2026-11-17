# STYLE RULES

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

# NOTE
Currently, only humans are permitted to modify this file.