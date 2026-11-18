# Kancamu Project

Satu web berisi direktori dan semua web app serta tool buatan Kancamu Project. Halaman utama mendaftar semua project, bisa dicari, difilter, dan dibuka di tab di dalam halaman yang sama. Setiap project punya foldernya sendiri di root, jadi semuanya dilayani dari satu folder.

Murni HTML, CSS, dan JavaScript. Tanpa framework, tanpa build, tanpa server khusus.

## Isi

- Direktori project dalam tampilan grid atau daftar, dengan pencarian, filter kategori dan publisher, serta urutan A-Z atau Z-A.
- Tab: project dibuka di dalam halaman, dan bisa disalin tautannya atau dibuka di jendela baru.
- Filter tersimpan di URL, jadi hasil penyaringan bisa dibagikan.
- Tema terang dan gelap, dengan pilihan tema dan bahasa yang diingat browser.
- Tiga bahasa: English, 简体中文, dan العربية (kanan ke kiri).

## Project

| Project | Fungsi | Lokasi |
|---|---|---|
| muOS | Desktop lengkap yang berjalan di browser | `muos/` |
| Drivemu | Penyimpanan file yang menyimpan data di repo GitHub milik pengguna | `drivemu/` |
| muAI | Model AI yang berjalan langsung di browser | `muai/` |
| ArtCraft | Tujuh aplikasi kreatif dan produktivitas: DeckCraft, EffectCraft, FilmCraft, GridCraft, PhotoCraft, VectorCraft, WordCraft | `artcraft/<nama>/` |

Direktori juga memuat TraceDraw, editor vektor open source dari publisher lain. TraceDraw adalah situs luar, jadi hanya ditautkan.

## Struktur folder

```
index.html       Kerangka halaman
layout.css       Tata letak dan gaya khusus halaman ini
script.js        Logika: render daftar, filter, tab, bahasa, tema
data.json        Semua data: project, kategori, bahasa, dan teks antarmuka
assets/          Aset bersama
  theme.js       Menerapkan tema tersimpan sebelum halaman tampil, agar tidak berkedip
  style.css      Gaya bersama (font, token warna, reset, input dan select), dipakai semua web kecuali muOS
  fonts/         Inter dan JetBrains Mono (woff2), dipakai semua project
  icons/         Semua ikon SVG web utama, Drivemu, dan muAI (48 ikon, nama universal)
favicon.png      Ikon situs
STYLE-RULES.md   Aturan gaya project
artcraft/        Tujuh aplikasi ArtCraft
drivemu/         Penyimpanan file berbasis GitHub
muai/            AI di browser
muos/            Desktop di browser
CNAME            Domain kancamu.site untuk GitHub Pages
```

Setiap project adalah folder biasa dengan `index.html` sendiri. Tautannya di `data.json` berupa path relatif.

Gaya dibagi dua. `assets/style.css` dimuat semua web kecuali muOS dan berisi font, token warna dan tema, reset, serta dasar `input` dan `select`. Setiap web lalu memuat `layout.css` miliknya sendiri (`layout.css`, `drivemu/layout.css`, `muai/layout.css`) untuk tata letak dan komponen khusus. Urutan pemuatan: `assets/style.css` dulu, baru `layout.css`.

Warna ada dua lapis di `assets/style.css`. Lapis pertama adalah palet tujuh warna yang dinamai dengan nama warnanya: `--black`, `--gray`, `--white` untuk latar dan garis, serta `--red`, `--yellow`, `--blue`, `--green` untuk sorotan. Lapis kedua adalah peran (`--bg`, `--bg-1`, `--border`, `--fg`, `--danger`, `--ok`, ...) yang diturunkan dari palet dengan `color-mix` dan berganti antara tema gelap dan terang. Komponen memakai nama peran, atau nama warna untuk warna yang memang tetap.

Warna sorotan tiap project di `data.json` (`"color"`) memakai nama palet, misalnya `"blue"`, untuk project buatan sendiri. Project dari pihak lain (ArtCraft, TraceDraw) boleh memakai warna aslinya dalam hex, misalnya `"#a78bfa"`.

Setiap web punya tiga file dasar: `index.html`, `layout.css`, dan `script.js`. Di web utama, Drivemu, dan muAI, ketiganya ada di folder masing-masing. `assets/theme.js` dimuat paling awal oleh ketiga web itu dan dipakai bersama.

Ikon ada di satu tempat, `assets/icons/`, dan dipakai sebagai CSS mask sehingga warnanya mengikuti teks. Nama file bersifat universal (`close`, `plus`, `trash`), bukan nama khusus project. Hanya muOS yang punya ikon sendiri.

## Menjalankan

Tidak ada yang perlu di-build. Layani folder ini dengan web server statis apa saja, lalu buka di browser.

```powershell
npx serve .
```

Membuka `index.html` langsung dari disk tidak akan berfungsi, karena `data.json` dimuat lewat `fetch`.

## Menambah project

Semua isi daftar ada di `data.json`. Tambahkan satu objek ke `projects`:

```json
{
  "id": "contoh",
  "name": { "en-US": "Contoh" },
  "description": {
    "en-US": "Deskripsi singkat.",
    "zh-CN": "简短描述。",
    "ar-SA": "وصف قصير."
  },
  "highlight": { "en-US": "co" },
  "publisher": "Kancamu Project",
  "url": "contoh/",
  "icon": "contoh/favicon.png",
  "categories": ["tools"]
}
```

- `id` bersifat unik dan dipakai di URL.
- `name` dan `description` ditulis per bahasa. Bahasa yang kosong memakai `en-US`.
- `highlight` adalah potongan nama yang ditebalkan di kartu, misalnya `mu` pada "muOS".
- `categories` harus memakai kunci yang ada di `categories` pada `data.json`: `ai`, `tools`, `productivity`, `system`, `office`, `design`, `video`, `creative`, `directory`, `storage`.
- Teks antarmuka dan nama kategori baru juga ditulis untuk ketiga bahasa.

## Hosting

Situs ini statis dan bisa dilayani oleh web server statis apa saja, di root domain maupun di sub-path, karena semua tautan bersifat relatif. Layani seluruh folder.

## Aturan

Aturan gaya HTML dan CSS ada di [STYLE-RULES.md](STYLE-RULES.md). File itu hanya boleh diubah oleh manusia.
