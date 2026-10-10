"use client";

import "@/components/admin/ui/admin.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  CornerDownLeft,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Users,
  Video,
  Wallet,
  X,
  ClipboardCheck,
  Landmark,
} from "lucide-react";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { AdminActionPasswordBar } from "@/components/admin/AdminActionPasswordBar";
import { MaintenanceWarningBanner } from "@/components/ui/MaintenanceWarningBanner";
import {
  findSection,
  getSuperadminHubs,
  getTeacherHubs,
  normalizeSearch,
  type NavHub,
  type NavSection,
} from "@/components/admin/admin-nav";
import { Badge, DialogHost } from "@/components/admin/ui/kit";

export type { NavHub, NavSection } from "@/components/admin/admin-nav";

interface ClassicAdminShellProps {
  role: "superadmin" | "admin" | "staff" | "teacher" | "assistant";
  activeSection: string;
  setActiveSection: (id: string) => void;
  onLogout: () => void;
  isOwner?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onOpenMoneyControl?: () => void;
  allowedSectionIds?: string[] | null;
  children: React.ReactNode;
}

const COLLAPSE_KEY = "adm_nav_collapsed";

const ROLE_LABEL: Record<ClassicAdminShellProps["role"], string> = {
  superadmin: "المشرف العام",
  admin: "مشرف",
  staff: "موظف",
  teacher: "معلم",
  assistant: "مساعد معلم",
};

