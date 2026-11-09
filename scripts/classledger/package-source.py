from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import hashlib,json
root=Path(__file__).resolve().parents[2]
out=root/'outputs'/'ClassLedger_Source.zip';out.parent.mkdir(exist_ok=True)
exclude={'node_modules','.git','.next','dist','.wrangler','.sites-runtime','.vinext','outputs','private-storage','examples'}
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=8) as z:
 for p in sorted(root.rglob('*')):
  if not p.is_file() or any(part in exclude for part in p.relative_to(root).parts):continue
  rel=p.relative_to(root)
  if p.name.startswith('.env') and p.name!='.env.example':continue
  if p.name in {'tsconfig.tsbuildinfo','NotoSansEthiopic-variable.ttf'} or p.suffix in {'.log','.tar','.gz'}:continue
  if str(rel)=='.openai/hosting.json':z.writestr('ClassLedger/.openai/hosting.json',json.dumps({'d1':'DB','r2':'BUCKET'}));continue
  z.write(p,'ClassLedger/'+str(rel))
with ZipFile(out) as z:
 assert z.testzip() is None
 for required in ['README.md','IMPLEMENTATION_STATUS.md','package.json','pnpm-lock.yaml','.env.example','prisma/schema.prisma','docker-compose.yml','lib/server/api.ts']:
  assert 'ClassLedger/'+required in z.namelist(),required
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
