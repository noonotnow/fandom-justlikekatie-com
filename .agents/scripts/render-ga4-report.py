from pathlib import Path

import fitz


pdf_path = Path("attached_assets/Analytics_1788213294246.pdf")
output_dir = Path(".agents/outputs/ga4-report")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")
for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{page_number}.png"
    pixmap.save(output_path)
    print(f"rendered={output_path} size={pixmap.width}x{pixmap.height}")
    print(f"--- page {page_number} text ---")
    print(page.get_text())