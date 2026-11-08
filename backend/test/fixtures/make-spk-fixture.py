"""Membuat spk-contoh.pdf: PDF SPK NETRAL (data karangan) dengan tata letak yang sama dengan template FM/05-03.
Dipakai sebagai fixture uji parser (web/spkpdf.js). Jalankan ulang bila perlu:  python make-spk-fixture.py
Butuh: pip install pymupdf"""
import os
import pymupdf

W, H = 612, 792
E = [32.4, 55.0, 217.3, 335.6, 391.5, 413.8, 488.7, 578.9]   # tepi kolom (sama dengan template)
FS = 7.0
doc = pymupdf.open()
font = pymupdf.Font("helv")
bold = pymupdf.Font("hebo")

HEAD = {"PROJECT": "PROYEK CONTOH", "OWNER": "PT OWNER CONTOH", "SPK": "007", "MANDOR": "MANDOR CONTOH", "PEKERJAAN": "SIPIL - GEDUNG A"}

# (no, deskripsi, spesifikasi, vol, sat, harga, jumlah)  — vol/harga/jumlah None = baris judul/kelompok
ROWS = [
    [("1", "PEKERJAAN TANAH", "", None), ("", "- Galian tanah biasa", "Galian manual, include pembuangan ke titik kumpul", (120.00, "m3", 85000, 10200000)),
     ("", "Urugan pasir", "Urugan pasir urug, include pemadatan dan langsir material", (40.50, "m3", 150000, 6075000)),
     ("3", "PEKERJAAN BETON", "", None), ("a", "Struktur Lantai 1", "", None),
     ("", "Pile Cap ( 1000 x 1000 x 300 mm ) ; 2 Nos", "", None),
     ("", "- Concrete fc 25Mpa", "Beton fc 25 Mpa, proses menggunakan pompa dan talang, include perataan memakai jidar dan gosok manual", (2.00, "m3", 1200000, 2400000)),
     ("", "- Bekisting", "Bekisting, include bongkar pasang", (8.00, "m2", 65000, 520000)),
     ("", "- Rebar", "Besi tulangan, include fabrikasi dan pemasangan", (163.30, "kg", 2200, 359251)),
     ("", "- Dowel bar D16 with PVC Sleeve ( @1000 )", "Include dudukan dowel", (10.00, "m'", None, None))],
    [("5", "PEKERJAAN FINISHING", "", None), ("", "Lantai", "Finishing lantai", None),
     ("", "- Keramik 60x60 cm", "Keramik lantai homogen 60 x 60 cm, include nat", (48.00, "m2", 95000, 4560000)),
     ("", "- Cat dinding", "Pengecatan dinding dalam, include memperbaiki dinding yang tidak rata", (120.00, "m2", 13000, 1560000))],
]
TOTAL = sum(r[3][3] for page in ROWS for r in page if r[3] and r[3][3])


def wrap(text, width, f=font):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if f.text_length(t, FS) <= width - 6 or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def page_frame(pg, title=True):
    pg.draw_rect(pymupdf.Rect(E[0], 14.3, E[7], 65), color=0, width=0.8)
    pg.insert_text((250, 45), "SURAT PERINTAH KERJA (SPK)", fontsize=11, fontname="hebo")
    for i, (k, v) in enumerate(HEAD.items()):
        y = 105 + i * 9.5
        pg.insert_text((40, y), k, fontsize=6.5, fontname="hebo")
        pg.insert_text((117, y), "=", fontsize=6.5, fontname="hebo")
        pg.insert_text((137, y), v, fontsize=6.5, fontname="hebo")
    # judul kolom (sel berwarna, tanpa garis bawah terpisah, seperti PDF asli)
    top, bot = 133.6, 157.4
    pg.draw_rect(pymupdf.Rect(E[0], top, E[7], bot), color=0, fill=(0.45, 0.45, 0.45), width=0.6)
    labels = ["NO.", "DESKRIPSI PEKERJAAN", "Spesifikasi Teknis", "VOLUME", "SAT.", "HARGA SAT.", "JUMLAH"]
    for c, lb in enumerate(labels):
        cx = (E[c] + E[c + 1]) / 2
        tw = bold.text_length(lb, 7)
        pg.insert_text((cx - tw / 2, 147), lb, fontsize=7, fontname="hebo", color=(1, 1, 1))
    return bot


