"use client";
import { useState, useEffect } from "react";
import {
  UploadCloud,
  FileCheck2,
  Download,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ShieldCheck,
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
import { SectionSelect } from "./Records";
export function UploadWizard({ c }: { c: Context }) {
  const d = useData("assignments?term=" + c.term),
    [assignment, setAssignment] = useState(""),
    [step, setStep] = useState(1),
    [file, setFile] = useState<File | null>(null),
    [inspection, setInspection] = useState<any>(null),
    [mapping, setMapping] = useState<any>({}),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<any>(null),
    a = useAction();
  useEffect(() => {
    setAssignment(new URLSearchParams(location.search).get("assignment") || "");
  }, []);
  const selected = d.data?.find((x: any) => x.id === assignment);
  function form() {
    const f = new FormData();
    if (file) f.append("file", file);
    f.append("assignment", assignment);
    f.append("mapping", JSON.stringify(mapping));
    f.append("reason", reason);
    return f;
  }
  return (
    <>
      <Header
        title="Upload teacher marks"
        description="A guided check before any score enters the official academic record."
      />
      <div className="steps">
        {["Choose file", "Map columns", "Review validation", "Submit"].map(
          (s, i) => (
            <div
              className={"step " + (step === i + 1 ? "current" : "")}
              key={s}
            >
              <b>{i + 1}</b>
              {s}
            </div>
          ),
        )}
      </div>
      {a.error && <Notice>{a.error}</Notice>}
      {step === 1 && (
        <Panel
          title="Choose your class and mark sheet"
          description="Excel or Word · up to 5 MB · one table"
        >
          <div className="panel-body">
            <Field label="Teaching assignment">
              <select
                value={assignment}
                onChange={(e) => setAssignment(e.target.value)}
              >
                <option value="">Choose an assignment</option>
                {d.data?.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    Grade {x.grade}
                    {x.section} · {x.subject} · {x.teacher}
                  </option>
                ))}
              </select>
            </Field>
            {selected && (
              <div className="notice info">
                <span>
                  Maximum score: <strong>{selected.maximum}</strong>. Match
                  students by official Student ID.{" "}
                  <a href={"/api/assignments/" + assignment + "/template"}>
                    Download the class template →
                  </a>
                </span>
              </div>
            )}
            <div className="upload-zone">
              <UploadCloud size={36} />
              <h3>Select your completed mark sheet</h3>
              <p>
                Different row orders are welcome. Student IDs keep the records
                aligned.
              </p>
              <input
                aria-label="Teacher marks file"
                type="file"
                accept=".xlsx,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <Field
              label="Correction reason (if revising approved results)"
              hint="An administrator must review post-approval corrections. Earlier approved results stay unchanged."
            >
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the correction when applicable…"
              />
            </Field>
            <div className="form-actions">
              <Button
                busy={a.busy}
                disabled={!file || !assignment}
                onClick={() =>
                  a.run(async () => {
                    const i = await api("imports/inspect", "POST", form());
                    setInspection(i);
                    setMapping(i.mapping);
                    setStep(2);
                  })
                }
              >
                Continue to column mapping <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {step === 2 && inspection && (
        <Panel
          title="Match your columns"
          description={
            inspection.count +
            " rows detected. Confirm which columns contain each field."
          }
        >
          <div className="panel-body">
            <div className="grid-2">
              {Object.entries({
                code: "Student ID · required",
                name: "Student name",
                grade: "Grade",
                section: "Section",
                score: "Score · required",
                reason: "Missing-mark reason",
                remark: "Teacher remark",
              }).map(([key, label]) => (
                <Field label={label} key={key}>
                  <select
                    value={mapping[key] ?? -1}
                    onChange={(e) =>
                      setMapping({ ...mapping, [key]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>Not included</option>
                    {inspection.headers.map((h: string, i: number) => (
                      <option key={i} value={i}>
                        {h || "Column " + (i + 1)}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="form-actions">
              <button className="secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <Button
                busy={a.busy}
                disabled={mapping.code < 0 || mapping.score < 0}
                onClick={() =>
                  a.run(async () => {
                    const staged = await api("imports/stage", "POST", form());
                    setPreview(await api("imports/" + staged.id));
                    setStep(3);
                  })
                }
              >
                Validate marks
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {step === 3 && preview && (
        <>
          <Validation preview={preview} />
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() => {
                setStep(1);
                setFile(null);
              }}
            >
              Upload a corrected file
            </button>
            <Button
              busy={a.busy}
              disabled={
                preview.status === "INVALID" ||
                (preview.payload.requiresApproval &&
                  !c.actor.roles.includes("SYSTEM_ADMIN"))
              }
              onClick={() =>
                a.run(async () => {
                  await api("imports/" + preview.id + "/commit", "POST");
                  setStep(4);
                })
              }
            >
              {preview.status === "COMMITTED"
                ? "Submission already committed"
                : "Confirm & submit marks"}
            </Button>
          </div>
        </>
      )}
      {step === 4 && (
        <Panel>
          <Empty
            title="Your marks are submitted"
            detail="The official scores and missing-mark register now reflect this submission."
            action={
              <a className="button" href={"/submissions?term=" + c.term}>
                View submission history
              </a>
            }
          />
        </Panel>
      )}
    </>
  );
}
function Validation({ preview }: { preview: any }) {
  const count = preview.payload.counts || {};
  return (
    <>
      {preview.payload.requiresApproval && (
        <Notice kind="warning">
          This is a correction to approved results. An administrator must review
          and commit it.
        </Notice>
      )}
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          ["Rows in file", count.rows || preview.rows.length],
          ["Invalid rows", count.errors || 0],
          ["Missing marks", count.missing || 0],
        ].map(([s, n]) => (
          <div key={s} className="stat">
            <span className="stat-label">{s}</span>
            <div className="stat-value">{n}</div>
          </div>
        ))}
      </div>
      <Notice kind="info">
        Blank, “-” and N/A are missing scores. They are never treated as zero. A
        misconduct reason is a teacher report, not a proven finding.
      </Notice>
      <Panel
        title="Validation preview"
        action={
          <a
            className="inline-link"
            href={"/api/imports/" + preview.id + "/errors"}
          >
            <Download size={14} /> Download validation CSV
          </a>
        }
      >
        <div className="table-wrap" style={{ maxHeight: 480 }}>
          <table>
            <thead>
              <tr>
                <th>ROW</th>
                <th>STUDENT ID</th>
                <th>OFFICIAL NAME</th>
                <th>SCORE</th>
                <th>REASON</th>
                <th>VALIDATION</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.line_number}</td>
                  <td>{r.code}</td>
                  <td>{r.full_name}</td>
                  <td>
                    {r.value === null ? <Badge value="MISSING" /> : r.value}
                  </td>
                  <td>{r.reason || "—"}</td>
                  <td>
                    {r.errors.length ? (
                      <span style={{ color: "#b84b4b" }}>
                        {r.errors.join("; ")}
                      </span>
                    ) : r.warnings.length ? (
                      r.warnings.join("; ")
                    ) : (
                      <span style={{ color: "#167b67" }}>Valid</span>
                    )}
                  </td>
                </tr>
              ))}
              {preview.payload.omitted?.map((r: any) => (
                <tr key={r.enrollment_id}>
                  <td>—</td>
                  <td>{r.code}</td>
                  <td>{r.full_name}</td>
                  <td>
                    <Badge value="MISSING" />
                  </td>
                  <td>OMITTED ROW</td>
                  <td>Missing-mark exception will be created</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
export function Submissions({ c }: { c: Context }) {
  const d = useData("imports?term=" + c.term),
    [detail, setDetail] = useState<any>(null),
    [q, setQ] = useState(""),
    a = useAction();
  return (
    <>
      <Header
        title="Teacher submissions"
        description="Track every source file, validation result, and correction."
        action={
          c.actor.roles.some((r: string) =>
            ["SYSTEM_ADMIN", "TEACHER"].includes(r),
          ) && (
            <a className="button" href={"/upload?term=" + c.term}>
              <UploadCloud size={16} />
              Upload marks
            </a>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search teacher, subject, or filename…"
        />
      </div>
      {(d.error || a.error) && <Notice>{d.error || a.error}</Notice>}
      <Panel>
        {!d.data ? (
          <Loading />
        ) : !d.data.length ? (
          <Empty
            title="No submissions yet"
            detail="Teacher uploads will appear here with validation details."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SUBMISSION</th>
                  <th>CLASS</th>
                  <th>TEACHER</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data
                  .filter((b: any) =>
                    (b.filename + b.teacher + b.subject)
                      .toLowerCase()
                      .includes(q.toLowerCase()),
                  )
                  .map((b: any) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.subject}</strong>
                        <div className="subtext">{b.filename}</div>
                      </td>
                      <td>
                        Grade {b.grade}
                        {b.section}
                      </td>
                      <td>{b.teacher}</td>
                      <td>
                        <DateLabel
                          value={b.created_at}
                          timezone={c.school.timezone}
                        />
                      </td>
                      <td>
                        <Badge value={b.status} />
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() =>
                            a.run(async () =>
                              setDetail(await api("imports/" + b.id)),
                            )
                          }
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {detail && (
        <Modal title="Submission review" onClose={() => setDetail(null)} wide>
          <Validation preview={detail} />
          {a.error && <Notice>{a.error}</Notice>}
          {detail.status === "STAGED" &&
            c.actor.roles.some((r: string) =>
              ["SYSTEM_ADMIN", "TEACHER"].includes(r),
            ) && (
              <div className="form-actions">
                <Button
                  busy={a.busy}
                  onClick={() =>
                    a.run(async () => {
                      await api("imports/" + detail.id + "/commit", "POST");
                      setDetail(null);
                      d.reload();
                    })
                  }
                >
                  Review complete · commit marks
                </Button>
              </div>
            )}
        </Modal>
      )}
    </>
  );
}
export function Exceptions({ c }: { c: Context }) {
  const [q, setQ] = useState(""),
    [section, setSection] = useState(""),
    [status, setStatus] = useState("OPEN"),
    [reason, setReason] = useState(""),
    [detail, setDetail] = useState<any>(null);
  const d = useData(
      `exceptions?term=${c.term}&section=${section}&status=${status}&reason=${reason}&q=${encodeURIComponent(q)}`,
    ),
    a = useAction();
  return (
    <>
      <Header
        title="Missing-mark register"
        description="Know exactly which student needs which subject mark, and what happens next."
      />
      <Notice kind="warning">
        A reported incident is an allegation from the submitting teacher.
        Resolve it under school policy; never infer a penalty or substitute
        zero.
      </Notice>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
        <SectionSelect c={c} value={section} onChange={setSection} />
        <select
          aria-label="Exception status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="OPEN">Open exceptions</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ALL">All statuses</option>
        </select>
        <select
          aria-label="Reason filter"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">All reasons</option>
          <option>ABSENT</option>
          <option>REPORTED_MISCONDUCT</option>
          <option>NOT_SUBMITTED</option>
          <option>OTHER</option>
        </select>
      </div>
      {(d.error || a.error) && <Notice>{d.error || a.error}</Notice>}
      <Panel>
        {!d.data ? (
          <Loading />
        ) : !d.data.length ? (
          <Empty
            title="No exceptions in this view"
            detail="All required marks in this filter are accounted for."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>CLASS</th>
                  <th>MISSING SUBJECT</th>
                  <th>TEACHER REASON</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data.map((x: any) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{x.full_name}</strong>
                      <div className="subtext">Student ID {x.code}</div>
                    </td>
                    <td>
                      Grade {x.grade}
                      {x.section}
                    </td>
                    <td>
                      <strong>{x.subject}</strong>
                      <div className="subtext">
                        {x.teacher || "No teacher assigned"}
                      </div>
                    </td>
                    <td>{(x.reason || x.kind).replaceAll("_", " ")}</td>
                    <td>
                      <Badge value={x.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          a.run(async () =>
                            setDetail(await api("exceptions/" + x.id)),
                          )
                        }
                      >
                        Review →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {detail && (
        <ExceptionDetail
          c={c}
          x={detail}
          close={() => setDetail(null)}
          done={() => {
            setDetail(null);
            d.reload();
          }}
        />
      )}
    </>
  );
}
function ExceptionDetail({
  c,
  x,
  close,
  done,
}: {
  c: Context;
  x: any;
  close: () => void;
  done: () => void;
}) {
  const [action, setAction] = useState("REQUEST_CORRECTION"),
    [justification, setJustification] = useState(""),
    [value, setValue] = useState(""),
    a = useAction(done);
  return (
    <Modal title="Review missing mark" onClose={close} wide>
      <dl className="detail-grid">
        {[
          ["Student", x.full_name],
          ["Student ID", x.code],
          ["Class", "Grade " + x.grade + " · " + x.section],
          ["Subject", x.subject],
          ["Teacher", x.teacher || "Unassigned"],
          ["Source", x.filename || "Coverage check"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Notice kind="warning">
        Teacher reason: <strong>{x.reason || x.kind}</strong>
        {x.remark && " · " + x.remark}
        {x.reason === "REPORTED_MISCONDUCT" &&
          " · Reported allegation only. No finding has been inferred."}
      </Notice>
      <Badge value={x.status} />
      <div className="timeline">
        {x.timeline.length ? (
          x.timeline.map((e: any) => (
            <div className="timeline-item" key={e.id}>
              <strong>{e.action.replaceAll("_", " ")}</strong>
              <p>
                {e.justification}
                {e.value !== null ? " · Authorized score: " + e.value : ""}
              </p>
              <small>
                {e.actor} ·{" "}
                <DateLabel value={e.created_at} timezone={c.school.timezone} />
              </small>
            </div>
          ))
        ) : (
          <div className="timeline-item">
            <strong>Exception opened</strong>
            <p>Awaiting a recorded review or teacher clarification.</p>
          </div>
        )}
      </div>
      {x.status !== "RESOLVED" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            a.run(() =>
              api("exceptions/" + x.id, "POST", {
                action,
                justification,
                value,
                revision: x.revision,
              }),
            );
          }}
        >
          {a.error && <Notice>{a.error}</Notice>}
          <Field label="Next action">
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="REQUEST_CORRECTION">
                Request teacher correction
              </option>
              <option value="UNDER_REVIEW">Mark as under review</option>
              {c.actor.roles.some((r: string) =>
                ["SYSTEM_ADMIN", "APPROVER"].includes(r),
              ) && (
                <option value="RESOLVE">
                  Record authorized score and resolve
                </option>
              )}
            </select>
          </Field>
          {action === "RESOLVE" && (
            <Field
              label={"Authorized score (0–" + x.maximum + ")"}
              hint="A numeric score requires a documented decision. Zero is valid only when explicitly authorized."
            >
              <input
                required
                type="number"
                step="0.0001"
                min={0}
                max={x.maximum}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          )}
          <Field label="Justification / clarification request">
            <textarea
              required
              minLength={8}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </Field>
          <div className="form-actions">
            <button className="secondary" type="button" onClick={close}>
              Cancel
            </button>
            <Button busy={a.busy}>Record decision</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export function Results({ c }: { c: Context }) {
  const d = useData("results?term=" + c.term),
    [section, setSection] = useState(c.lookup.sections[0]?.id || ""),
    [view, setView] = useState<any>(null),
    [confirm, setConfirm] = useState(false),
    [gradeConfirm, setGradeConfirm] = useState(false),
    a = useAction(d.reload),
    readiness = useData(
      "results/readiness?term=" + c.term + "&section=" + section,
    );
  const canCalculate = c.actor.roles.some((r: string) =>
      ["SYSTEM_ADMIN", "REGISTRAR"].includes(r),
    ),
    canApprove = c.actor.roles.includes("APPROVER");
  const selectedGrade = c.lookup.sections.find(
    (s: any) => s.id === section,
  )?.grade_id;
  const gradeSections = c.lookup.sections.filter(
      (s: any) => s.grade_id === selectedGrade,
    ),
    latest = gradeSections.map((s: any) =>
      d.data?.find((r: any) => r.section_id === s.id),
    );
  return (
    <>
      <Header
        title="Results & rankings"
        description="Complete marks become reviewable snapshots. Approved results are locked and traceable."
      />
      {a.error && <Notice>{a.error}</Notice>}
      {a.success && <Notice kind="success">{a.success}</Notice>}
      <Panel
        title="Prepare a section result"
        description="The system checks required subjects, missing marks, and pending submissions."
      >
        <div className="panel-body">
          <div className="toolbar">
            <SectionSelect
              c={c}
              all={false}
              value={section}
              onChange={setSection}
            />
            {canCalculate && (
              <Button
                busy={a.busy}
                disabled={!readiness.data?.ready}
                onClick={() =>
                  a.run(async () => {
                    const r = await api("results/calculate", "POST", {
                      term: c.term,
                      section,
                    });
                    setView(await api("results/" + r.id));
                  }, "Result calculated. An authorized approver can now review it.")
                }
              >
                <BarIcon />
                Calculate results
              </Button>
            )}
            {canApprove && (
              <button
                className="secondary"
                disabled={
                  !latest.length ||
                  latest.some((r: any) => !r || r.status !== "READY")
                }
                onClick={() => setGradeConfirm(true)}
              >
                Approve whole grade with ranks
              </button>
            )}
          </div>
          {readiness.error && <Notice>{readiness.error}</Notice>}
          {readiness.data && (
            <Notice kind={readiness.data.ready ? "success" : "warning"}>
              {readiness.data.ready
                ? "This section is complete and ready to calculate."
                : `${readiness.data.missing.length} missing marks · ${readiness.data.open} open exceptions · ${readiness.data.pending} unreviewed uploads · ${readiness.data.unsubmitted.length} missing subject submissions`}
            </Notice>
          )}
        </div>
      </Panel>
      <Panel
        title="Result revisions"
        description="A correction creates a new revision; earlier approved snapshots stay unchanged."
      >
        {!d.data ? (
          <Loading />
        ) : !d.data.length ? (
          <Empty
            title="No result snapshots yet"
            detail="Complete a section’s marks, then calculate its results."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CLASS</th>
                  <th>REVISION</th>
                  <th>STUDENTS</th>
                  <th>CREATED</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        Grade {r.grade}
                        {r.section}
                      </strong>
                    </td>
                    <td>v{r.revision}</td>
                    <td>{r.students}</td>
                    <td>
                      <DateLabel
                        value={r.created_at}
                        timezone={c.school.timezone}
                      />
                    </td>
                    <td>
                      <Badge value={r.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          a.run(
                            async () => setView(await api("results/" + r.id)),
                            "",
                          )
                        }
                      >
                        View results →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {view && (
        <Modal
          title={
            "Grade " +
            view.policy.grade +
            view.policy.section +
            " · Result v" +
            view.revision
          }
          onClose={() => {
            setView(null);
            setConfirm(false);
          }}
          wide
        >
          {view.status !== "APPROVED" && (
            <Notice kind="warning">
              UNOFFICIAL — NOT FOR PRINT. This calculated snapshot requires
              approval.
            </Notice>
          )}
          <div className="row" style={{ marginBottom: 20 }}>
            <Badge value={view.status} />
            <span className="small muted">
              Prepared by {view.creator} · {view.students.length} students
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 390 }}>
            <table>
              <thead>
                <tr>
                  <th>SECTION RANK</th>
                  <th>STUDENT ID</th>
                  <th>STUDENT</th>
                  <th>TOTAL</th>
                  <th>AVERAGE</th>
                  <th>GRADE RANK</th>
                </tr>
              </thead>
              <tbody>
                {view.students.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.section_rank}</strong>
                    </td>
                    <td>{s.student_code}</td>
                    <td>{s.full_name}</td>
                    <td>{Number(s.total).toFixed(2)}</td>
                    <td>{Number(s.average).toFixed(2)}%</td>
                    <td>{s.grade_rank || "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {a.error && <Notice>{a.error}</Notice>}
          {view.status === "READY" && canApprove && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I reviewed this complete result snapshot and authorize its final
                approval.
              </label>
              <div className="form-actions">
                <Button
                  busy={a.busy}
                  disabled={!confirm}
                  onClick={() =>
                    a.run(async () => {
                      await api("results/" + view.id + "/approve", "POST");
                      setView(await api("results/" + view.id));
                      setConfirm(false);
                    }, "Result approved and locked.")
                  }
                >
                  <ShieldCheck size={16} />
                  Approve & lock results
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
      {gradeConfirm && (
        <Modal
          title="Approve complete grade"
          onClose={() => setGradeConfirm(false)}
        >
          <p>
            This approves {latest.length} section snapshots together and assigns
            competition ranks across the whole grade. Each must be complete,
            current, and prepared by a permitted reviewer.
          </p>
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() => setGradeConfirm(false)}
            >
              Cancel
            </button>
            <Button
              busy={a.busy}
              onClick={() =>
                a.run(async () => {
                  await api("results/approve-grade", "POST", {
                    runIds: latest.map((r: any) => r.id),
                  });
                  setGradeConfirm(false);
                }, "Grade results approved with grade ranks.")
              }
            >
              Approve grade results
            </Button>
          </div>
          {a.error && <Notice>{a.error}</Notice>}
        </Modal>
      )}
    </>
  );
}
function BarIcon() {
  return <FileCheck2 size={16} />;
}
