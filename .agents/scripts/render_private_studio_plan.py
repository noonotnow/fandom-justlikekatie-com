import fitz
from pathlib import Path

pdf = Path("attached_assets/Private_Studio_Plan___Fandom_Vibes_1788302032177.pdf")
out = Path(".agents/outputs/private-studio-plan")
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
print(f"pages={len(doc)}")
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    path = out / f"page-{index + 1}.png"
    pix.save(path)
    print(path)