def draw_row(pg, y, cells):
    """cells: list 7 string; teks berpusat vertikal; garis border di bawah tiap kolom + garis vertikal."""
    lines = [wrap(cells[c], E[c + 1] - E[c]) if c in (1, 2) else [cells[c]] for c in range(7)]
    n = max(len(l) for l in lines)
    h = max(16.8, n * 8.4 + 6)
    for c in range(7):
        pg.draw_line((E[c], y + h), (E[c + 1] - 0.7, y + h), width=0.6)
        pg.draw_line((E[c], y), (E[c], y + h), width=0.6)
    pg.draw_line((E[7], y), (E[7], y + h), width=0.6)
    for c in range(7):
        ls = lines[c]
        y0 = y + h / 2 - len(ls) * 8.4 / 2 + 6.2
        for k, t in enumerate(ls):
            if not t:
                continue
            if c in (3, 4):
                x = (E[c] + E[c + 1]) / 2 - font.text_length(t, FS) / 2
            elif c in (5, 6):
                x = E[c + 1] - 4 - font.text_length(t, FS)
            elif c == 0:
                x = (E[0] + E[1]) / 2 - font.text_length(t, FS) / 2
            else:
                x = E[c] + 3
            pg.insert_text((x, y0 + k * 8.4), t, fontsize=FS, fontname="helv")
    return y + h


for pi, rows in enumerate(ROWS):
    pg = doc.new_page(width=W, height=H)
    y = page_frame(pg)
    for no, desc, spec, num in rows:
        if num:
            vol, sat, harga, jum = num
            cells = [no, desc, spec, f"{vol:.2f}", sat, f"{harga:,}" if harga else "-", ""]
            y = draw_row(pg, y, cells)
            # kolom Jumlah: "Rp" di kiri sel, angka rata kanan
            yy = y - (y - 0) * 0
            # (digambar ulang di tengah baris terakhir)
            mid = y - 8.4
            pg.insert_text((E[6] + 4, mid + 2.2), "Rp", fontsize=FS, fontname="helv")
            t = f"{jum:,}" if jum else "-"
            pg.insert_text((E[7] - 4 - font.text_length(t, FS), mid + 2.2), t, fontsize=FS, fontname="helv")
        else:
            y = draw_row(pg, y, [no, desc, spec, "", "", "", ""])
        if y > 700:
            raise SystemExit("baris melebihi halaman")
    if pi == len(ROWS) - 1:
        y = draw_row(pg, y, ["", "", "", "", "", "TOTAL", ""])
        pg.insert_text((E[6] + 4, y - 6), "Rp", fontsize=8, fontname="hebo")
        t = f"{TOTAL:,}"
        pg.insert_text((E[7] - 4 - bold.text_length(t, 8), y - 6), t, fontsize=8, fontname="hebo")
        yy = y + 30
        pg.insert_text((50, yy), "** KETERANGAN", fontsize=7, fontname="hebo")
        for k, t in enumerate(["** Mandor bertanggung jawab atas hasil pekerjaan.", "* Pembayaran Opname dibayarkan dua minggu satu kali sesuai progress actual volume lapangan",
                               "* Pengajuan Opname dipotong Retensi 5%", "* Retensi Potongan 5% dibayar setelah 3 Bulan Proyek Selesai"]):
            pg.insert_text((50, yy + 12 + k * 9), t, fontsize=6.5, fontname="helv")
        sy = yy + 80
        for lb, nm, cx in [("Project Manager", "NAMA PM", 100), ("Direktur", "NAMA DIREKTUR", 230), ("Mengetahui", "NAMA MENGETAHUI", 370), ("Mandor", "NAMA MANDOR", 500)]:
            pg.insert_text((cx - bold.text_length(lb, 7) / 2, sy), lb, fontsize=7, fontname="hebo")
            pg.insert_text((cx - bold.text_length(nm, 7) / 2, sy + 45), nm, fontsize=7, fontname="hebo")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spk-contoh.pdf")
doc.save(out)
print("dibuat", out, "TOTAL", TOTAL)