export function ClassicAdminShell({
  role,
  activeSection,
  setActiveSection,
  onLogout,
  isOwner,
  headerTitle = "لوحة التحكم",
  headerSubtitle = "منصة Code-UP",
  onRefresh,
  refreshing,
  onOpenMoneyControl,
  allowedSectionIds,
  children,
}: ClassicAdminShellProps) {
  const isTeacherSide = role === "teacher" || role === "assistant";

  const hubs = useMemo<NavHub[]>(() => {
    const base = isTeacherSide ? getTeacherHubs() : getSuperadminHubs({ isOwner, role });
    const keep = (s: NavSection) => {
      if (allowedSectionIds) return allowedSectionIds.includes(s.id);
      if (role === "assistant") return s.id !== "assistants" && s.id !== "my-page";
      return true;
    };
    return base.map((h) => ({ ...h, sections: h.sections.filter(keep) })).filter((h) => h.sections.length > 0);
  }, [isTeacherSide, isOwner, role, allowedSectionIds]);

  const current = findSection(hubs, activeSection);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* private mode */
    }
  }, []);
  const toggleHub = (id: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const go = useCallback(
    (id: string) => {
      setActiveSection(id);
      setDrawerOpen(false);
      setPaletteOpen(false);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [setActiveSection]
  );

  // Ctrl/⌘ + K opens the section search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dock = useMemo(() => {
    const want = isTeacherSide
      ? [
          { id: "dashboard", label: "الرئيسية", icon: <LayoutDashboard size={20} /> },
          { id: "courses", label: "الكورسات", icon: <Video size={20} /> },
          { id: "review", label: "التصحيح", icon: <ClipboardCheck size={20} /> },
          { id: "teacher-subscriptions", label: "الطلاب", icon: <Users size={20} /> },
        ]
      : [
          { id: "overview", label: "الرئيسية", icon: <LayoutDashboard size={20} /> },
          { id: "students", label: "المتعلمون", icon: <GraduationCap size={20} /> },
          { id: "wallet", label: "المحافظ", icon: <Wallet size={20} /> },
          role === "superadmin"
            ? { id: "ai-copilot", label: "المساعد", icon: <Bot size={20} /> }
            : { id: "teachers", label: "المعلمون", icon: <Users size={20} /> },
        ];
    return want.filter((d) => findSection(hubs, d.id));
  }, [hubs, isTeacherSide, role]);

  const brand = (
    <div className="adm-brand">
      <span className="adm-brand-mark" aria-hidden>C</span>
      <div className="min-w-0">
        <div className="adm-brand-title truncate">{headerTitle}</div>
        <div className="adm-brand-sub truncate">
          {ROLE_LABEL[role]} · {headerSubtitle}
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="adm adm-shell">
      {/* Desktop sidebar */}
      <aside className="adm-side" aria-label="أقسام لوحة التحكم">
        {brand}
        <div className="px-3 pb-1">
          <SearchTrigger onOpen={() => setPaletteOpen(true)} />
        </div>
        <div className="adm-side-scroll">
          <NavTree hubs={hubs} active={activeSection} collapsed={collapsed} onToggle={toggleHub} onGo={go} />
        </div>
        <div className="adm-side-foot">
          <button type="button" onClick={onLogout} className="adm-nav-item">
            <LogOut size={17} aria-hidden />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="adm-top">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="adm-btn is-ghost is-icon lg:hidden"
            aria-label="فتح القائمة"
            aria-expanded={drawerOpen}
          >
            <Menu size={20} />
          </button>

          <nav aria-label="المسار" className="adm-crumbs">
            {current ? (
              <>
                <span className="hidden sm:inline whitespace-nowrap">{current.hub.title}</span>
                <span className="hidden sm:inline" aria-hidden>/</span>
                <b aria-current="page">{current.section.label}</b>
              </>
            ) : (
              <b>{headerTitle}</b>
            )}
          </nav>

          <div className="adm-top-actions">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="adm-btn is-ghost is-icon lg:hidden"
              aria-label="بحث في الأقسام"
            >
              <Search size={18} />
            </button>
            {role === "superadmin" && <AdminActionPasswordBar />}
            {onOpenMoneyControl && (
              <button type="button" onClick={onOpenMoneyControl} className="adm-btn is-sm" title="نسب الأرباح والمصروفات">
                <Landmark size={15} aria-hidden />
                <span className="hidden md:inline">الأرباح والمصروفات</span>
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="adm-btn is-ghost is-icon"
                aria-label="تحديث البيانات"
                title="تحديث البيانات"
              >
                <RefreshCw size={17} className={refreshing ? "adm-spin" : undefined} />
              </button>
            )}
            <DarkModeToggle />
          </div>
        </header>

        <MaintenanceWarningBanner />

        <main className="adm-main classic-admin-surface" id="admin-main">
          <div className="adm-main-inner">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile dock */}
      <nav className="adm-dock" aria-label="تنقل سريع">
        {dock.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => go(d.id)}
            className="adm-dock-btn"
            aria-current={activeSection === d.id ? "page" : undefined}
          >
            <span className="adm-dock-icon">{d.icon}</span>
            {d.label}
          </button>
        ))}
        <button type="button" onClick={() => setDrawerOpen(true)} className="adm-dock-btn">
          <span className="adm-dock-icon"><Menu size={20} /></span>
          كل الأقسام
        </button>
      </nav>

      {drawerOpen && (
        <Drawer onClose={() => setDrawerOpen(false)}>
          <div className="flex items-center justify-between pe-2">
            {brand}
            <button type="button" onClick={() => setDrawerOpen(false)} className="adm-btn is-ghost is-icon" aria-label="إغلاق القائمة">
              <X size={18} />
            </button>
          </div>
          <div className="px-3 pb-1">
            <SearchTrigger
              onOpen={() => {
                setDrawerOpen(false);
                setPaletteOpen(true);
              }}
            />
          </div>
          <div className="adm-side-scroll">
            <NavTree hubs={hubs} active={activeSection} collapsed={{}} onToggle={() => {}} onGo={go} flat />
          </div>
          <div className="adm-side-foot">
            <button type="button" onClick={onLogout} className="adm-nav-item">
              <LogOut size={17} aria-hidden />
              تسجيل الخروج
            </button>
          </div>
        </Drawer>
      )}

      <DialogHost />

      {paletteOpen && <CommandPalette hubs={hubs} active={activeSection} onGo={go} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────────── */

function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="adm-search-trigger" aria-haspopup="dialog">
      <Search size={15} aria-hidden />
      <span>ابحث عن قسم…</span>
      <kbd className="adm-kbd hidden lg:inline">Ctrl K</kbd>
    </button>
  );
}

