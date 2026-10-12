from pathlib import Path
import re, json, subprocess
from concurrent.futures import ThreadPoolExecutor
root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'assets'
out.mkdir(exist_ok=True)
assets = {}
for source in sorted((root / 'design').glob('source-*.jsx')):
    page = source.stem.removeprefix('source-')
    assets[page] = {}
    for name, url in re.findall(r'const (\w+) = "(https://www.figma.com/api/mcp/asset/[^"]+)";', source.read_text()):
        filename = url.rsplit('/', 1)[1]
        assets[page][name] = {'url': url, 'path': '/assets/' + filename}
jobs = {a['url']: a['path'] for page in assets.values() for a in page.values()}
def download(job):
    url, path = job
    target = out / path.rsplit('/', 1)[1]
    if target.exists() and target.stat().st_size: return
    subprocess.run(['curl', '-fsSL', '--retry', '2', '--retry-all-errors', '--max-time', '30', url, '-o', str(target)], check=True)
    if not target.stat().st_size: raise RuntimeError('empty asset')
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, jobs.items()))
mapping = {page: {name: a['path'] for name, a in entries.items()} for page, entries in assets.items()}
(out / 'manifest.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2))
print('Downloaded', len(jobs), 'Figma assets')
