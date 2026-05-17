import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  LOCALES,
  LOCALE_LABELS,
  messages,
  type Locale,
  type Messages,
} from "./messages";

function resolveMessage(tree: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number | undefined>,
): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined ? "" : String(v);
  });
}

/** 按浏览器 preferred languages 顺序匹配本站支持的界面语言 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "zh-CN";
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(
    (code): code is string => typeof code === "string" && code.length > 0,
  );
  for (const raw of candidates) {
    const code = raw.toLowerCase().replace(/_/g, "-");
    if (code === "zh-tw" || code.startsWith("zh-tw-")) return "zh-TW";
    if (code === "zh-hk" || code.startsWith("zh-hk-")) return "zh-TW";
    if (code === "zh-mo" || code.startsWith("zh-mo-")) return "zh-TW";
    if (code.startsWith("zh")) return "zh-CN";
    if (code.startsWith("ja")) return "ja";
    if (code.startsWith("ko")) return "ko";
    if (code.startsWith("en")) return "en";
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("de")) return "de";
    if (code.startsWith("es")) return "es";
    if (code.startsWith("pt")) return "pt-BR";
    if (code.startsWith("ru")) return "ru";
    if (code.startsWith("vi")) return "vi";
  }
  return "zh-CN";
}

function readManualLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v && LOCALES.includes(v as Locale)) return v as Locale;
  } catch {
    /* ignore */
  }
  return null;
}

type I18nContextValue = {
  /** 当前生效语言（手动优先，否则为浏览器识别） */
  locale: Locale;
  /** 未手动固定时为 true，会随浏览器 / 系统语言变化更新 */
  localeFollowsBrowser: boolean;
  setLocale: (locale: Locale) => void;
  /** 清除手动选择，按浏览器语言列表自动匹配 */
  setFollowBrowser: () => void;
  t: (path: string, vars?: Record<string, string | number | undefined>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [manualLocale, setManualLocale] = useState<Locale | null>(readManualLocale);
  const [browserLocale, setBrowserLocale] = useState<Locale>(detectBrowserLocale);

  const localeFollowsBrowser = manualLocale === null;
  const locale = manualLocale ?? browserLocale;

  useEffect(() => {
    if (!localeFollowsBrowser) return;
    const syncFromBrowser = () => setBrowserLocale(detectBrowserLocale());
    syncFromBrowser();
    window.addEventListener("languagechange", syncFromBrowser);
    return () => window.removeEventListener("languagechange", syncFromBrowser);
  }, [localeFollowsBrowser]);

  const bundle = messages[locale];

  const setLocale = useCallback((next: Locale) => {
    setManualLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setFollowBrowser = useCallback(() => {
    setManualLocale(null);
    setBrowserLocale(detectBrowserLocale());
    try {
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number | undefined>) => {
      const raw = resolveMessage(bundle, path) ?? resolveMessage(messages.en, path) ?? path;
      return interpolate(raw, vars);
    },
    [bundle],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = bundle.meta.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", bundle.meta.description);
  }, [bundle.meta.description, bundle.meta.title, locale]);

  const value = useMemo(
    () => ({
      locale,
      localeFollowsBrowser,
      setLocale,
      setFollowBrowser,
      t,
    }),
    [locale, localeFollowsBrowser, setFollowBrowser, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function localeLabel(locale: Locale): string {
  return LOCALE_LABELS[locale];
}

export const supportedLocales = LOCALES;
