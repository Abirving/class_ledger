from pathlib import Path
import sqlite3,json
root=Path(__file__).resolve().parents[2]
sql=(root/'drizzle/0000_classledger.sql').read_text()
(root/'prisma/migrations/202611050001_initial/migration.sql').write_text(sql)
con=sqlite3.connect(':memory:');con.executescript(sql)
tables=[r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
models=['generator client {\n provider = "prisma-client-js"\n}\ndatasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}']
backs={t:[] for t in tables}; edges=[]
for t in tables:
 for fk in con.execute('PRAGMA foreign_key_list('+t+')'):
  target,local,remote=fk[2:5];name=t+'_'+local;backs[target].append(f'  {name}_back {t}[] @relation("{name}")');edges.append((t,target,local,name))
for t in tables:
 lines=['model '+t+' {']
 cols=list(con.execute('PRAGMA table_info('+t+')'))
 for _,name,typ,nn,default,pk in cols:
  ptyp={'TEXT':'String','INTEGER':'Int','NUMERIC':'Decimal'}[typ];nullable='' if nn or pk else '?';attr=' @id' if pk else ''
  if typ=='NUMERIC':attr+=' @db.Decimal(20, 6)'
  lines.append(f'  {name} {ptyp}{nullable}{attr}')
 for source,target,col,name in edges:
  if source==t:
   nullable='' if next(c[3] for c in cols if c[1]==col) else '?'
   lines.append(f'  {col}_ref {target}{nullable} @relation("{name}", fields: [{col}], references: [id])')
 lines+=backs[t];lines+=['}'];models.append('\n'.join(lines))
(root/'prisma/schema.prisma').write_text('\n\n'.join(models)+'\n')
(root/'drizzle/meta/_journal.json').write_text(json.dumps({'version':'7','dialect':'sqlite','entries':[{'idx':0,'version':'6','when':1793870000000,'tag':'0000_classledger','breakpoints':True},{'idx':1,'version':'6','when':1793871000000,'tag':'0001_invariants','breakpoints':True}]}))
(root/'docs/er-diagram.md').write_text('# Database relationships\n\n```mermaid\nerDiagram\n'+'\n'.join(f'    {target} ||--o{{ {source} : "{col}"' for source,target,col,name in edges)+'\n```\n\nPartial unique indexes, score bounds and immutable approved snapshots are enforced in SQL migrations. Decimal values use PostgreSQL NUMERIC(implementation unconstrained precision); Prisma models use Decimal.\n')
