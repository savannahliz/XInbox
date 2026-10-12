"""Translate the supplied static Figma JSX to native HTML and ordinary CSS.
No framework or Tailwind runtime is required. Original nodes and assets are retained.
"""
from pathlib import Path
import re, json, html
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root/'public/assets/manifest.json').read_text())
classes = set()
templates = {}
for path in sorted((root/'design').glob('source-*.jsx')):
    page = path.stem.removeprefix('source-')
    source = path.read_text()
    body = source.split('return (', 1)[1].rsplit(');', 1)[0].strip()
    body = body.replace('className=', 'class=')
    body = re.sub(r'src=\{(\w+)\}', lambda m: 'src="'+manifest[page][m[1]]+'"', body)
    body = re.sub(r'\{`([^`]+)`\}', lambda m:html.escape(m[1]), body)
    body = re.sub(r'<(div|p)([^<>]*?)/>', r'<\1\2></\1>', body)
    if re.search(r'\{[^}]+\}',body): raise ValueError('Untranslated JSX '+page)
    # JSX indentation is not visible whitespace in the original text nodes.
    body = re.sub(r'>\s+([^<]+?)\s+<',lambda m:'>'+m[1].strip()+'<',body)
    body = re.sub(r'>\s+<','><',body)
    templates[page]=body
    for attr in re.findall(r'class="([^"]+)"',body): classes.update(attr.split())

colors={'#090c0a':'var(--bg)','#0c110e':'var(--surface)','#8bcf3a':'var(--accent)','#ffd84a':'var(--secondary)','#e8f0e6':'var(--text)','#6e9bff':'var(--blue)','#859084':'var(--muted)','#465447':'var(--line)','#263128':'var(--border)','#496b34':'var(--dim)'}
fixed={'absolute':'position:absolute','relative':'position:relative','block':'display:block','flex':'display:flex','flex-col':'flex-direction:column','flex-wrap':'flex-wrap:wrap','flex-[1_0_0]':'flex:1 0 0','shrink-0':'flex-shrink:0','self-stretch':'align-self:stretch','content-stretch':'align-content:stretch','content-start':'align-content:flex-start','overflow-clip':'overflow:clip','overflow-hidden':'overflow:hidden','max-w-none':'max-width:none','min-h-px':'min-height:1px','min-w-px':'min-width:1px','min-w-full':'min-width:100%','pointer-events-none':'pointer-events:none','object-cover':'object-fit:cover','not-italic':'font-style:normal','uppercase':'text-transform:uppercase','text-ellipsis':'text-overflow:ellipsis','text-right':'text-align:right','whitespace-nowrap':'white-space:nowrap','whitespace-pre':'white-space:pre','inset-0':'inset:0','gap-px':'gap:1px','h-px':'height:1px','w-px':'width:1px','h-full':'height:100%','w-full':'width:100%','size-full':'width:100%;height:100%','border':'border-width:0;outline:1px solid var(--stroke,var(--line));outline-offset:-1px','border-r':'border-width:0;box-shadow:inset -1px 0 0 var(--stroke,var(--line))','border-l-3':'border-width:0;box-shadow:inset 3px 0 0 var(--stroke,var(--line))','border-solid':'border-style:solid','border-dashed':'outline-style:dashed','font-bold':'font-weight:700','font-extrabold':'font-weight:800','font-medium':'font-weight:500','font-normal':'font-weight:400','[word-break:break-word]':'overflow-wrap:break-word','opacity-55':'opacity:.55','opacity-65':'opacity:.65'}
for pos in ['start','center','end','baseline']:
    fixed['items-'+pos]='align-items:'+({'start':'flex-start','end':'flex-end'}.get(pos,pos))
for pos in ['center','end','between']:
    fixed['justify-'+pos]='justify-content:'+({'end':'flex-end','between':'space-between'}.get(pos,pos))
