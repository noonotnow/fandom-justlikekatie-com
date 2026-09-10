from pathlib import Path
import fitz

pdf_path = Path("attached_assets/0_Vibe_Atlas_—_System_Design_Document_(1)_1789058227489.pdf")
output_dir = Path(".agents/outputs/vibe-atlas-design-pages")
output_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
text_parts = []
print(f"pages={doc.page_count}")
print(f"metadata={doc.metadata}")

for index, page in enumerate(doc):
    text = page.get_text("text")
    text_parts.append(f"\n\n===== PAGE {index + 1} =====\n{text}")
    pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
    pix.save(output_dir / f"page-{index + 1:02d}.png")
    blocks = page.get_text("dict")["blocks"]
    image_blocks = sum(1 for block in blocks if block.get("type") == 1)
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    print(f"page={index + 1} images={image_blocks} first_line={first_line[:140]}")

Path(".agents/outputs/vibe-atlas-design-text.txt").write_text("".join(text_parts), encoding="utf-8")