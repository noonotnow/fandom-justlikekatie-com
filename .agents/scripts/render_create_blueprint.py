from pathlib import Path
import fitz

pdf = Path('attached_assets/CREATE_–_Multi-User_SaaS_Expansion_Technical_Blueprint.docx_1788045651202.pdf')
out = Path('.agents/outputs/create-blueprint-pages')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
print(f'pages={doc.page_count}')
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    image_path = out / f'page-{index + 1}.png'
    pix.save(image_path)
    text = page.get_text('text').strip().replace('\x00', '')
    print(f'--- PAGE {index + 1} ---')
    print(text[:12000])
