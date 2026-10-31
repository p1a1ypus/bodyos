"""PNG-иконки для iOS (apple-touch-icon не понимает SVG) — как icons/icon.svg: лаймовая дуга на тёмном.
Без зависимостей: рисуем кольцо вручную, края сглаживаем суперсэмплингом 4×4."""
import math
import struct
import zlib
from pathlib import Path

BG = (0x12, 0x14, 0x12)
TRACK = (0x26, 0x2A, 0x25)
LIME = (0xC8, 0xF2, 0x5A)
ARC = 650 / 868  # доля окружности, как stroke-dasharray в SVG
SS = 4


def color_at(x, y, size):
    c = size / 2
    r, half = size * 138 / 512, size * 28 / 512
    dx, dy = x - c, y - c
    d = math.hypot(dx, dy)
    # угол от верхней точки по часовой стрелке, 0…1
    a = (math.atan2(dx, -dy) / (2 * math.pi)) % 1
    if abs(d - r) <= half:
        return LIME if a <= ARC else TRACK
    # скруглённые концы дуги
    for t in (0.0, ARC):
        ex, ey = c + r * math.sin(2 * math.pi * t), c - r * math.cos(2 * math.pi * t)
        if math.hypot(x - ex, y - ey) <= half:
            return LIME
    return BG


def png(size, path):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    col = color_at(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size)
                    for i in range(3):
                        acc[i] += col[i]
            row += bytes(round(v / SS / SS) for v in acc)
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', raw) + chunk(b'IEND', b''))


if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'icons'
    png(192, out / 'icon-192.png')
    png(512, out / 'icon-512.png')
    print('ok')