function NavTree({
  hubs,
  active,
  collapsed,
  onToggle,
  onGo,
  flat = false,
}: {
  hubs: NavHub[];
  active: string;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  onGo: (id: string) => void;
  flat?: boolean;
}) {
  return (
    <>
      {hubs.map((hub) => {
        const hasActive = hub.sections.some((s) => s.id === active);
        // The group holding the current page never hides it.
        const open = flat || hasActive || !collapsed[hub.id];
        const listId = `adm-hub-${hub.id}`;
        return (
          <div key={hub.id} className="adm-nav-group">
            {hubs.length > 1 &&
              (flat ? (
                <div className="adm-nav-group-btn" style={{ cursor: "default" }}>{hub.title}</div>
              ) : (
                <button
                  type="button"
                  className="adm-nav-group-btn"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => onToggle(hub.id)}
                  disabled={hasActive}
                  title={hasActive ? undefined : open ? "طي المجموعة" : "إظهار المجموعة"}
                >
                  <span>{hub.title}</span>
                  {!hasActive && <ChevronDown size={14} aria-hidden />}
                </button>
              ))}
            {open && (
              <div id={listId}>
                {hub.sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="adm-nav-item"
                    aria-current={active === s.id ? "page" : undefined}
                    onClick={() => onGo(s.id)}
                  >
                    {s.icon}
                    <span className="truncate">{s.label}</span>
                    {s.badge != null && (
                      <Badge tone={s.badgeTone ?? "neutral"} live={s.badgeTone === "bad"}>
                        {s.badge}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function useDialogBehaviour(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}

function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useDialogBehaviour(onClose);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: false });
  }, [ref]);
  return (
    <>
      <div className="adm-overlay lg:hidden" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="أقسام لوحة التحكم" className="adm-drawer lg:hidden">
        {children}
      </div>
    </>
  );
}

function CommandPalette({
  hubs,
  active,
  onGo,
  onClose,
}: {
  hubs: NavHub[];
  active: string;
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useDialogBehaviour(onClose);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const nq = normalizeSearch(q);
    const out: Array<{ hub: NavHub; section: NavSection }> = [];
    for (const hub of hubs) {
      for (const section of hub.sections) {
        if (!nq) {
          out.push({ hub, section });
          continue;
        }
        const hay = normalizeSearch(`${section.label} ${hub.title} ${section.keywords ?? ""} ${section.id}`);
        if (nq.split(/\s+/).every((w) => hay.includes(w))) out.push({ hub, section });
      }
    }
    return out;
  }, [q, hubs]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) onGo(hit.section.id);
    }
  };

  let lastHub = "";
  return (
    <>
      <div className="adm-overlay" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="بحث في الأقسام" className="adm-palette" dir="rtl">
        <div className="relative">
          <Search size={17} className="absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 16, color: "var(--ink-3)" }} aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اكتب اسم القسم: طلاب، محفظة، أخطاء، wallet…"
            className="adm-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="adm-palette-list"
            aria-activedescendant={results[cursor] ? `adm-pal-${results[cursor].section.id}` : undefined}
          />
        </div>
        <div ref={listRef} id="adm-palette-list" role="listbox" className="adm-palette-list">
          {results.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              لا يوجد قسم بهذا الاسم
            </p>
          ) : (
            results.map((r, idx) => {
              const header = r.hub.id !== lastHub ? r.hub.title : null;
              lastHub = r.hub.id;
              return (
                <React.Fragment key={r.section.id}>
                  {header && <div className="adm-palette-group">{header}</div>}
                  <button
                    type="button"
                    id={`adm-pal-${r.section.id}`}
                    role="option"
                    aria-selected={idx === cursor}
                    data-idx={idx}
                    data-active={idx === cursor}
                    className="adm-palette-item"
                    onMouseMove={() => setCursor(idx)}
                    onClick={() => onGo(r.section.id)}
                  >
                    {r.section.icon}
                    <span>{r.section.label}</span>
                    {r.section.id === active ? <small>أنت هنا</small> : idx === cursor ? <CornerDownLeft size={14} style={{ marginInlineStart: "auto" }} aria-hidden /> : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--ink-3)" }}>
          <span><kbd className="adm-kbd">↑</kbd> <kbd className="adm-kbd">↓</kbd> للتنقل</span>
          <span><kbd className="adm-kbd">Enter</kbd> للفتح</span>
          <span><kbd className="adm-kbd">Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </>
  );
}
