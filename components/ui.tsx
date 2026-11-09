"use client";
import { useEffect, useRef, useState, ReactNode } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowRight,
  Loader2,
} from "lucide-react";
export async function api(
  path: string,
  method = "GET",
  body?: any,
): Promise<any> {
  const res = await fetch("/api/" + path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}
export function useData(path: string) {
  const [data, set] = useState<any>(null),
    [error, setError] = useState(""),
    [version, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    set(null);
    api(path)
      .then((x) => {
        if (alive) set(x);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error, reload: () => bump((x) => x + 1) };
}
export function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow || "SCHOOL WORKSPACE"}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (["APPROVED", "COMPLETED", "COMMITTED", "READY", "RESOLVED"].includes(
          value,
        )
          ? "green"
          : ["INVALID", "FAILED", "INCOMPLETE"].includes(value)
            ? "red"
            : [
                  "OPEN",
                  "STAGED",
                  "UNDER_REVIEW",
                  "CORRECTION_REQUESTED",
                ].includes(value)
              ? "amber"
              : "gray")
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Notice({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: string;
}) {
  return (
    <div
      className={"notice " + kind}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "success" ? (
        <CheckCircle2 size={17} />
      ) : (
        <AlertCircle size={17} />
      )}
      <span>{children}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeletons" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CheckCircle2 size={26} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search by name or ID…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Button({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy ? <Loader2 className="spin" size={16} /> : null}
      {children}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("input,button,select")?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function LinkButton({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a className={"button " + (secondary ? "secondary" : "")} href={href}>
      {children}
      <ArrowRight size={16} />
    </a>
  );
}
export function DateLabel({
  value,
  timezone = "Africa/Addis_Ababa",
}: {
  value: string;
  timezone?: string;
}) {
  return (
    <>
      {new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeZone: timezone,
      }).format(new Date(value))}
    </>
  );
}
export function useAction(onSuccess?: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  return {
    busy,
    error,
    success,
    run: async (fn: () => Promise<any>, message = "Saved successfully") => {
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        const data = await fn();
        setSuccess(message);
        onSuccess?.();
        return data;
      } catch (e: any) {
        setError(e.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
  };
}
export type Context = {
  actor: any;
  school: any;
  lookup: any;
  term: string;
  refresh: () => void;
};
