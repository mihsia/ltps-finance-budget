#!/usr/bin/env python3
"""
Regenerates src/assets/fonts/NotoSansTC-{Regular,Bold}-subset.js — the
Chinese-capable font jsPDF embeds so exported PDFs render 中文 correctly
(jsPDF's built-in fonts only cover Latin, which is why PDF exports used to
come out as mojibake).

Rebuild this whenever new fixed Chinese UI/report text is added and a
character might be missing from the subset (a missing glyph renders as a
blank box in the PDF, nothing worse — but best to keep it current).

Requires (dev-time only; not needed to build or run the app):
    pip install fonttools brotli
    npm install --save-dev @fontsource/noto-sans-tc   (source glyph data)

Usage:
    python3 scripts/build-pdf-font.py
"""
import base64
import glob
import os
import re

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import decompress

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_DIR = os.path.join(ROOT, 'node_modules', '@fontsource', 'noto-sans-tc')
OUT_DIR = os.path.join(ROOT, 'src', 'assets', 'fonts')
TMP_DIR = os.path.join(ROOT, '.pdf-font-build-tmp')

SOURCE_GLOBS = [
    'src/**/*.js', 'src/**/*.jsx',
    'functions/**/*.js', 'functions/**/*.cjs',
    'scripts/**/*.js', 'scripts/**/*.cjs',
]
# Codepoint ranges scanned for: CJK Unified Ideographs (+ Ext-A), CJK
# punctuation, and fullwidth forms. Free-text data entered by users later
# (item names, notes, etc.) is only covered if its characters happen to
# already appear somewhere in the source or in EXTRA_TERMS_PATH below —
# anything outside that renders as a blank glyph in PDF exports, not
# corrupted text elsewhere.
CJK_RANGES = [(0x4E00, 0x9FFF), (0x3400, 0x4DBF), (0x3000, 0x303F), (0xFF00, 0xFFEF)]
EXTRA_TERMS_PATH = os.path.join(ROOT, 'scripts', 'pdf-font-extra-terms.txt')
EXTRA_SYMBOLS = '▼▲－–—…•·、。，．：；？！（）「」『』〈〉《》【】〔〕％‰＄／＼＋－×÷＝＜＞'


def in_cjk_ranges(cp):
    return any(lo <= cp <= hi for lo, hi in CJK_RANGES)


def collect_needed_chars():
    chars = set()
    for pattern in SOURCE_GLOBS:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if 'node_modules' in path or '.test.' in path:
                continue
            with open(path, encoding='utf-8') as f:
                text = f.read()
            for ch in text:
                if in_cjk_ranges(ord(ch)):
                    chars.add(ch)
    with open(EXTRA_TERMS_PATH, encoding='utf-8') as f:
        for ch in f.read():
            if in_cjk_ranges(ord(ch)):
                chars.add(ch)
    chars |= set(chr(c) for c in range(0x20, 0x7F))  # ASCII
    chars |= set(EXTRA_SYMBOLS)
    return chars


def parse_css_faces(css_text):
    faces = []
    for block in css_text.split('@font-face')[1:]:
        weight_m = re.search(r'font-weight:\s*(\d+)', block)
        file_m = re.search(r"url\(\./files/([\w.-]+\.woff2)\)", block)
        range_m = re.search(r'unicode-range:\s*([^;]+);', block)
        if not (weight_m and file_m and range_m):
            continue
        ranges = []
        for part in range_m.group(1).split(','):
            part = part.strip().replace('U+', '')
            if '-' in part:
                a, b = part.split('-')
                ranges.append((int(a, 16), int(b, 16)))
            else:
                ranges.append((int(part, 16), int(part, 16)))
        faces.append({'weight': int(weight_m.group(1)), 'file': file_m.group(1), 'ranges': ranges})
    return faces


def range_intersects(ranges, cps):
    return any(lo <= cp <= hi for lo, hi in ranges for cp in cps)


def build_weight(weight, needed_cps, out_ttf_path):
    css_path = os.path.join(PKG_DIR, f'{weight}.css')
    faces = parse_css_faces(open(css_path, encoding='utf-8').read())
    relevant = [f for f in faces if range_intersects(f['ranges'], needed_cps)]
    print(f'  weight {weight}: {len(relevant)} of {len(faces)} chunk files relevant')

    tmp_dir = os.path.join(TMP_DIR, str(weight))
    os.makedirs(tmp_dir, exist_ok=True)
    subset_paths = []
    for i, face in enumerate(relevant):
        woff2_path = os.path.join(PKG_DIR, 'files', face['file'])
        ttf_path = os.path.join(tmp_dir, f'{i}.ttf')
        decompress(woff2_path, ttf_path)
        chunk_cps = {cp for lo, hi in face['ranges'] for cp in needed_cps if lo <= cp <= hi}
        if not chunk_cps:
            continue
        options = subset.Options()
        options.glyph_names = False
        options.layout_features = ['*']
        options.name_IDs = ['*']
        options.notdef_outline = True
        options.recommended_glyphs = True
        subsetter = subset.Subsetter(options=options)
        font = TTFont(ttf_path)
        subsetter.populate(unicodes=chunk_cps)
        subsetter.subset(font)
        subset_path = os.path.join(tmp_dir, f'{i}.subset.ttf')
        font.save(subset_path)
        subset_paths.append(subset_path)

    if not subset_paths:
        raise SystemExit(f'No chunk files matched the needed characters for weight {weight}.')
    merged = Merger().merge(subset_paths)
    merged.save(out_ttf_path)
    print(f'  -> {os.path.getsize(out_ttf_path) / 1024:.1f} KB merged TTF')


def write_js_asset(weight_label, ttf_path, js_path):
    with open(ttf_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(
            '// Auto-generated by scripts/build-pdf-font.py — do not hand-edit.\n'
            f'// Subset of Noto Sans TC ({weight_label}) covering this app\'s fixed\n'
            '// UI/report strings plus ASCII. Rerun that script after adding new\n'
            '// fixed Chinese text (see its docstring).\n'
            f"export default '{b64}';\n"
        )
    print(f'  wrote {js_path} ({len(b64)} base64 chars)')


def main():
    if not os.path.isdir(PKG_DIR):
        raise SystemExit(
            'Missing node_modules/@fontsource/noto-sans-tc — run '
            '`npm install --save-dev @fontsource/noto-sans-tc` first.'
        )
    os.makedirs(OUT_DIR, exist_ok=True)
    needed_chars = collect_needed_chars()
    needed_cps = {ord(c) for c in needed_chars}
    print(f'{len(needed_cps)} needed codepoints')

    for weight, label, out_name in [(400, 'Regular', 'NotoSansTC-Regular-subset'), (700, 'Bold', 'NotoSansTC-Bold-subset')]:
        print(f'Building {label} ({weight})...')
        ttf_path = os.path.join(TMP_DIR, f'{out_name}.ttf')
        build_weight(weight, needed_cps, ttf_path)
        write_js_asset(label, ttf_path, os.path.join(OUT_DIR, f'{out_name}.js'))


if __name__ == '__main__':
    main()
