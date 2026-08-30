from pathlib import Path

import fitz


source = Path("attached_assets/Sitemaps_1788118339610.pdf")
output_dir = Path(".agents/outputs/search-console-sitemap")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
    destination = output_dir / f"page-{page_number}.png"
    pixmap.save(destination)
    print(destination)