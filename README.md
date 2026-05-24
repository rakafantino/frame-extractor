# Frame Extractor

Web app kecil untuk extract banyak frame dari video menjadi gambar. Semua proses berjalan lokal di browser memakai elemen video dan canvas.

## Menjalankan

```bash
python3 -m http.server 5173
```

Lalu buka:

```text
http://127.0.0.1:5173
```

## Fitur

- Upload atau drag-and-drop video.
- Set rentang ekstraksi dengan start dan end dalam detik.
- Set FPS ekstraksi. Contoh: 30 fps selama 10 detik menghasilkan 300 frame.
- Output JPG, PNG, atau WebP.
- Quality slider untuk JPG dan WebP.
- Download per frame atau semua frame sebagai ZIP.
- Nama file berurutan, misalnya `frame_001.jpg`, `frame_002.jpg`.
- Estimasi jumlah frame sebelum proses dimulai.

## Constraint

- Maksimal 1.000 frame per ekstraksi agar browser tidak kehabisan memori.
- Akurasi seek mengikuti kemampuan browser dan codec video. Untuk kebanyakan MP4/WebM hasilnya cukup baik, tetapi codec tertentu bisa seek ke frame terdekat.
- Video tidak di-upload ke server.
