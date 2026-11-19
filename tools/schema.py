"""Dessine un schéma SVG aux couleurs de la charte.

    python tools/schema.py <slug> <fichier.svg> etapes "Titre" "Étape|détail" "Étape|détail" ...
    python tools/schema.py <slug> <fichier.svg> colonnes "Titre" "Colonne:élément;élément;élément" ...
"""
import sys
from pathlib import Path
from xml.sax.saxutils import escape

H = 'font-family="Plus Jakarta Sans, Inter, Arial, sans-serif"'
COLORS = ["#0066FF", "#0A2540", "#00C9A7", "#5B6B82", "#0066FF", "#00C9A7"]


def wrap(text, width):
    lines, current = [], ""
    for word in text.split():
        if len(current) + len(word) + 1 > width and current:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    return lines + [current] if current else lines


def etapes(title, items):
    n = len(items)
    w = 1000
    box = (w - 60 - (n - 1) * 30) / n
    chars = max(12, int(box / 9))
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 300" font-family="Inter, Arial, sans-serif">',
           f'<rect width="{w}" height="300" fill="#F8FAFC"/>',
           f'<text x="30" y="45" {H} font-size="22" font-weight="700" fill="#0A2540">{escape(title)}</text>']
    for i, item in enumerate(items):
        head, _, detail = item.partition("|")
        x = 30 + i * (box + 30)
        color = "#00C9A7" if i == n - 1 else "#0066FF"
        out.append(f'<rect x="{x:.0f}" y="75" width="{box:.0f}" height="190" rx="14" fill="#FFFFFF" stroke="{color}" stroke-width="2"/>')
        out.append(f'<circle cx="{x + 32:.0f}" cy="108" r="17" fill="{color}"/><text x="{x + 32:.0f}" y="114" text-anchor="middle" fill="#fff" font-weight="700" font-size="16">{i + 1}</text>')
        for j, line in enumerate(wrap(head, max(10, int(box / 11)))[:2]):
            out.append(f'<text x="{x + 18:.0f}" y="{155 + j * 24}" {H} font-size="18" font-weight="700" fill="#0A2540">{escape(line)}</text>')
        for j, line in enumerate(wrap(detail, chars)[:4]):
            out.append(f'<text x="{x + 18:.0f}" y="{208 + j * 19}" font-size="13.5" fill="#4A5568">{escape(line)}</text>')
        if i < n - 1:
            ax = x + box + 4
            out.append(f'<path d="M{ax:.0f} 170 h20 m-7 -6 l7 6 l-7 6" stroke="#0066FF" stroke-width="2.5" fill="none"/>')
    out.append("</svg>")
    return "\n".join(out)


def colonnes(title, items):
    n = len(items)
    w = 1000
    box = (w - 60 - (n - 1) * 25) / n
    rows = max(len(i.partition(":")[2].split(";")) for i in items)
    h = 150 + rows * 46
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h + 20}" font-family="Inter, Arial, sans-serif">',
           f'<rect width="{w}" height="{h + 20}" fill="#F8FAFC"/>',
           f'<text x="30" y="45" {H} font-size="22" font-weight="700" fill="#0A2540">{escape(title)}</text>']
    for i, item in enumerate(items):
        head, _, rest = item.partition(":")
        x = 30 + i * (box + 25)
        color = COLORS[i % len(COLORS)]
        out.append(f'<rect x="{x:.0f}" y="70" width="{box:.0f}" height="{h - 70}" rx="14" fill="#FFFFFF" stroke="#E2E8F0"/><rect x="{x:.0f}" y="70" width="{box:.0f}" height="7" rx="3" fill="{color}"/>')
        out.append(f'<text x="{x + 20:.0f}" y="112" {H} font-size="18" font-weight="700" fill="#0A2540">{escape(head)}</text>')
        for j, entry in enumerate(e.strip() for e in rest.split(";")):
            y = 150 + j * 46
            lines = wrap(entry, max(14, int(box / 9)))[:2]
            out.append(f'<circle cx="{x + 26:.0f}" cy="{y - 5}" r="5" fill="{color}"/>')
            for k, line in enumerate(lines):
                out.append(f'<text x="{x + 40:.0f}" y="{y + k * 18}" font-size="14.5" fill="#1A202C">{escape(line)}</text>')
    out.append("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    slug, name, kind, title, *items = sys.argv[1:]
    svg = {"etapes": etapes, "colonnes": colonnes}[kind](title, items)
    path = Path(__file__).resolve().parents[1] / "contenu" / "cours" / slug / "images" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")
    print(path.name)
