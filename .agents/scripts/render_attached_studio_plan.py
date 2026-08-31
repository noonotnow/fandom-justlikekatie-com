import fitz, sys
from pathlib import Path
src=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
doc=fitz.open(src)
print('pages', doc.page_count)
for i,page in enumerate(doc):
    pix=page.get_pixmap(matrix=fitz.Matrix(2,2), alpha=False)
    path=out/f'page-{i+1}.png'
    pix.save(path)
    print(path)
