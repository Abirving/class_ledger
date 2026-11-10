"use client";
import { useState, useEffect } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  BookMarked,
  ClipboardList,
  UploadCloud,
  AlertTriangle,
  BarChart3,
  FileText,
  Printer,
  Settings,
  ShieldCheck,
  History,
  Menu,
  Bell,
  ChevronRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  LogOut,
  Plus,
} from "lucide-react";
import {
  api,
  useData,
  Header,
  Panel,
  Badge,
  Notice,
  Loading,
  Button,
  Field,
  Context,
  DateLabel,
} from "./ui";
import {
  Students,
  Assignments,
  SchoolSettings,
  Subjects,
  UserManagement,
  AuditLog,
} from "./Records";
import { UploadWizard, Submissions, Exceptions, Results } from "./Workflows";
import { Templates, Reports } from "./Studio";
const NAV: { label: string; items: [string, string, typeof Users][] }[] = [
  {
    label: "WORKSPACE",
    items: [
      ["/dashboard", "Overview", LayoutDashboard],
      ["/students", "Students", Users],
      ["/subjects", "Subjects", BookMarked],
      ["/assignments", "Teaching assignments", ClipboardList],
    ],
  },
  {
    label: "ACADEMIC WORKFLOW",
    items: [
      ["/upload", "Upload marks", UploadCloud],
      ["/submissions", "Submissions", FileText],
      ["/exceptions", "Missing marks", AlertTriangle],
      ["/results", "Results & rankings", BarChart3],
    ],
  },
  {
    label: "REPORT CARDS",
    items: [
      ["/templates", "Template studio", FileText],
      ["/report-cards", "Generate reports", Printer],
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      ["/settings", "School settings", Settings],
      ["/users", "People & roles", ShieldCheck],
      ["/audit", "Audit trail", History],
    ],
  },
];
export default function App() {
  const bootstrap = useData("bootstrap"),
    lookup = useData("lookups");
  const [path, setPath] = useState("/dashboard"),
    [term, setTerm] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    setPath(location.pathname === "/" ? "/dashboard" : location.pathname);
    setTerm(
      new URLSearchParams(location.search).get("term") ||
        localStorage.getItem("classledger-term") ||
        "",
    );
  }, []);
  useEffect(() => {
    if (lookup.data && !lookup.data.terms.some((t: any) => t.id === term))
      setTerm(lookup.data.terms[0]?.id || "");
  }, [lookup.data, term]);
  if (bootstrap.error)
    return (
      <div className="content">
        <Notice>{bootstrap.error}</Notice>
        <button onClick={bootstrap.reload}>Retry</button>
      </div>
    );
  if (!bootstrap.data)
    return (
      <div className="content">
        <Loading />
      </div>
    );
  const b = bootstrap.data;
  if (!b.actor)
    return (
      <Welcome
        reload={() => {
          bootstrap.reload();
          lookup.reload();
        }}
      />
    );
  if (!lookup.data || !term)
    return (
      <div className="content">
        <Loading />
        {lookup.error && <Notice>{lookup.error}</Notice>}
      </div>
    );
  const c: Context = {
    actor: b.actor,
    school: b.school,
    lookup: lookup.data,
    term,
    refresh: () => {
      lookup.reload();
      bootstrap.reload();
    },
  };
  const teacherOnly = !b.actor.roles.some((r: string) =>
      ["SYSTEM_ADMIN", "REGISTRAR", "APPROVER"].includes(r),
    ),
    admin = b.actor.roles.includes("SYSTEM_ADMIN");
  const title =
    NAV.flatMap((n) => n.items).find((i) => path.startsWith(i[0]))?.[1] ||
    "Workspace";
  const href = (url: string) => url + "?term=" + term;
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (open ? "open" : "")}>
        <a className="brand" href={href("/dashboard")}>
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          ClassLedger
        </a>
        <div className="sidebar-school">
          <span className="school-icon">
            <GraduationCap size={18} />
          </span>
          <div>
            {b.school.name}
            <small>SCHOOL OPERATIONS</small>
          </div>
        </div>
        <nav>
          {NAV.map((group) => {
            const items = group.items.filter((i) =>
              teacherOnly
                ? ["/assignments", "/upload", "/submissions"].includes(i[0])
                : admin || !["/users", "/settings"].includes(i[0]),
            );
            return items.length ? (
              <div key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {items.map(([url, label, Icon]) => (
                  <a
                    key={url}
                    className={"nav-item " + (path === url ? "active" : "")}
                    href={href(url)}
                    aria-current={path === url ? "page" : undefined}
                  >
                    <Icon size={17} />
                    {label}
                  </a>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{b.actor.name.slice(0, 2).toUpperCase()}</div>
          <div>
            {b.actor.name}
            <br />
            <small>{b.actor.roles[0].replaceAll("_", " ")}</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              onClick={() => setOpen(!open)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span className="crumb">Workspace</span>
            <ChevronRight size={13} className="muted" />
            <span className="small">{title}</span>
          </div>
          <div className="topbar-right">
            <select
              aria-label="Academic year and term"
              value={term}
              onChange={(e) => {
                localStorage.setItem("classledger-term", e.target.value);
                location.href = path + "?term=" + e.target.value;
              }}
            >
              {lookup.data.terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {
                    lookup.data.years.find((y: any) => y.id === t.year_id)
                      ?.label
                  }{" "}
                  · {t.label}
                </option>
              ))}
            </select>
            {!teacherOnly && (
              <a
                href={href("/exceptions")}
                className="icon-button"
                aria-label="View missing marks"
              >
                <Bell size={18} />
              </a>
            )}
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("auth/logout", "POST");
                location.href = "/login";
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <main className="content">
          {path === "/dashboard" ? (
            teacherOnly ? (
              <Assignments c={c} />
            ) : (
              <Dashboard c={c} />
            )
          ) : path === "/students" ? (
            <Students c={c} />
          ) : path === "/subjects" ? (
            <Subjects c={c} />
          ) : path === "/assignments" ? (
            <Assignments c={c} />
          ) : path === "/upload" ? (
            <UploadWizard c={c} />
          ) : path === "/submissions" ? (
            <Submissions c={c} />
          ) : path === "/exceptions" ? (
            <Exceptions c={c} />
          ) : path === "/results" ? (
            <Results c={c} />
          ) : path === "/templates" ? (
            <Templates c={c} />
          ) : path === "/report-cards" ? (
            <Reports c={c} />
          ) : path === "/settings" ? (
            <SchoolSettings c={c} />
          ) : path === "/users" ? (
            <UserManagement c={c} />
          ) : path === "/audit" ? (
            <AuditLog c={c} />
          ) : (
            <Panel>
              <div className="empty">
                <h1>Page not found</h1>
                <p>Choose a destination from the navigation.</p>
                <a href={href("/dashboard")}>Return to overview</a>
              </div>
            </Panel>
          )}
          <div className="footer-note">
            ClassLedger · Every student. Every subject. Every result accounted
            for.
          </div>
        </main>
      </div>
    </div>
  );
}
function Welcome({ reload }: { reload: () => void }) {
  const [portal, setPortal] = useState<"admin" | "teacher">("admin"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("auth/login", "POST", { username, password, portal });
      reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const admin = portal === "admin";
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          ClassLedger
        </div>
        <div>
          <div className="eyebrow" style={{ color: "#6bd5c7" }}>
            A CLEARER SCHOOL DAY
          </div>
          <h1>
            From teacher marks
            <br />
            to confident results.
          </h1>
          <p>
            One organized workspace for your students, academic decisions, and
            beautifully printed report cards.
          </p>
        </div>
        <div className="small" style={{ color: "#8da9b9" }}>
          Made for the people who keep schools moving.
        </div>
      </div>
      <div className="login-form">
        <div className="login-form-inner">
          <div className="eyebrow">WELCOME TO CLASSLEDGER</div>
          <h1>Sign in to ClassLedger</h1>
          <p>
            Choose the section that matches your role, then enter your username
            and password.
          </p>
          {error && <Notice>{error}</Notice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="login-tabs" role="tablist">
              {(["admin", "teacher"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={portal === p}
                  className={portal === p ? "active" : ""}
                  onClick={() => {
                    setPortal(p);
                    setError("");
                  }}
                >
                  {p === "admin" ? "Administrator" : "Teacher"}
                </button>
              ))}
            </div>
            <p className="small">
              {admin
                ? "For the school administrator, registrar and approvers."
                : "For subject teachers who upload marks."}
            </p>
            <Field label="Username">
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button busy={busy} type="submit">
              Sign in as {admin ? "administrator" : "teacher"}
            </Button>
            <p className="small" style={{ marginTop: 20 }}>
              Need access or a password reset? Contact your school
              administrator.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
function Dashboard({ c }: { c: Context }) {
  const { data: d, error, reload } = useData("overview?term=" + c.term);
  if (error)
    return (
      <>
        <Notice>{error}</Notice>
        <button onClick={reload}>Retry</button>
      </>
    );
  if (!d) return <Loading />;
  const href = (p: string) => p + "?term=" + c.term;
  return (
    <>
      <Header
        eyebrow="YOUR SCHOOL AT A GLANCE"
        title="Academic overview"
        description="A clear view of submissions, missing marks, and what needs your attention."
        action={
          <a className="button" href={href("/report-cards")}>
            <Printer size={16} />
            Generate report cards
          </a>
        }
      />
      <div className="stats">
        {[
          [
            Users,
            "Active students",
            d.students,
            "Across " + d.states.length + " sections",
          ],
          [
            ClipboardList,
            "Teacher submissions",
            d.submitted + " / " + d.expected,
            "Assignments submitted this term",
          ],
          [
            AlertTriangle,
            "Missing marks",
            d.missing,
            "Students needing a recorded decision",
          ],
          [
            CheckCircle2,
            "Sections ready",
            d.ready + " / " + d.states.length,
            "Complete and ready for results",
          ],
        ].map(([Icon, label, value, detail]: any, i) => (
          <div
            className={"stat " + (i === 2 && d.missing ? "emphasis" : "")}
            key={label}
          >
            <div className="stat-label">
              {label}
              <Icon size={18} />
            </div>
            <div className="stat-value">{value}</div>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="grid-main">
        <Panel
          title="Submission coverage"
          description="Every subject, accounted for. Review completeness by section."
          action={
            <span className="small muted">
              {c.lookup.terms.find((t: any) => t.id === c.term)?.label}
            </span>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CLASS / SECTION</th>
                  <th>STUDENTS</th>
                  {c.lookup.subjects.map((s: any) => (
                    <th key={s.id}>{s.name.toUpperCase()}</th>
                  ))}
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {d.states.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>
                        Grade {s.grade}
                        {s.label}
                      </strong>
                    </td>
                    <td className="mono">{s.studentCount}</td>
                    {c.lookup.subjects.map((subject: any) => {
                      const o = s.offerings.find(
                          (o: any) => o.subject_id === subject.id,
                        ),
                        a =
                          o &&
                          s.assignments.find(
                            (a: any) => a.offering_id === o.id,
                          );
                      return (
                        <td key={subject.id}>
                          {o ? (
                            <span
                              className={
                                "coverage-cell " +
                                (!a?.submissions ? "incomplete" : "")
                              }
                            >
                              <CheckCircle2 />
                              {a?.submissions ? "Submitted" : "Pending"}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <Badge value={s.ready ? "READY" : "INCOMPLETE"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>Completeness includes missing marks and open decisions.</span>
            <a href={href("/submissions")}>View submissions →</a>
          </div>
        </Panel>
        <Panel
          title="Needs your attention"
          description="The next steps toward approved results."
        >
          <div className="action-list">
            {d.missing > 0 && (
              <div className="action-row">
                <span className="action-icon">
                  <AlertTriangle size={19} />
                </span>
                <div>
                  <h3>{d.missing} marks need a decision</h3>
                  <p>
                    Review missing scores, absence reports, and teacher
                    clarification requests.
                  </p>
                  <a href={href("/exceptions")}>Open missing-mark register →</a>
                </div>
              </div>
            )}
            <div className="action-row">
              <span
                className="action-icon"
                style={{ background: "#e9f6f2", color: "#167b67" }}
              >
                <BarChart3 size={19} />
              </span>
              <div>
                <h3>{d.ready} sections ready to calculate</h3>
                <p>Prepare results for a separate authorized approver.</p>
                <a href={href("/results")}>Review results & rankings →</a>
              </div>
            </div>
            <div className="action-row">
              <span
                className="action-icon"
                style={{ background: "#edf2fa", color: "#4670ad" }}
              >
                <FileText size={19} />
              </span>
              <div>
                <h3>Make the report card your own</h3>
                <p>Upload your official template and map the student fields.</p>
                <a href={href("/templates")}>Open template studio →</a>
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Recent submissions"
        description="Latest teacher uploads and their validation status."
        action={
          <a className="inline-link" href={href("/submissions")}>
            View all submissions →
          </a>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SUBMISSION</th>
                <th>TEACHER</th>
                <th>CLASS</th>
                <th>DATE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((s: any) => (
                <tr key={s.id}>
                  <td>
                    <div className="table-name">
                      <FileText size={18} className="muted" />
                      <div>
                        <strong>{s.subject}</strong>
                        <div className="subtext">{s.filename}</div>
                      </div>
                    </div>
                  </td>
                  <td>{s.teacher}</td>
                  <td>
                    Grade {s.grade}
                    {s.section}
                  </td>
                  <td>
                    <DateLabel
                      value={s.created_at}
                      timezone={c.school.timezone}
                    />
                  </td>
                  <td>
                    <Badge value={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