def translate(c):
    if c in fixed:return fixed[c]
    m=re.fullmatch(r'(bg|border|text)-\[(#[0-9a-f]+)\]',c)
    if m:return ({'bg':'background-color','border':'--stroke','text':'color'}[m[1]]+':'+colors.get(m[2],m[2]))
    m=re.fullmatch(r"font-\['([^:]+):([^']+)'\]",c)
    if m:return 'font-family:"'+m[1].replace('_',' ')+'";font-weight:'+{'Regular':'400','Medium':'500','Bold':'700','ExtraBold':'800'}[m[2]]
    m=re.fullmatch(r'(w|h|size|min-h|gap|leading|text|rounded|top|left|right|bottom|p|px|py|pt|pb|pl|pr)-\[([^\]]+)\]',c)
    if m:
        prop,val=m.groups()
        if prop=='size':return 'width:'+val+';height:'+val
        if prop in ['px','py']:return ('padding-left:'+val+';padding-right:'+val) if prop=='px' else ('padding-top:'+val+';padding-bottom:'+val)
        if prop=='text':val='calc('+val+' * var(--font-scale,1))'
        return {'w':'width','h':'height','min-h':'min-height','gap':'gap','leading':'line-height','text':'font-size','rounded':'border-radius','p':'padding','pt':'padding-top','pb':'padding-bottom','pl':'padding-left','pr':'padding-right','top':'top','left':'left','right':'right','bottom':'bottom'}[prop]+':'+val
    m=re.fullmatch(r'shadow-\[(.+)\]',c)
    if m:return 'box-shadow:'+m[1].replace('_',' ')
    raise ValueError('Untranslated style: '+c)
def selector(c):return '.'+re.sub(r'([^a-zA-Z0-9_-])',lambda m:'\\'+m[1],c)
css='''/* Generated from the six supplied Figma nodes by design/build-reference.py. */
@font-face{font-family:'JetBrains Mono';src:url('/assets/jetbrains-mono.ttf') format('truetype');font-weight:100 800;font-display:swap}
@font-face{font-family:'Noto Sans SC';src:url('/assets/noto-sans-sc.ttf') format('truetype');font-weight:100 900;font-display:swap}
@font-face{font-family:'Inter';src:url('/assets/inter.ttf') format('truetype');font-weight:100 900;font-display:swap}
:root{--bg:#090c0a;--surface:#0c110e;--accent:#8bcf3a;--secondary:#ffd84a;--text:#e8f0e6;--blue:#6e9bff;--muted:#859084;--line:#465447;--border:#263128;--dim:#496b34;--mono:'JetBrains Mono',monospace}
*{box-sizing:border-box;border-width:0;border-style:solid;border-color:var(--border)}
html,body,p,h1,h2,h3{margin:0}body{background:var(--bg);color:var(--text);font-family:'Noto Sans SC',sans-serif}
button,input,select,textarea{font:inherit;color:inherit}button{background:transparent;text-align:inherit;padding:0;cursor:pointer}a{color:inherit;text-decoration:none}input{min-width:0}button:disabled{opacity:.45;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible{outline:1px solid var(--blue);outline-offset:3px}img{display:block}[hidden]{display:none!important}
.shell{display:flex;align-items:stretch;min-width:1440px;min-height:100vh;height:1170px}.shell:has(#content[data-view="home"]){height:1570px}.shell:has(#content[data-view="detail"]){height:1280px}
#sidebar{height:100%;flex-shrink:0}#workspace{flex:1 0 0;min-width:1px}#content{display:contents}
'''
css += '\n'.join(selector(c)+'{'+translate(c)+'}' for c in sorted(classes))+'\n'
# Figma's normal line height: Noto Sans SC 1.2 and JetBrains Mono 1.3.
# Explicit source leading values always take precedence.
css += '''[class*="Noto_Sans_SC"]{line-height:1.2}[class*="JetBrains_Mono"]{line-height:1.3}[class*="Inter:"]{line-height:1.2}
'''
# Source nodes with explicit line heights, including inheritance from wrappers.
for c in sorted(classes):
    if c.startswith('leading-['):css += selector(c)+'{'+translate(c)+'}\n'
# Match Figma's measured normal line boxes; explicit multiline leading is kept.
text_bounds = {}
for path in (root/'design').glob('metadata-*.xml'):
    try:
        for n in ET.fromstring(path.read_text()).iter('text'):
            text_bounds[n.get('id')] = float(n.get('height'))
    except ET.ParseError: pass
for template in templates.values():
    for match in re.finditer(r'<p([^>]+)>',template):
        attrs=match[1]
        node=re.search(r'data-node-id="([^"]+)"',attrs)
        if not node or node[1] not in text_bounds:continue
        leading=re.search(r'leading-\[([^\]]+)\]',attrs)
        h=text_bounds[node[1]]
        if (not leading or leading[1]=='normal') and h<65:
            css += '[data-node-id="'+node[1]+'"]{line-height:calc('+str(h)+'px * var(--font-scale,1))}\n'
css += (root/'design/interaction.css').read_text() if (root/'design/interaction.css').exists() else ''
(root/'public/style.css').write_text(css)
(root/'public/assets/figma-templates.json').write_text(json.dumps(templates,ensure_ascii=False))
print(f'Translated {len(templates)} pages and {len(classes)} source styles.')
