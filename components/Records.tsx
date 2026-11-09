"use client";
import { useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Pencil,
  Users,
  ClipboardList,
  BookOpen,
} from "lucide-react";
import {
  api,
  useData,
  useAction,
  Header,
  Panel,
  Badge,
  Notice,
  Loading,
  Empty,
  Button,
  Field,
  Modal,
  SearchBox,
  DateLabel,
  Context,
} from "./ui";
const manage = (c: Context) =>
  c.actor.roles.some((r: string) => ["SYSTEM_ADMIN", "REGISTRAR"].includes(r));
export function SectionSelect({
  c,
  value,
  onChange,
  all = true,
}: {
  c: Context;
  value: string;
  onChange: (s: string) => void;
  all?: boolean;
}) {
  return (
    <select
      aria-label="Section"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && <option value="">All sections</option>}
      {c.lookup.sections.map((s: any) => (
        <option key={s.id} value={s.id}>
          Grade {s.grade} · Section {s.label}
        </option>
      ))}
    </select>
  );
}
export function Students({ c }: { c: Context }) {
  const [q, setQ] = useState(""),
    [section, setSection] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<any>(null),
    [importing, setImporting] = useState(false);
  const data = useData(
    `students?term=${c.term}&section=${section}&page=${page}&q=${encodeURIComponent(q)}`,
  );
  return (
    <>
      <Header
        title="Student roster"
        description="One official student record. Accurate matching across every teacher upload."
        action={
          manage(c) && (
            <div className="row">
              <button className="secondary" onClick={() => setImporting(true)}>
                <Upload size={16} />
                Import roster
              </button>
              <button onClick={() => setEdit({})}>
                <Plus size={16} />
                Add student
              </button>
            </div>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <SectionSelect
          c={c}
          value={section}
          onChange={(v) => {
            setSection(v);
            setPage(1);
          }}
        />
      </div>
      {data.error && <Notice>{data.error}</Notice>}
      <Panel>
        {!data.data ? (
          <Loading />
        ) : !data.data.items.length ? (
          <Empty
            title="No students found"
            detail="Add a student or import your school roster to begin."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>STUDENT ID</th>
                    <th>GRADE / SECTION</th>
                    <th>STATUS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.items.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <div className="table-name">
                          <div className="avatar">
                            {s.full_name.slice(0, 2)}
                          </div>
                          <strong>{s.full_name}</strong>
                        </div>
                      </td>
                      <td className="mono">{s.code}</td>
                      <td>
                        Grade {s.grade} · {s.section}
                      </td>
                      <td>
                        <Badge value={s.active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td>
                        {manage(c) && (
                          <button
                            className="text-button"
                            onClick={() => setEdit(s)}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {data.data.total} students · Page {page}
              </span>
              <div>
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="secondary"
                  disabled={page * 25 >= data.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
      {edit && (
        <StudentForm
          c={c}
          student={edit}
          close={() => setEdit(null)}
          done={() => {
            setEdit(null);
            data.reload();
          }}
        />
      )}
      {importing && (
        <RosterImport
          c={c}
          close={() => setImporting(false)}
          done={() => {
            setImporting(false);
            data.reload();
          }}
        />
      )}
    </>
  );
}
function StudentForm({
  c,
  student,
  close,
  done,
}: {
  c: Context;
  student: any;
  close: () => void;
  done: () => void;
}) {
  const [p, setP] = useState({
      code: student.code || "",
      full_name: student.full_name || "",
      section_id: student.section_id || c.lookup.sections[0]?.id,
      year_id: c.lookup.terms.find((t: any) => t.id === c.term).year_id,
      active: student.active === undefined ? true : !!student.active,
      reason: "",
    }),
    a = useAction(done);
  const change = (k: string, v: any) => setP({ ...p, [k]: v });
  return (
    <Modal title={student.id ? "Edit student" : "Add student"} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() =>
            api(
              "students" + (student.id ? "/" + student.id : ""),
              student.id ? "PATCH" : "POST",
              p,
            ),
          );
        }}
      >
        {a.error && <Notice>{a.error}</Notice>}
        <Field
          label="Student ID"
          hint="Preserve any leading zeroes. This is the official matching key."
        >
          <input
            required
            value={p.code}
            onChange={(e) => change("code", e.target.value)}
          />
        </Field>
        <Field label="Full name">
          <input
            required
            value={p.full_name}
            onChange={(e) => change("full_name", e.target.value)}
          />
        </Field>
        <Field label="Grade and section">
          <SectionSelect
            c={c}
            all={false}
            value={p.section_id}
            onChange={(v) => change("section_id", v)}
          />
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => change("active", e.target.checked)}
          />
          Active student
        </label>
        {student.id && (
          <Field label="Reason for correction">
            <textarea
              required
              minLength={8}
              value={p.reason}
              onChange={(e) => change("reason", e.target.value)}
            />
          </Field>
        )}
        <div className="form-actions">
          <button className="secondary" type="button" onClick={close}>
            Cancel
          </button>
          <Button busy={a.busy} type="submit">
            Save student
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function RosterImport({
  c,
  close,
  done,
}: {
  c: Context;
  close: () => void;
  done: () => void;
}) {
  const [section, setSection] = useState(c.lookup.sections[0]?.id || ""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<any>(null),
    a = useAction();
  return (
    <Modal title="Import student roster" onClose={close} wide>
      <p>
        Use Excel or Word with Student ID and Full Name columns. Existing
        students must be edited individually.
      </p>
      {a.error && <Notice>{a.error}</Notice>}
      {!preview ? (
        <>
          <Field label="Destination section">
            <SectionSelect
              c={c}
              all={false}
              value={section}
              onChange={setSection}
            />
          </Field>
          <Field label="Roster file">
            <input
              type="file"
              accept=".xlsx,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
          <button
            disabled={!file || a.busy}
            onClick={() =>
              a.run(async () => {
                const f = new FormData();
                f.append("file", file!);
                f.append("section", section);
                f.append(
                  "year",
                  c.lookup.terms.find((t: any) => t.id === c.term).year_id,
                );
                setPreview(await api("roster-import", "POST", f));
              })
            }
          >
            Validate roster
          </button>
        </>
      ) : (
        <>
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table>
              <thead>
                <tr>
                  <th>ROW</th>
                  <th>STUDENT ID</th>
                  <th>FULL NAME</th>
                  <th>VALIDATION</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>{r.errors.join("; ") || "Valid"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={() => setPreview(null)}>
              Choose another file
            </button>
            <Button
              busy={a.busy}
              disabled={preview.rows.some((r: any) => r.errors.length)}
              onClick={() =>
                a.run(async () => {
                  await api("roster-import/" + preview.id + "/commit", "POST");
                  done();
                })
              }
            >
              Import {preview.rows.length} students
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function Assignments({ c }: { c: Context }) {
  const d = useData("assignments?term=" + c.term),
    [create, setCreate] = useState(false);
  return (
    <>
      <Header
        title="Teaching assignments"
        description="The right teacher, subject, and class. Each assignment has its own upload template."
        action={
          manage(c) && (
            <button onClick={() => setCreate(true)}>
              <Plus size={16} />
              Assign teacher
            </button>
          )
        }
      />
      <Panel>
        {!d.data ? (
          <Loading />
        ) : !d.data.length ? (
          <Empty
            title="No assignments yet"
            detail="Assign a teacher to a grade, section, subject and term."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SUBJECT</th>
                  <th>CLASS</th>
                  <th>TEACHER</th>
                  <th>MAXIMUM</th>
                  <th>SUBMISSION</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {d.data.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.subject}</strong>
                    </td>
                    <td>
                      Grade {a.grade}
                      {a.section}
                    </td>
                    <td>{a.teacher}</td>
                    <td>{a.maximum}</td>
                    <td>
                      <Badge value={a.submissions ? "COMMITTED" : "PENDING"} />
                    </td>
                    <td>
                      <div className="row">
                        <a
                          className="inline-link"
                          href={"/api/assignments/" + a.id + "/template"}
                        >
                          Template <Download size={12} />
                        </a>
                        {c.actor.roles.some((r: string) =>
                          ["SYSTEM_ADMIN", "TEACHER"].includes(r),
                        ) && (
                          <a
                            className="button secondary"
                            href={
                              "/upload?term=" + c.term + "&assignment=" + a.id
                            }
                          >
                            Upload marks
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {d.error && <Notice>{d.error}</Notice>}
      {create && (
        <AssignmentForm
          c={c}
          close={() => setCreate(false)}
          done={() => {
            setCreate(false);
            d.reload();
          }}
        />
      )}
    </>
  );
}
function AssignmentForm({
  c,
  close,
  done,
}: {
  c: Context;
  close: () => void;
  done: () => void;
}) {
  const [teacher, setTeacher] = useState(""),
    [section, setSection] = useState(c.lookup.sections[0]?.id || ""),
    [offering, setOffering] = useState(""),
    a = useAction(done),
    grade = c.lookup.sections.find((s: any) => s.id === section)?.grade_id;
  return (
    <Modal title="Assign a teacher" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() =>
            api("assignments", "POST", {
              teacher_id: teacher,
              section_id: section,
              offering_id: offering,
              term_id: c.term,
            }),
          );
        }}
      >
        {a.error && <Notice>{a.error}</Notice>}
        <Field label="Teacher">
          <select
            required
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">Choose teacher</option>
            {c.lookup.teachers
              .filter((t: any) => t.roles.includes("TEACHER"))
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Class">
          <SectionSelect
            c={c}
            all={false}
            value={section}
            onChange={(v) => {
              setSection(v);
              setOffering("");
            }}
          />
        </Field>
        <Field label="Subject offering">
          <select
            required
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
          >
            <option value="">Choose subject</option>
            {c.lookup.offerings
              .filter((o: any) => o.grade_id === grade)
              .map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name} · maximum {o.maximum}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-actions">
          <Button busy={a.busy} type="submit">
            Create assignment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Subjects({ c }: { c: Context }) {
  const [kind, setKind] = useState("");
  return (
    <>
      <Header
        title="Subjects & curriculum"
        description="Define subject maxima and weights for consistent, comparable results."
        action={
          manage(c) && (
            <div className="row">
              <button className="secondary" onClick={() => setKind("subject")}>
                <Plus size={16} />
                New subject
              </button>
              <button onClick={() => setKind("offering")}>
                <Plus size={16} />
                Add to grade
              </button>
            </div>
          )
        }
      />
      <Notice kind="info">
        The average uses each score as a percentage of its subject maximum,
        multiplied by the configured weight.
      </Notice>
      <Panel title="Grade subject offerings">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SUBJECT</th>
                <th>GRADE</th>
                <th>MAXIMUM SCORE</th>
                <th>WEIGHT</th>
                <th>REQUIRED</th>
              </tr>
            </thead>
            <tbody>
              {c.lookup.offerings.map((o: any) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.name}</strong>
                  </td>
                  <td>Grade {o.grade}</td>
                  <td>{o.maximum}</td>
                  <td>{o.weight}</td>
                  <td>
                    <Badge value={o.required ? "REQUIRED" : "OPTIONAL"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {kind && (
        <SetupForm
          c={c}
          kind={kind}
          close={() => setKind("")}
          done={() => {
            setKind("");
            c.refresh();
          }}
        />
      )}
    </>
  );
}
export function SetupForm({
  c,
  kind,
  close,
  done,
}: {
  c: Context;
  kind: string;
  close: () => void;
  done: () => void;
}) {
  const [p, setP] = useState<any>({
      kind,
      label: "",
      code: "",
      year_id: c.lookup.years[0]?.id,
      grade_id: c.lookup.grades[0]?.id,
      subject_id: c.lookup.subjects[0]?.id,
      maximum: "100",
      weight: "1",
    }),
    a = useAction(done);
  const set = (k: string, v: string) => setP({ ...p, [k]: v });
  return (
    <Modal title={"Add " + kind} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() =>
            api(
              "setup-items",
              "POST",
              Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "")),
            ),
          );
        }}
      >
        {a.error && <Notice>{a.error}</Notice>}
        {kind !== "offering" && (
          <Field label={kind === "subject" ? "Subject name" : "Label"}>
            <input
              required
              value={p.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>
        )}
        {kind === "subject" && (
          <Field label="Subject code">
            <input
              required
              value={p.code}
              onChange={(e) => set("code", e.target.value)}
            />
          </Field>
        )}
        {kind === "term" && (
          <Field label="Academic year">
            <select
              value={p.year_id}
              onChange={(e) => set("year_id", e.target.value)}
            >
              {c.lookup.years.map((y: any) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {["section", "offering"].includes(kind) && (
          <Field label="Grade">
            <select
              value={p.grade_id}
              onChange={(e) => set("grade_id", e.target.value)}
            >
              {c.lookup.grades.map((g: any) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "offering" && (
          <>
            <Field label="Subject">
              <select
                value={p.subject_id}
                onChange={(e) => set("subject_id", e.target.value)}
              >
                {c.lookup.subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Maximum score">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={p.maximum}
                  onChange={(e) => set("maximum", e.target.value)}
                />
              </Field>
              <Field label="Weight">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={p.weight}
                  onChange={(e) => set("weight", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <div className="form-actions">
          <Button busy={a.busy}>Save {kind}</Button>
        </div>
      </form>
    </Modal>
  );
}
export function SchoolSettings({ c }: { c: Context }) {
  const [p, setP] = useState({
      name: c.school.name,
      timezone: c.school.timezone,
      address: c.school.address,
      selfApproval: !!c.school.settings.selfApproval,
      gradeRankRequired: !!c.school.settings.gradeRankRequired,
    }),
    [kind, setKind] = useState(""),
    a = useAction(c.refresh);
  const set = (k: string, v: any) => setP({ ...p, [k]: v });
  return (
    <>
      <Header
        title="School settings"
        description="School identity, academic structure, and approval policies."
      />
      <div className="grid-2">
        <Panel title="School profile">
          <form
            className="panel-body"
            onSubmit={(e) => {
              e.preventDefault();
              a.run(() => api("settings", "PUT", p));
            }}
          >
            {a.error && <Notice>{a.error}</Notice>}
            {a.success && <Notice kind="success">{a.success}</Notice>}
            <Field label="School name">
              <input
                required
                value={p.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Time zone">
              <input
                required
                value={p.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              />
            </Field>
            <Field label="Address">
              <textarea
                value={p.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.selfApproval}
                onChange={(e) => set("selfApproval", e.target.checked)}
              />
              Allow an authorized approver to approve their own calculated run
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.gradeRankRequired}
                onChange={(e) => set("gradeRankRequired", e.target.checked)}
              />
              Require final grade-wide ranks before report export
            </label>
            <Notice kind="warning">
              Changing school settings makes current unexported results stale.
              Calculate and approve a new revision afterward.
            </Notice>
            <div className="form-actions">
              <Button busy={a.busy}>Save settings</Button>
            </div>
          </form>
        </Panel>
        <div>
          {[
            ["year", "Academic years", c.lookup.years],
            ["term", "Terms", c.lookup.terms],
            ["grade", "Grades", c.lookup.grades],
            ["section", "Sections", c.lookup.sections],
          ].map(([type, title, items]: any) => (
            <Panel
              key={type}
              title={title}
              action={
                <button className="text-button" onClick={() => setKind(type)}>
                  <Plus size={14} />
                  Add
                </button>
              }
            >
              <div className="panel-body">
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {items.map((i: any) => (
                    <Badge
                      key={i.id}
                      value={
                        i.grade ? "Grade " + i.grade + " · " + i.label : i.label
                      }
                    />
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>
      {kind && (
        <SetupForm
          c={c}
          kind={kind}
          close={() => setKind("")}
          done={() => {
            setKind("");
            c.refresh();
          }}
        />
      )}
    </>
  );
}
export function UserManagement({ c }: { c: Context }) {
  const d = useData("users"),
    [edit, setEdit] = useState<any>(null);
  return (
    <>
      <Header
        title="People & roles"
        description="Give each colleague the access they need, with a traceable approval process."
        action={
          <button onClick={() => setEdit({})}>
            <Plus size={16} />
            Add colleague
          </button>
        }
      />
      {d.error && <Notice>{d.error}</Notice>}
      <Panel>
        {!d.data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>COLLEAGUE</th>
                  <th>USERNAME</th>
                  <th>ROLES</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td>{u.username}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "wrap" }}>
                        {u.roles.map((r: string) => (
                          <Badge key={r} value={r} />
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge value={u.active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEdit(u)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit && (
        <UserForm
          user={edit}
          close={() => setEdit(null)}
          done={() => {
            setEdit(null);
            d.reload();
            c.refresh();
          }}
        />
      )}
    </>
  );
}
function UserForm({
  user,
  close,
  done,
}: {
  user: any;
  close: () => void;
  done: () => void;
}) {
  const [p, setP] = useState<any>({
      name: user.name || "",
      username: user.username || "",
      roles: user.roles || ["TEACHER"],
      active: user.active === undefined ? true : !!user.active,
      password: "",
    }),
    a = useAction(done);
  return (
    <Modal title={user.id ? "Edit colleague" : "Add colleague"} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(() =>
            api(
              "users" + (user.id ? "/" + user.id : ""),
              user.id ? "PATCH" : "POST",
              { ...p, password: p.password || undefined },
            ),
          );
        }}
      >
        {a.error && <Notice>{a.error}</Notice>}
        <Field label="Full name">
          <input
            required
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
          />
        </Field>
        <Field label="Username" hint="Used to sign in. Letters, numbers and dots.">
          <input
            required
            value={p.username}
            onChange={(e) => setP({ ...p, username: e.target.value })}
          />
        </Field>
        <Field
          label="Initial or replacement password"
          hint="Set a password of at least 12 characters, or leave blank to keep the current one."
        >
          <input
            type="password"
            minLength={12}
            value={p.password}
            autoComplete="new-password"
            onChange={(e) => setP({ ...p, password: e.target.value })}
          />
        </Field>
        {["SYSTEM_ADMIN", "REGISTRAR", "TEACHER", "APPROVER"].map((r) => (
          <label className="checkbox" key={r}>
            <input
              type="checkbox"
              checked={p.roles.includes(r)}
              onChange={(e) =>
                setP({
                  ...p,
                  roles: e.target.checked
                    ? [...p.roles, r]
                    : p.roles.filter((x: string) => x !== r),
                })
              }
            />
            {r.replaceAll("_", " ")}
          </label>
        ))}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => setP({ ...p, active: e.target.checked })}
          />
          Account active
        </label>
        <div className="form-actions">
          <Button busy={a.busy}>Save colleague</Button>
        </div>
      </form>
    </Modal>
  );
}
export function AuditLog({ c }: { c: Context }) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    d = useData("audit?q=" + encodeURIComponent(q) + "&page=" + page);
  return (
    <>
      <Header
        title="Audit trail"
        description="An append-only record of academic decisions, changes, and downloads."
      />
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={(s) => {
            setQ(s);
            setPage(1);
          }}
          placeholder="Search actions or record IDs…"
        />
      </div>
      {d.error && <Notice>{d.error}</Notice>}
      <Panel>
        {!d.data ? (
          <Loading />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>ACTION</th>
                    <th>ACTOR</th>
                    <th>RECORD</th>
                    <th>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <DateLabel
                          value={a.created_at}
                          timezone={c.school.timezone}
                        />
                      </td>
                      <td>
                        <Badge value={a.action} />
                      </td>
                      <td>{a.actor}</td>
                      <td>
                        <div>{a.entity_type}</div>
                        <div className="subtext">
                          {a.entity_id.slice(0, 20)}
                        </div>
                      </td>
                      <td className="small">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>Page {page} · 50 events per page</span>
              <div>
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="secondary"
                  disabled={d.data.length < 50}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
