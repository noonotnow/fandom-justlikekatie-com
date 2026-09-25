import fitz
from pathlib import Path
src=Path('attached_assets/Transactions_–_Just_Like_Katie_–_Stripe_1789913927904.pdf')
out=Path('.agents/outputs/stripe-transactions')
out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(src)
for i,page in enumerate(doc):
    pix=page.get_pixmap(matrix=fitz.Matrix(2,2), alpha=False)
    pix.save(out/f'page-{i+1}.png')
    (out/f'page-{i+1}.txt').write_text(page.get_text(),encoding='utf-8')
print(f'rendered {len(doc)} pages')
