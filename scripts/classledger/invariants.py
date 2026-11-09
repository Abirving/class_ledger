from pathlib import Path
r=Path(__file__).resolve().parents[2];sqlite=[];pg=[]
def check(name,table,expr):
 sqlite.append(f"CREATE TRIGGER {name} BEFORE INSERT ON {table} WHEN NOT ({expr}) BEGIN SELECT RAISE(ABORT,'{name}'); END;")
 pg.append(f"CREATE FUNCTION {name}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT ({expr}) THEN RAISE EXCEPTION '{name}'; END IF; RETURN NEW; END; $$;\nCREATE TRIGGER {name} BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION {name}_fn();")
check('score_scope','score',"EXISTS(SELECT 1 FROM enrollment e JOIN section s ON s.id=e.section_id JOIN term t ON t.id=NEW.term_id JOIN offering o ON o.id=NEW.offering_id WHERE e.id=NEW.enrollment_id AND e.year_id=t.year_id AND s.grade_id=o.grade_id AND NEW.value<=o.maximum)")
check('assignment_scope','assignment',"EXISTS(SELECT 1 FROM section s JOIN offering o ON o.grade_id=s.grade_id WHERE s.id=NEW.section_id AND o.id=NEW.offering_id)")
for table,condition in [('result_run',"OLD.status='APPROVED'"),('student_result',"EXISTS(SELECT 1 FROM result_run r WHERE r.id=OLD.run_id AND r.status='APPROVED')"),('result_mark',"EXISTS(SELECT 1 FROM student_result s JOIN result_run r ON r.id=s.run_id WHERE s.id=OLD.student_result_id AND r.status='APPROVED')"),('report_template',"OLD.status='APPROVED'"),('audit_event','1=1'),('exception_resolution','1=1')]:
 for op in ['UPDATE','DELETE']:
  name=table+'_'+op.lower()+'_immutable';sqlite.append(f"CREATE TRIGGER {name} BEFORE {op} ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT,'immutable_record'); END;")
  pg.append(f"CREATE FUNCTION {name}_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF {condition} THEN RAISE EXCEPTION 'immutable_record'; END IF; RETURN {'OLD' if op=='DELETE' else 'NEW'}; END; $$;\nCREATE TRIGGER {name} BEFORE {op} ON {table} FOR EACH ROW EXECUTE FUNCTION {name}_fn();")
(r/'drizzle/0001_invariants.sql').write_text('\n'.join(sqlite))
d=r/'prisma/migrations/202611050002_invariants';d.mkdir(exist_ok=True);(d/'migration.sql').write_text('\n'.join(pg))
