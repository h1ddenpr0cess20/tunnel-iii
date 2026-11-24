#!/usr/bin/env python3
"""Build the ROM: assets with Python, code with ca65/ld65, then the header checksum."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
sys.path.insert(0, here)
os.chdir(root)
os.makedirs('build', exist_ok=True)

import build_bg
import build_tables

build_bg.build('build')
build_bg.palettes('build')
build_tables.build('build')
for extra in ('build_sprites', 'build_audio', 'build_text'):
    if os.path.exists(os.path.join(here, extra + '.py')):
        __import__(extra).build('build')

run = lambda *a: subprocess.run(a, check=True)
run('ca65', '-g', '-I', 'src', '-I', '.', '-o', 'build/main.o', 'src/main.s')
run('ld65', '-C', 'snes.cfg', '-m', 'build/map.txt', '-Ln', 'build/labels.txt', '-o', 'build/tunnel3.sfc', 'build/main.o')

rom = bytearray(open('build/tunnel3.sfc', 'rb').read())
assert len(rom) == 0x20000, len(rom)
rom[0x7FDC:0x7FE0] = b'\xff\xff\x00\x00'
s = sum(rom) & 0xFFFF
rom[0x7FDE:0x7FE0] = s.to_bytes(2, 'little')
rom[0x7FDC:0x7FDE] = (s ^ 0xFFFF).to_bytes(2, 'little')
open('build/tunnel3.sfc', 'wb').write(rom)
print(f'tunnel3.sfc: {len(rom)} bytes, checksum {s:04X}')
