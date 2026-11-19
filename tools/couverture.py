"""Génère la couverture SVG d'un cours aux couleurs de la charte.

    python tools/couverture.py <slug> "<surtitre>" "<ligne 1>" "<ligne 2>" "<sous-titre 1>" ["<sous-titre 2>"]
"""
import sys
from pathlib import Path
from xml.sax.saxutils import escape

slug, kicker, line1, line2, sub1, *rest = sys.argv[1:]
sub2 = rest[0] if rest else ""
e = lambda s: escape(s, {"'": "&#39;"})
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" font-family="Plus Jakarta Sans, Inter, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A2540"/><stop offset="1" stop-color="#0D3466"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0066FF"/><stop offset="1" stop-color="#00C9A7"/></linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <g stroke="#00C9A7" stroke-width="2" fill="none" opacity="0.35">
    <path d="M760 160 L900 250 L1040 170 M900 250 L900 420 L760 500 M900 420 L1040 500 M760 160 L760 330 L900 420 M1040 170 L1040 330 L900 420"/>
  </g>
  <g fill="#00C9A7"><circle cx="760" cy="160" r="12"/><circle cx="1040" cy="170" r="12"/><circle cx="760" cy="500" r="12"/><circle cx="1040" cy="500" r="12"/><circle cx="760" cy="330" r="9"/><circle cx="1040" cy="330" r="9"/></g>
  <circle cx="900" cy="250" r="22" fill="#0066FF"/><circle cx="900" cy="420" r="22" fill="#0066FF"/>
  <text x="80" y="200" fill="#00C9A7" font-size="26" font-weight="600" letter-spacing="4">{e(kicker.upper())}</text>
  <text x="80" y="290" fill="#FFFFFF" font-size="64" font-weight="700">{e(line1)}</text>
  <text x="80" y="365" fill="#FFFFFF" font-size="64" font-weight="700">{e(line2)}</text>
  <rect x="80" y="400" width="140" height="6" rx="3" fill="url(#ac)"/>
  <text x="80" y="465" fill="#C9D6E8" font-size="30">{e(sub1)}</text>
  <text x="80" y="508" fill="#C9D6E8" font-size="30">{e(sub2)}</text>
</svg>
'''
out = Path(__file__).resolve().parents[1] / "contenu" / "cours" / slug / "images" / "couverture.svg"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(svg, encoding="utf-8")
print(out)
