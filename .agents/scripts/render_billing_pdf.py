import fitz
from pathlib import Path
src = Path('attached_assets/Just_Like_Katie_sandbox_Billing_1788097495564.pdf')
out = Path('.agents/outputs/billing_pdf')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(src)
print('pages', doc.page_count)
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    path = out / f'page-{index+1}.png'
    pix.save(path)
    print(path)
    text = page.get_text('text')
    print(text[:3000])
