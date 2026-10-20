"""Reference screenshots for the UI kit: game interface screenshots from Interface In Game, as contact sheets.

    python3 tools/ui_refs/grab.py OUT_DIR [category ...]

Categories are the site's own (inventory, skill-tree, stats, character, map, quest, game-over, in-game, overlay,
progress, tutorial, settings, main-menu, loading, dialogue...). Each makes OUT_DIR/<category>.jpg, up to 12 labelled
screenshots in a 3-wide grid. Needs Pillow and curl. The pictures are for studying how other games lay a screen out;
they are not engine assets and are not committed.

Chromium in the cloud sandbox does not trust the sandbox's TLS inspection CA, so this fetches with curl (which does)
and draws nothing in a browser.
"""
import io, os, re, subprocess, sys
from PIL import Image, ImageDraw

DEFAULT = ["inventory", "skill-tree", "stats", "character", "map", "quest", "game-over", "in-game"]

def get(url):
    r = subprocess.run(["curl", "-sS", "-m", "25", "-A", "Mozilla/5.0", "-L", url], capture_output=True)
    return r.stdout if r.returncode == 0 else b""

def sheet(category, out_dir):
    html = get(f"https://interfaceingame.com/screenshots/?elements={category}").decode("utf8", "ignore")
    urls = []
    for u in re.findall(r"https://interfaceingame\.com/wp-content/uploads/[^\"' )]*?-500x281\.(?:jpg|png|webp)", html):
        if u not in urls and "favicon" not in u:
            urls.append(u)
    tiles = []
    for u in urls[:12]:
        full = re.sub(r"-500x281(\.\w+)$", r"\1", u)
        data = get(full) or get(u)
        try:
            im = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            continue
        im.thumbnail((640, 360))
        tiles.append((full.rsplit("/", 1)[1].rsplit(".", 1)[0], im))
    if not tiles:
        print(category, "no screenshots found")
        return
    cols, rows = 3, (len(tiles) + 2) // 3
    out = Image.new("RGB", (cols * 640, rows * 382), (16, 18, 22))
    draw = ImageDraw.Draw(out)
    for i, (name, im) in enumerate(tiles):
        x, y = (i % cols) * 640, (i // cols) * 382
        out.paste(im, (x, y))
        draw.text((x + 6, y + 362), name[:80], fill=(230, 230, 230))
    os.makedirs(out_dir, exist_ok=True)
    out.save(os.path.join(out_dir, f"{category}.jpg"), quality=78)
    print(category, len(tiles))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for c in sys.argv[2:] or DEFAULT:
        sheet(c, sys.argv[1])
