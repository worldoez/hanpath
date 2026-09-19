#!/usr/bin/env python3
"""Generate PWA icons (192/512) as PNGs with pure Python — no dependencies.
Draws a vermillion rounded square with a white 'flashcard' and a red seal dot."""
import struct, zlib, os, sys

def png_chunk(tag, data):
    out = struct.pack(">I", len(data)) + tag + data
    crc = 0xFFFFFFFF
    def crc32_update(crc, b):
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (0xEDB88320 & -(crc & 1))
        return crc
    for b in data:
        crc = crc32_update(crc, b)
    return out + struct.pack(">I", crc ^ 0xFFFFFFFF)

def make_icon(size, path):
    S = size
    R = int(S * 0.22)                      # corner radius
    px = bytearray()                       # RGBA rows

    vermillion = (179, 64, 42)
    cream = (246, 242, 236)
    seal = (246, 242, 236)

    # card geometry (inner white rounded rect)
    cx0, cy0 = int(S * 0.22), int(S * 0.26)
    cx1, cy1 = int(S * 0.78), int(S * 0.74)
    cr = int(S * 0.05)

    def in_rounded(x, y, x0, y0, x1, y1, r):
        if not (x0 <= x < x1 and y0 <= y < y1): return False
        dx = max(x0 + r - x, x - (x1 - 1 - r), 0)
        dy = max(y0 + r - y, y - (y1 - 1 - r), 0)
        return dx * dx + dy * dy <= r * r

    # two horizontal "strokes" inside the card, like a flashcard's text lines
    ly1 = int(S * 0.40); lh = max(2, int(S * 0.045))
    ly2 = int(S * 0.52)
    lx0 = int(S * 0.32); lx1a = int(S * 0.68); lx1b = int(S * 0.52)
    # small seal square bottom-right of card
    sx0, sy0 = int(S * 0.58), int(S * 0.58); ssz = int(S * 0.10)

    for y in range(S):
        px.append(0)  # filter byte
        for x in range(S):
            if in_rounded(x, y, 0, 0, S, S, R):
                if in_rounded(x, y, cx0, cy0, cx1, cy1, cr):
                    # inside white card
                    stroke = (lx0 <= x < lx1a and ly1 <= y < ly1 + lh) or \
                             (lx0 <= x < lx1b and ly2 <= y < ly2 + lh)
                    seal_sq = sx0 <= x < sx0 + ssz and sy0 <= y < sy0 + ssz
                    if seal_sq: c = vermillion
                    elif stroke: c = (210, 195, 180)
                    else: c = cream
                else: c = vermillion
                px += bytes(c)
            else:
                px += b"\x00\x00\x00\x00"

    ihdr = struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(bytes(px), 9)) + png_chunk(b"IEND", b"")
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, f"icon-{size}.png"), "wb") as f:
        f.write(data)
    print(f"icons/icon-{size}.png  {len(data)//1024} KB")

for s in (192, 512):
    make_icon(s, None)