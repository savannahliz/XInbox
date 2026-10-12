"""Verify downloaded source assets and every native template slot."""
from pathlib import Path
from html.parser import HTMLParser
import json,re,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'public/assets/manifest.json').read_text())
templates=json.loads((root/'public/assets/figma-templates.json').read_text())
report={}
for page,template in templates.items():
    references=re.findall(r'<img[^>]+src="([^"]+)"',template)
    assert 'figma.com/api/mcp/asset' not in template
    for src in references:
        p=root/'public'/src.removeprefix('/')
        assert p.is_file() and p.stat().st_size>0,src
        if p.suffix=='.svg':
            svg=ET.parse(p).getroot();assert svg.get('width') and svg.get('height'),src
    expected=set(manifest[page].values())
    assert expected==set(references),(page,expected-set(references))
    report[page]={'slots':len(references),'uniqueAssets':len(set(references)),'downloaded':True,'nativeSvgDimensions':True}
(root/'design/asset-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report))
