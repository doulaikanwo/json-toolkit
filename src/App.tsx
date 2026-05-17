import { useCallback, useMemo, useState } from "react";
import { localeLabel, supportedLocales, useI18n } from "./i18n/context";
import type { Locale } from "./i18n/messages";

type TabId = "format" | "validate" | "diff" | "extras";

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function formatJson(raw: string, indent: number | string): string {
  const parsed = JSON.parse(raw);
  return JSON.stringify(parsed, null, indent);
}

function parsePosition(text: string, position: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < position && i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function findFirstDiffLine(a: string, b: string): number | null {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return i + 1;
  }
  return null;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

const TAB_IDS: TabId[] = ["format", "validate", "diff", "extras"];

const LOCALE_SELECT_AUTO = "auto";

export default function App() {
  const { locale, localeFollowsBrowser, setLocale, setFollowBrowser, t } = useI18n();
  const [tab, setTab] = useState<TabId>("format");
  const [input, setInput] = useState(`{\n  "hello": "世界",\n  "nums": [1, 2, 3],\n  "nested": { "ok": true }\n}`);
  const [diffLeft, setDiffLeft] = useState("");
  const [diffRight, setDiffRight] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const validation = useMemo(() => {
    try {
      JSON.parse(input);
      return { ok: true as const };
    } catch (e) {
      const err = e as SyntaxError;
      const match = /position (\d+)/i.exec(err.message);
      const pos = match ? Number(match[1]) : undefined;
      const loc =
        pos !== undefined && !Number.isNaN(pos) ? parsePosition(input, pos) : undefined;
      return {
        ok: false as const,
        message: err.message,
        line: loc?.line,
        column: loc?.column,
      };
    }
  }, [input]);

  const diffResult = useMemo(() => {
    if (!diffLeft.trim() && !diffRight.trim()) {
      return { status: "empty" as const };
    }
    try {
      const leftObj = JSON.parse(diffLeft);
      const rightObj = JSON.parse(diffRight);
      const leftNorm = JSON.stringify(sortKeysDeep(leftObj), null, 2);
      const rightNorm = JSON.stringify(sortKeysDeep(rightObj), null, 2);
      if (leftNorm === rightNorm) {
        return { status: "same" as const };
      }
      const line = findFirstDiffLine(leftNorm, rightNorm);
      return { status: "diff" as const, line };
    } catch (e) {
      return { status: "error" as const, message: (e as Error).message };
    }
  }, [diffLeft, diffRight]);

  const tsDraft = useMemo(() => {
    try {
      const data = JSON.parse(input);
      return jsonToTsTypes(data, "Root");
    } catch {
      return `// ${t("extras.tsParseError")}`;
    }
  }, [input, t]);

  const handleFormat = (indent: number) => {
    try {
      setInput(formatJson(input, indent));
      showToast(t("toast.formatted", { indent }));
    } catch {
      showToast(t("toast.formatFail"));
    }
  };

  const handleMinify = () => {
    try {
      setInput(JSON.stringify(JSON.parse(input)));
      showToast(t("toast.minified"));
    } catch {
      showToast(t("toast.minifyFail"));
    }
  };

  const handleSortKeys = () => {
    try {
      const parsed = JSON.parse(input);
      setInput(JSON.stringify(sortKeysDeep(parsed), null, 2));
      showToast(t("toast.sorted"));
    } catch {
      showToast(t("toast.sortFail"));
    }
  };

  const handleEscapeUnicode = () => {
    try {
      const s = JSON.stringify(JSON.parse(input));
      setInput(s);
      showToast(t("toast.escaped"));
    } catch {
      showToast(t("toast.needJson"));
    }
  };

  const handleUnescapePretty = () => {
    try {
      const parsed = JSON.parse(input);
      setInput(JSON.stringify(parsed, null, 2));
      showToast(t("toast.prettified"));
    } catch {
      showToast(t("toast.parseFail"));
    }
  };

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-main">
          <p className="eyebrow">{t("hero.eyebrow")}</p>
          <h1>{t("hero.title")}</h1>
          <p className="lede">{t("hero.lede")}</p>
        </div>
        <div className="hero-actions">
          <div className="lang-switch">
            <label htmlFor="locale-select">{t("lang.label")}</label>
            <select
              id="locale-select"
              aria-label={t("lang.pickerAria")}
              title={localeFollowsBrowser ? t("lang.autoHint") : undefined}
              value={localeFollowsBrowser ? LOCALE_SELECT_AUTO : locale}
              onChange={(e) => {
                const v = e.target.value;
                if (v === LOCALE_SELECT_AUTO) setFollowBrowser();
                else setLocale(v as Locale);
              }}
            >
              <option value={LOCALE_SELECT_AUTO}>{t("lang.auto")}</option>
              {supportedLocales.map((code) => (
                <option key={code} value={code}>
                  {localeLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn ghost" onClick={() => copyText(input)}>
            {t("hero.copyEditor")}
          </button>
          <button type="button" className="btn primary" onClick={() => handleFormat(2)}>
            {t("hero.beautify2")}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t("tabsNavAria")}>
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
            title={t(`tabs.${id}.hint`)}
          >
            <span>{t(`tabs.${id}.label`)}</span>
            <small>{t(`tabs.${id}.hint`)}</small>
          </button>
        ))}
      </nav>

      <main className="panel-grid">
        {tab === "format" && (
          <>
            <section className="card stretch">
              <div className="card-head">
                <div>
                  <h2>{t("format.editTitle")}</h2>
                  <p className="muted">{t("format.editHint")}</p>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={() => handleFormat(2)}>
                    {t("format.beautify2")}
                  </button>
                  <button type="button" className="btn" onClick={() => handleFormat(4)}>
                    {t("format.beautify4")}
                  </button>
                  <button type="button" className="btn" onClick={handleMinify}>
                    {t("format.minify")}
                  </button>
                  <button type="button" className="btn" onClick={handleSortKeys}>
                    {t("format.sortKeys")}
                  </button>
                </div>
              </div>
              <textarea
                className="editor"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label={t("format.editorAria")}
              />
            </section>
            <aside className="card side">
              <h3>{t("format.tipsTitle")}</h3>
              <ul className="tips">
                <li>
                  <strong>{t("format.tipSortStrong")}</strong>
                  {t("format.tipSortRest")}
                </li>
                <li>
                  <strong>{t("format.tipMinifyStrong")}</strong>
                  {t("format.tipMinifyRest")}
                </li>
                <li>{t("format.tipLarge")}</li>
              </ul>
            </aside>
          </>
        )}

        {tab === "validate" && (
          <>
            <section className="card stretch">
              <div className="card-head">
                <div>
                  <h2>{t("validate.liveTitle")}</h2>
                  <p className="muted">{t("validate.liveHint")}</p>
                </div>
              </div>
              <textarea
                className="editor"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label={t("validate.editorAria")}
              />
            </section>
            <aside className={`card side status ${validation.ok ? "ok" : "bad"}`}>
              <h3>{validation.ok ? t("validate.pass") : t("validate.issue")}</h3>
              {validation.ok ? (
                <p className="status-msg">{t("validate.okDetail")}</p>
              ) : (
                <>
                  <p className="status-msg">{validation.message}</p>
                  {validation.line !== undefined && (
                    <p className="mono subtle">
                      {t("validate.approxPosition", {
                        line: validation.line,
                        column: validation.column,
                      })}
                    </p>
                  )}
                </>
              )}
            </aside>
          </>
        )}

        {tab === "diff" && (
          <>
            <section className="card">
              <div className="card-head tight">
                <h2>{t("diff.leftTitle")}</h2>
                <button type="button" className="btn ghost sm" onClick={() => copyText(diffLeft)}>
                  {t("diff.copy")}
                </button>
              </div>
              <textarea
                className="editor short"
                spellCheck={false}
                value={diffLeft}
                onChange={(e) => setDiffLeft(e.target.value)}
              />
            </section>
            <section className="card">
              <div className="card-head tight">
                <h2>{t("diff.rightTitle")}</h2>
                <button type="button" className="btn ghost sm" onClick={() => copyText(diffRight)}>
                  {t("diff.copy")}
                </button>
              </div>
              <textarea
                className="editor short"
                spellCheck={false}
                value={diffRight}
                onChange={(e) => setDiffRight(e.target.value)}
              />
            </section>
            <aside className={`card span2 diff-banner ${diffResult.status}`}>
              {diffResult.status === "empty" && <p>{t("diff.empty")}</p>}
              {diffResult.status === "same" && <p>{t("diff.same")}</p>}
              {diffResult.status === "diff" && (
                <p>{t("diff.diffLine", { line: diffResult.line })}</p>
              )}
              {diffResult.status === "error" && (
                <p className="danger">{t("diff.cannotCompare", { message: diffResult.message })}</p>
              )}
            </aside>
          </>
        )}

        {tab === "extras" && (
          <>
            <section className="card stretch">
              <div className="card-head">
                <div>
                  <h2>{t("extras.unicodeTitle")}</h2>
                  <p className="muted">{t("extras.unicodeHint")}</p>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn" onClick={handleEscapeUnicode}>
                    {t("extras.escapeNonAscii")}
                  </button>
                  <button type="button" className="btn" onClick={handleUnescapePretty}>
                    {t("extras.prettifyReadable")}
                  </button>
                </div>
              </div>
              <textarea
                className="editor"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </section>
            <aside className="card side">
              <div className="card-head tight">
                <h3>{t("extras.tsDraft")}</h3>
                <button type="button" className="btn ghost sm" onClick={() => copyText(tsDraft)}>
                  {t("extras.copy")}
                </button>
              </div>
              <pre className="ts-preview">{tsDraft}</pre>
              <p className="muted small">{t("extras.tsFootnote")}</p>
            </aside>
          </>
        )}
      </main>

      <footer className="footer">
        <span className="muted">{t("footer.privacy")}</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function jsonToTsTypes(value: unknown, name: string): string {
  function renderType(v: unknown): string {
    if (v === null) return "null";
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    if (Array.isArray(v)) {
      if (v.length === 0) return "unknown[]";
      const inner = v.map((item) => renderType(item));
      const merged = mergeUnion(inner);
      return `${merged}[]`;
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return "Record<string, never>";
      const lines = entries.map(([key, val]) => {
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
        const rt = renderType(val);
        return `  ${safeKey}: ${rt};`;
      });
      return `{\n${lines.join("\n")}\n}`;
    }
    return "unknown";
  }

  function mergeUnion(parts: string[]): string {
    const uniq = [...new Set(parts)];
    if (uniq.length === 1) return uniq[0];
    return uniq.join(" | ");
  }

  const body = renderType(value);
  return `type ${name} = ${body};`;
}
