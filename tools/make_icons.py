"""Временные PNG-иконки для iOS (apple-touch-icon не понимает SVG). Без зависимостей: рисуем кольцо вручную."""
import struct
import zlib
from pathlib import Path

GREEN = (0x2F, 0x6F, 0x4F)
WHITE = (0xFF, 0xFF, 0xFF)


def png(size, path):
    c = size / 2
    r_out, r_in, r_dot = size * 0.2695, size * 0.1992, size * 0.0703
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            d = ((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2) ** 0.5
            row += bytes(WHITE if (r_in <= d <= r_out or d <= r_dot) else GREEN)
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
