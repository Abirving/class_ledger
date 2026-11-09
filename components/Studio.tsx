"use client";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Upload,
  FileText,
  Printer,
  Download,
  Undo2,
  Redo2,
  Save,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Move,
  RefreshCw,
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
  DateLabel,
  Context,
} from "./ui";
import {
  Field as MappingField,
  fields as defaults,
  fieldErrors,
  FIELD_KEYS,
} from "@/lib/domain/academic";
export function Templates({ c }: { c: Context }) {
  const d = useData("templates"),
    [upload, setUpload] = useState(false),
    [edit, setEdit] = useState<any>(null),
    a = useAction();
  return (
    <>
      <Header
        title="Report-card templates"
        description="Your school’s familiar report card, filled precisely with approved student results."
        action={
          c.actor.roles.some((r: string) =>
            ["SYSTEM_ADMIN", "REGISTRAR"].includes(r),
          ) && (
            <button onClick={() => setUpload(true)}>
              <Upload size={16} />
              Upload official template
            </button>
          )
        }
      />
      <Notice kind="info">
        Use the sample layout now, then upload your official PDF, PNG, or JPG.
        Academic data stays separate from the design.
      </Notice>
      {(d.error || a.error) && <Notice>{d.error || a.error}</Notice>}
      {!d.data ? (
        <Loading />
      ) : (
        <div className="template-grid">
          {d.data.map((t: any) => (
            <article className="template-card" key={t.id}>
              <div className="template-art">
                <div className="mini-page">
                  <div className="mini-title" />
                  <div className="mini-line" />
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div className="mini-row" key={i} />
                  ))}
                </div>
              </div>
              <div className="template-info">
                <div className="row">
                  <h2>{t.name}</h2>
                  <Badge value={t.status} />
                </div>
                <p>
                  Version {t.version} · {Math.round(t.page_width)} ×{" "}
                  {Math.round(t.page_height)} pt · {t.file_type}
                </p>
                <div className="row">
                  <button
                    className="secondary"
                    onClick={() =>
                      a.run(
                        async () => setEdit(await api("templates/" + t.id)),
                        "",
                      )
                    }
                  >
                    Open template studio
                  </button>
                  <a
                    className="inline-link"
                    target="_blank"
                    rel="noreferrer"
                    href={"/api/templates/" + t.id + "/preview"}
                  >
                    Preview
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {upload && (
        <TemplateUpload
          close={() => setUpload(false)}
          done={async (id) => {
            setUpload(false);
            d.reload();
            setEdit(await api("templates/" + id));
          }}
        />
      )}
      {edit && (
        <TemplateEditor
          c={c}
          original={edit}
          close={() => setEdit(null)}
          changed={d.reload}
        />
      )}
    </>
  );
}
function TemplateUpload({
  close,
  done,
}: {
  close: () => void;
  done: (id: string) => void;
}) {
  const [name, setName] = useState("School report card"),
    [file, setFile] = useState<File | null>(null),
    a = useAction();
  return (
    <Modal title="Upload official template" onClose={close}>
      <Field label="Template name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="upload-zone">
        <FileText size={32} />
        <h3>Original PDF background</h3>
        <p>One page. Up to 5 MB. PDF dimensions are preserved.</p>
        <input
          aria-label="Template file"
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      {a.error && <Notice>{a.error}</Notice>}
      <div className="form-actions">
        <Button
          busy={a.busy}
          disabled={!file}
          onClick={() =>
            a.run(async () => {
              const f = new FormData();
              f.append("file", file!);
              f.append("name", name);
              const t = await api("templates", "POST", f);
              done(t.id);
            })
          }
        >
          Upload & map fields
        </Button>
      </div>
    </Modal>
  );
}
function TemplateEditor({
  c,
  original,
  close,
  changed,
}: {
  c: Context;
  original: any;
  close: () => void;
  changed: () => void;
}) {
  const [t, setT] = useState(original),
    [history, setHistory] = useState<MappingField[][]>([original.fields]),
    [position, setPosition] = useState(0),
    [selected, setSelected] = useState(0),
    [zoom, setZoom] = useState(0.75),
    [snap, setSnap] = useState(true),
    [width, setWidth] = useState(Number(original.page_width)),
    [height, setHeight] = useState(Number(original.page_height)),
    [dirty, setDirty] = useState(false),
    [add, setAdd] = useState(""),
    a = useAction(),
    list = history[position],
    drag = useRef<{
      index: number;
      startX: number;
      startY: number;
      field: MappingField;
      resize: boolean;
      list: MappingField[];
    } | null>(null);
  const maxSubjects = Math.max(
      3,
      ...c.lookup.grades.map(
        (g: any) =>
          c.lookup.offerings.filter(
            (o: any) => o.grade_id === g.id && o.required,
          ).length,
      ),
    ),
    errors = fieldErrors(list, width, height, maxSubjects),
    canEdit = c.actor.roles.some((r: string) =>
      ["SYSTEM_ADMIN", "REGISTRAR"].includes(r),
    );
  function push(next: MappingField[]) {
    setHistory([...history.slice(0, position + 1), next]);
    setPosition(position + 1);
    setDirty(true);
  }
  function update(p: Partial<MappingField>) {
    push(list.map((f, i) => (i === selected ? { ...f, ...p } : f)));
  }
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  function exit() {
    if (
      !dirty ||
      window.confirm("You have unsaved mapping changes. Discard them?")
    )
      close();
  }
  async function save() {
    const result = await api("templates/" + t.id + "/fields", "PUT", {
      fields: list,
      page_width: width,
      page_height: height,
    });
    const current = await api("templates/" + result.id);
    setT(current);
    setDirty(false);
    changed();
    return current;
  }
  function pointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const unit = snap ? 2 : 1,
      dx = Math.round((e.clientX - d.startX) / zoom / unit) * unit,
      dy = Math.round((e.clientY - d.startY) / zoom / unit) * unit;
    const updated = {
      ...d.field,
      ...(d.resize
        ? {
            width: Math.max(25, d.field.width + dx),
            height: Math.max(15, d.field.height + dy),
          }
        : { x: Math.max(0, d.field.x + dx), y: Math.max(0, d.field.y + dy) }),
    };
    setHistory((h) =>
      h.map((v, i) =>
        i === position
          ? d.list.map((f, j) => (j === d.index ? updated : f))
          : v,
      ),
    );
    setDirty(true);
  }
  const f = list[selected];
  return (
    <div className="modal-backdrop">
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Template studio"
        style={{ width: "min(1240px,96vw)" }}
      >
        <div className="modal-title">
          <div>
            <div className="eyebrow">TEMPLATE STUDIO · VERSION {t.version}</div>
            <h2>{t.name}</h2>
          </div>
          <button className="secondary" onClick={exit}>
            Close studio
          </button>
        </div>
        {a.error && <Notice>{a.error}</Notice>}
        {a.success && <Notice kind="success">{a.success}</Notice>}
        <div className="toolbar">
          <button
            className="secondary"
            disabled={!canEdit || position === 0}
            onClick={() => {
              setPosition(position - 1);
              setDirty(true);
            }}
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="secondary"
            disabled={!canEdit || position === history.length - 1}
            onClick={() => {
              setPosition(position + 1);
              setDirty(true);
            }}
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            className="secondary"
            onClick={() => setZoom(Math.max(0.35, zoom - 0.1))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="small">{Math.round(zoom * 100)}%</span>
          <button
            className="secondary"
            onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Snap 2 pt
          </label>
          <div className="right row">
            {canEdit && (
              <Button
                className="secondary"
                busy={a.busy}
                onClick={() => a.run(save, "Draft saved.")}
              >
                <Save size={15} />
                Save draft
              </Button>
            )}
            <a
              className="button secondary"
              target="_blank"
              rel="noreferrer"
              href={"/api/templates/" + t.id + "/preview"}
            >
              Preview saved PDF
            </a>
            {canEdit && (
              <Button
                busy={a.busy}
                disabled={!!errors.length}
                onClick={() =>
                  a.run(async () => {
                    const saved = await save();
                    await api("templates/" + saved.id + "/approve", "POST");
                    setT(await api("templates/" + saved.id));
                    changed();
                  }, "Template version approved.")
                }
              >
                <CheckCircle2 size={16} />
                Approve version
              </Button>
            )}
          </div>
        </div>
        <div className="editor">
          <div className="canvas-scroll">
            <div className="small muted" style={{ marginBottom: 8 }}>
              Print coordinates · points (72 pt = 1 inch) · top-left origin
            </div>
            <div style={{ width: width * zoom, height: height * zoom }}>
              <div
                className="paper"
                style={{ width, height, transform: `scale(${zoom})` }}
              >
                {t.file_key ? (
                  t.file_type === "PDF" ? (
                    <object
                      className="paper-bg"
                      type="application/pdf"
                      data={
                        "/api/templates/" +
                        t.id +
                        "/background#toolbar=0&view=Fit"
                      }
                      aria-label="Template PDF background"
                    />
                  ) : (
                    <img
                      className="paper-bg"
                      src={"/api/templates/" + t.id + "/background"}
                      alt="Template background"
                    />
                  )
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 40,
                      borderTop: "3px solid #0d8b87",
                      paddingTop: 16,
                      color: "#c0ccd4",
                      fontSize: 12,
                    }}
                  >
                    ACADEMIC REPORT CARD · SAMPLE
                  </div>
                )}
                {list.map((field, i) => (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={"Move field " + field.key}
                    key={field.key}
                    className={
                      "mapped-field " + (selected === i ? "selected" : "")
                    }
                    style={{
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      height: field.height,
                      color: field.color,
                      textAlign: field.align,
                      fontSize: field.fontSize,
                    }}
                    onFocus={() => setSelected(i)}
                    onPointerDown={(e) => {
                      setSelected(i);
                      if (!canEdit) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const saved = [...list];
                      const nextHistory = [
                        ...history.slice(0, position + 1),
                        saved,
                      ];
                      setHistory(nextHistory);
                      setPosition(position + 1);
                      drag.current = {
                        index: i,
                        startX: e.clientX,
                        startY: e.clientY,
                        field: { ...field },
                        resize:
                          (e.target as HTMLElement).dataset.resize === "yes",
                        list: saved,
                      };
                    }}
                    onPointerMove={pointerMove}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(e) => {
                      if (!canEdit) return;
                      const n = e.shiftKey ? 10 : 1;
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        update({
                          x: Math.max(
                            0,
                            field.x +
                              (e.key === "ArrowLeft"
                                ? -n
                                : e.key === "ArrowRight"
                                  ? n
                                  : 0),
                          ),
                          y: Math.max(
                            0,
                            field.y +
                              (e.key === "ArrowUp"
                                ? -n
                                : e.key === "ArrowDown"
                                  ? n
                                  : 0),
                          ),
                        });
                      }
                    }}
                  >
                    {field.key === "subject_table" ? (
                      <div>
                        <strong>Subject / Score / Max</strong>
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            style={{
                              borderTop: "1px solid #9abfc0",
                              height: 28,
                              marginTop: 8,
                            }}
                          >
                            Subject {n} … 88 / 100
                          </div>
                        ))}
                      </div>
                    ) : (
                      field.key.replaceAll("_", " ")
                    )}
                    {canEdit && (
                      <span
                        data-resize="yes"
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: 0,
                          width: 12,
                          height: 12,
                          background: "#0d8b87",
                          cursor: "nwse-resize",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Panel className="properties">
            <h2>Field properties</h2>
            <p className="small" style={{ marginTop: 8 }}>
              Select a field to position it. Arrow keys move 1 pt; Shift moves
              10 pt.
            </p>
            <div className="mapping-list">
              {list.map((f, i) => (
                <button
                  className={i === selected ? "" : "secondary"}
                  key={f.key}
                  onClick={() => setSelected(i)}
                >
                  {f.key}
                </button>
              ))}
            </div>
            {f && (
              <fieldset disabled={!canEdit} style={{ border: 0, padding: 0 }}>
                <strong className="small">{f.key.toUpperCase()}</strong>
                <div className="grid-2" style={{ marginTop: 14 }}>
                  {(["x", "y", "width", "height", "fontSize"] as const).map(
                    (k) => (
                      <Field
                        label={
                          k === "fontSize" ? "Font size (pt)" : k + " (pt)"
                        }
                        key={k}
                      >
                        <input
                          type="number"
                          value={Math.round(f[k] * 10) / 10}
                          step="1"
                          onChange={(e) =>
                            update({ [k]: Number(e.target.value) })
                          }
                        />
                      </Field>
                    ),
                  )}
                  <Field label="Color">
                    <input
                      type="color"
                      value={f.color}
                      onChange={(e) => update({ color: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Font">
                  <select
                    value={f.fontFamily}
                    onChange={(e) =>
                      update({ fontFamily: e.target.value as any })
                    }
                  >
                    <option value="sans">Sans serif + Ethiopic</option>
                    <option value="serif">Serif + Ethiopic</option>
                  </select>
                </Field>
                <Field label="Alignment">
                  <select
                    value={f.align}
                    onChange={(e) => update({ align: e.target.value as any })}
                  >
                    {["left", "center", "right"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Overflow">
                  <select
                    value={f.overflow}
                    onChange={(e) =>
                      update({ overflow: e.target.value as any })
                    }
                  >
                    <option value="wrap">Wrap, then block overflow</option>
                    <option value="shrink">Shrink to minimum 8 pt</option>
                    <option value="error">Single line, block overflow</option>
                  </select>
                </Field>
                <button
                  className="text-button"
                  onClick={() => {
                    push(list.filter((_, i) => i !== selected));
                    setSelected(0);
                  }}
                >
                  <Trash2 size={14} />
                  Remove field
                </button>
              </fieldset>
            )}
            {canEdit && (
              <>
                <Field label="Add dynamic field">
                  <select value={add} onChange={(e) => setAdd(e.target.value)}>
                    <option value="">Select field</option>
                    {FIELD_KEYS.filter(
                      (k) => !list.some((f) => f.key === k),
                    ).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <button
                  className="secondary"
                  disabled={!add}
                  onClick={() => {
                    push([
                      ...list,
                      {
                        key: add,
                        x: 40,
                        y: 680,
                        width: 220,
                        height: 30,
                        fontSize: 11,
                        align: "left",
                        color: "#142A3B",
                        overflow: "wrap",
                        fontFamily: "sans",
                      },
                    ]);
                    setSelected(list.length);
                    setAdd("");
                  }}
                >
                  <Plus size={14} />
                  Add field
                </button>
                {t.file_type !== "PDF" && (
                  <div className="grid-2" style={{ marginTop: 20 }}>
                    <Field label="Paper width">
                      <input
                        type="number"
                        value={width}
                        onChange={(e) => {
                          setWidth(Number(e.target.value));
                          setDirty(true);
                        }}
                      />
                    </Field>
                    <Field label="Paper height">
                      <input
                        type="number"
                        value={height}
                        onChange={(e) => {
                          setHeight(Number(e.target.value));
                          setDirty(true);
                        }}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
            {errors.length ? (
              <Notice kind="warning">
                <strong>Mapping checks</strong>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice kind="success">
                Required fields and subject rows fit the page.
              </Notice>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
export function Reports({ c }: { c: Context }) {
  const runs = useData("results?term=" + c.term),
    templates = useData("templates"),
    batches = useData("report-batches"),
    [selected, setSelected] = useState<string[]>([]),
    [template, setTemplate] = useState(""),
    [individuals, setIndividuals] = useState(false),
    [sort, setSort] = useState("rank"),
    [view, setView] = useState<any>(null),
    [confirm, setConfirm] = useState(false),
    a = useAction();
  useEffect(() => {
    if (templates.data && !template)
      setTemplate(
        templates.data.find((t: any) => t.status === "APPROVED")?.id || "",
      );
  }, [templates.data, template]);
  useEffect(() => {
    if (!view || !["QUEUED", "RUNNING"].includes(view.status)) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        await api("report-batches/" + view.id + "/process", "POST");
        const next = await api("report-batches/" + view.id);
        if (active) {
          setView(next);
          if (next.status === "COMPLETED" || next.status === "FAILED")
            batches.reload();
        }
      } catch (e: any) {
        if (active) setView({ ...view, status: "FAILED", error: e.message });
      }
    }, 2500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [view]);
  const approved =
      runs.data?.filter(
        (r: any) =>
          r.status === "APPROVED" &&
          !runs.data.some(
            (other: any) =>
              other.section_id === r.section_id && other.revision > r.revision,
          ),
      ) || [],
    count = approved
      .filter((r: any) => selected.includes(r.id))
      .reduce((n: number, r: any) => n + Number(r.students), 0);
  return (
    <>
      <Header
        title="Generate report cards"
        description="Approved results, your chosen template, and a separate print-ready PDF for every section."
      />
      {a.error && <Notice>{a.error}</Notice>}
      <div className="grid-main">
        <Panel
          title="1. Choose approved sections"
          description="Select the current approved revision for each section."
        >
          {!runs.data ? (
            <Loading />
          ) : !approved.length ? (
            <Empty
              title="No approved sections yet"
              detail="Complete and approve a result run to enable final report cards."
              action={
                <a
                  className="button secondary"
                  href={"/results?term=" + c.term}
                >
                  Go to results
                </a>
              }
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SELECT</th>
                    <th>CLASS</th>
                    <th>STUDENTS</th>
                    <th>REVISION</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"Select Grade " + r.grade + r.section}
                          checked={selected.includes(r.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.id]
                                : selected.filter((x) => x !== r.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          Grade {r.grade} · Section {r.section}
                        </strong>
                      </td>
                      <td>{r.students}</td>
                      <td>v{r.revision}</td>
                      <td>
                        <Badge value="APPROVED" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="2. Configure output">
          <div className="panel-body">
            <Field label="Approved template version">
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">Choose template</option>
                {templates.data
                  ?.filter((t: any) => t.status === "APPROVED")
                  .map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · v{t.version}
                    </option>
                  ))}
              </select>
            </Field>
            {template && (
              <a
                className="inline-link"
                target="_blank"
                rel="noreferrer"
                href={"/api/templates/" + template + "/preview"}
              >
                Preview saved template →
              </a>
            )}
            <Field label="Student sort order">
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="rank">Section rank, then Student ID</option>
                <option value="id">Student ID</option>
                <option value="name">Student name</option>
              </select>
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={individuals}
                onChange={(e) => setIndividuals(e.target.checked)}
              />
              Also include an individual PDF per student
            </label>
            <p className="small">
              The ZIP includes grade folders, separate section PDFs, and a
              count/checksum manifest.
            </p>
            <div className="form-actions">
              <button
                disabled={!selected.length || !template}
                onClick={() => setConfirm(true)}
              >
                <Printer size={16} />
                Generate {count} report cards
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Report batches"
        description="Download completed files or review generation progress."
      >
        {!batches.data ? (
          <Loading />
        ) : !batches.data.length ? (
          <Empty
            title="Your first report batch starts here"
            detail="Choose approved sections and generate their report cards."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>BATCH</th>
                  <th>CREATED</th>
                  <th>PROGRESS</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      <strong>Report cards</strong>
                      <div className="subtext">
                        {b.total} section{b.total === 1 ? "" : "s"} ·{" "}
                        {b.id.slice(0, 8)}
                      </div>
                    </td>
                    <td>
                      <DateLabel
                        value={b.created_at}
                        timezone={c.school.timezone}
                      />
                    </td>
                    <td>
                      <div className="job-progress">
                        <div
                          style={{
                            width:
                              (b.status === "COMPLETED"
                                ? 100
                                : (b.progress / b.total) * 90) + "%",
                          }}
                        />
                      </div>
                      <div className="subtext">
                        {b.progress} of {b.total} sections
                      </div>
                    </td>
                    <td>
                      <Badge value={b.status} />
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="text-button"
                          onClick={() =>
                            a.run(
                              async () =>
                                setView(await api("report-batches/" + b.id)),
                              "",
                            )
                          }
                        >
                          View
                        </button>
                        {b.status === "COMPLETED" && (
                          <a
                            className="button secondary"
                            href={"/api/report-batches/" + b.id + "/download"}
                          >
                            <Download size={15} />
                            ZIP
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
      {confirm && (
        <Modal
          title="Generate final report cards"
          onClose={() => setConfirm(false)}
        >
          <Notice kind="info">
            {count} students across {selected.length} sections. Every student
            gets one report-card page in their own section PDF.
          </Notice>
          <p>
            Only current, approved snapshots are used. The system checks page
            counts before releasing the completed ZIP.
          </p>
          <div className="form-actions">
            <button className="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <Button
              busy={a.busy}
              onClick={() =>
                a.run(async () => {
                  const b = await api("report-batches", "POST", {
                    runIds: selected,
                    templateId: template,
                    individuals,
                    sort,
                  });
                  setConfirm(false);
                  setView(await api("report-batches/" + b.id));
                  batches.reload();
                })
              }
            >
              Generate reports
            </Button>
          </div>
          {a.error && <Notice>{a.error}</Notice>}
        </Modal>
      )}
      {view && (
        <Modal title="Report batch progress" onClose={() => setView(null)}>
          <div className="row">
            <Badge value={view.status} />
            <span>
              {view.progress} / {view.total} sections rendered
            </span>
          </div>
          <progress
            style={{ width: "100%", margin: "24px 0" }}
            value={view.status === "COMPLETED" ? view.total + 1 : view.progress}
            max={view.total + 1}
          />
          {view.error && <Notice>{view.error}</Notice>}
          {view.status === "COMPLETED" && (
            <>
              <Notice kind="success">
                Section counts verified. Your report cards are ready.
              </Notice>
              <div className="row">
                <a
                  className="button"
                  href={"/api/report-batches/" + view.id + "/download"}
                >
                  <Download size={16} />
                  Download ZIP
                </a>
                <a
                  className="button secondary"
                  href={"/api/report-batches/" + view.id + "/manifest"}
                >
                  Manifest
                </a>
              </div>
            </>
          )}
          {view.files?.map((f: any) => (
            <div className="action-row" key={f.id}>
              <FileText size={20} />
              <div>
                <strong className="small">{f.filename}</strong>
                <p>{f.page_count} student pages</p>
                <div className="row">
                  <a
                    className="button secondary"
                    target="_blank"
                    rel="noreferrer"
                    href={
                      "/api/report-batches/" +
                      view.id +
                      "/file?inline=1&file=" +
                      f.id
                    }
                  >
                    <Printer size={15} />
                    Open &amp; print
                  </a>
                  <a
                    className="inline-link"
                    href={"/api/report-batches/" + view.id + "/file?file=" + f.id}
                  >
                    Download PDF →
                  </a>
                </div>
              </div>
            </div>
          ))}
          {view.status === "FAILED" && (
            <div className="form-actions">
              <Button
                busy={a.busy}
                onClick={() =>
                  a.run(async () => {
                    await api("report-batches/" + view.id + "/process", "POST");
                    setView(await api("report-batches/" + view.id));
                    batches.reload();
                  })
                }
              >
                <RefreshCw size={15} />
                Retry generation
              </Button>
              <button
                className="secondary"
                onClick={() =>
                  a.run(async () => {
                    await api("report-batches/" + view.id + "/cancel", "POST");
                    setView(await api("report-batches/" + view.id));
                    batches.reload();
                  })
                }
              >
                Cancel batch
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
