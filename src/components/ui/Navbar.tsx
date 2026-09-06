"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useSyncExternalStore, useCallback, useMemo } from "react";
import { getResolvedTheme, setThemePreference, type Theme } from "@/lib/theme";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useToast } from "@/components/ui/Toast";
import { MaintenanceWarningBanner } from "@/components/ui/MaintenanceWarningBanner";

interface NavbarProps {
  user?: { id?: string; name: string; role: string } | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface SearchResult {
  courses:  { id: string; title: string; subject: string; thumbnailUrl?: string | null; teacher: { name: string } }[];
  teachers: { id: string; name: string; teacherProfile?: { slug: string; photoUrl?: string | null } | null }[];
  videos:   { id: string; title: string; folder: { courseId: string; course: { title: string } } }[];
}

const NAV_LINKS = [
  { href: "/",            label: "الرئيسية" },
  { href: "/library",      label: "مكتبتي" },
  { href: "/courses",      label: "الكورسات" },
  { href: "/plans",        label: "الخطط الدراسية" },
  { href: "/environments", label: "بيئات" },
];

const NOTIF_ICON: Record<string, string> = {
  payment_success:  "🎉",
  course_enrollment:"🎓",
  streak_milestone: "🔥",
  exam_live:        "🎯",
  grade_resolved:   "📝",
  ticket_reply:     "💬",
  system:           "📢",
  referral_joined:  "🎁",
  project_graded:   "📋",
};

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("themechange", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("themechange", cb);
  };
}
const getSnapshot       = (): Theme => getResolvedTheme();
const getServerSnapshot = (): Theme => "light";

import { ParentVerificationBanner } from "@/components/ui/ParentVerificationBanner";

function formatStudentName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

export function Navbar({ user: propUser }: NavbarProps) {
  const [fetchedUser, setFetchedUser] = useState<{ id?: string; name: string; role: string } | null>(null);
  const [isCenterMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return (
      host.startsWith("center.") ||
      host.includes("center.code-up.tech") ||
      window.location.search.includes("center=1") ||
      document.cookie.includes("center_mode=1")
    );
  });

  useEffect(() => {
    if (propUser !== undefined) return;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setFetchedUser({ id: d.user.id, name: d.user.name, role: d.user.role });
        } else {
          setFetchedUser(null);
        }
      })
      .catch(() => setFetchedUser(null));
  }, [propUser]);

  const user = propUser !== undefined ? propUser : fetchedUser;

  const pathname = usePathname();
  const router   = useRouter();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<{ streak: number; points: number } | null>(null);

  const { success: toastSuccess } = useToast();
  const notifRef  = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme  = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";
  const cycleTheme = () => setThemePreference(isDark ? "light" : "dark");

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  // Close panels on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (notifRef.current  && !notifRef.current.contains(e.target as Node))  setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Keyboard shortcut CMD+K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
        setNotifOpen(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load notifications when panel opens
  useEffect(() => {
    if (!notifOpen || !user) return;
    setNotifLoading(true);
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { notifications?: Notification[]; unreadCount?: number } | null) => {
        if (!d) return;
        setNotifications(d.notifications ?? []);
        setUnreadCount(d.unreadCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, [notifOpen, user]);

  // Fetch unread count and trigger celebratory notification on student re-entry (at most once per notification)
  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/notifications", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { notifications?: Notification[]; unreadCount?: number } | null) => {
        if (!d) return;
        setUnreadCount(d.unreadCount ?? 0);
        if (d.notifications) setNotifications(d.notifications);

        const latestPayment = d.notifications?.find(
          (n) => n.type === "payment_success" && !n.isRead && (Date.now() - new Date(n.createdAt).getTime()) < 24 * 60 * 60 * 1000
        );
        if (latestPayment && typeof window !== "undefined") {
          const sessionKey = `shown_notif_toast_${latestPayment.id}`;
          if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, "1");
            toastSuccess(latestPayment.title || "🎉 تم استلام وتأكيد دفعتك بنجاح! المحتوى متاح الآن في حسابك.");
          }
        }
      })
      .catch(() => {});
  }, [user?.id, toastSuccess]);

  // Fetch student points and streak
  useEffect(() => {
    if (!user || user.role !== "student") return;
    fetch("/api/student/stats", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { streak?: number; points?: number } | null) => {
        if (d) setStats({ streak: d.streak ?? 0, points: d.points ?? 0 });
      })
      .catch(() => {});
  }, [user]);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "POST", credentials: "include" }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const prev = notifications;
    setNotifications((old) => old.filter((n) => n.id !== id));
    setUnreadCount((c) => {
      const wasUnread = prev.find((n) => n.id === id && !n.isRead);
      return wasUnread ? Math.max(0, c - 1) : c;
    });
    await fetch(`/api/notifications?id=${id}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  };

  const clearAllNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications([]);
    setUnreadCount(0);
    await fetch("/api/notifications?all=true", {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  };

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (r.ok) setSearchResults(await r.json() as SearchResult);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname?.startsWith(href);

  const hasResults = searchResults && (
    searchResults.courses.length > 0 ||
    searchResults.teachers.length > 0 ||
    searchResults.videos.length > 0
  );

  const navLinks = useMemo(() => {
    if (isCenterMode) {
      return NAV_LINKS.filter((l) => l.href !== "/plans");
    }
    return NAV_LINKS;
  }, [isCenterMode]);

  return (
    <>
      <ParentVerificationBanner isStudent={user?.role === "student"} />
      <header
        className="sticky top-0 z-[var(--z-sticky)] bg-[var(--surface)] border-b border-[var(--border)]"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
      <div
        className="max-w-[1320px] mx-auto px-3 sm:px-7 h-[60px] sm:h-[74px] flex justify-between lg:grid lg:grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-[18px]"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center no-underline justify-self-start" aria-label="Code-UP">
          <BrandLogo size={28} showText={true} showTagline={true} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 justify-self-center" role="navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className="no-underline whitespace-nowrap transition-colors"
              style={{ padding: "9px 15px", borderRadius: 10, fontSize: 15, fontWeight: 600,
                color: isActive(link.href) ? "var(--brand)" : "var(--ink-2)",
                background: isActive(link.href) ? "var(--brand-soft)" : "transparent" }}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-[8px] sm:gap-[12px] justify-self-end">
          
          {/* Leaderboard Button (PC View - Top Left - Emoji Only) */}
          <Link
            href="/leaderboard"
            title="لوحة الشرف والمتصدرين"
            aria-label="لوحة الشرف"
            className={`hidden lg:inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] border transition-all no-underline text-lg cursor-pointer ${
              isActive("/leaderboard")
                ? "bg-amber-500/15 border-amber-500/40 shadow-sm"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:border-amber-500/30 hover:bg-amber-500/10"
            }`}
          >
            🏆
          </Link>

          {/* Notification bell */}
          <div ref={notifRef} className="lg:relative">
            <button type="button" onClick={() => { setNotifOpen((o) => !o); setSearchOpen(false); setProfileMenuOpen(false); }}
              aria-label="الإشعارات" aria-expanded={notifOpen}
              className="relative px-3 h-[38px] flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--border)] transition-colors cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="text-[12px] font-black text-[var(--danger)]" style={{ fontFamily: "var(--font-head)" }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full mt-2 rounded-[16px] overflow-hidden z-[var(--z-dropdown)] lg:right-0 lg:left-auto right-3 left-3 lg:w-[320px] w-auto"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
                <div className="flex items-center justify-between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button type="button" onClick={markAllRead} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>
                        قراءة الكل
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button type="button" onClick={clearAllNotifications} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}>
                        مسح الكل
                      </button>
                    )}
                  </div>
                  <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 15, margin: 0, color: "var(--ink)" }}>الإشعارات</h3>
                </div>

                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {notifLoading && (
                    <div className="flex items-center justify-center gap-2 py-8" style={{ color: "var(--ink-3)" }}>
                      <div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
                      <span style={{ fontSize: 13 }}>جارٍ التحميل...</span>
                    </div>
                  )}

                  {!notifLoading && notifications.length === 0 && (
                    <div className="py-10 text-center">
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                      <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: 0 }}>لا توجد إشعارات بعد</p>
                    </div>
                  )}

                  {!notifLoading && notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { if (n.link) router.push(n.link); setNotifOpen(false); }}
                      className={`group flex items-start gap-3 transition-colors ${n.link ? "cursor-pointer" : ""}`}
                      style={{
                        padding: "14px 18px",
                        borderBottom: "1px solid var(--border)",
                        background: n.isRead ? "transparent" : "var(--brand-soft)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = n.isRead ? "transparent" : "var(--brand-soft)"; }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{NOTIF_ICON[n.type] ?? "🔔"}</span>
                      <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 3 }}>{n.title}</div>
                        <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => deleteNotification(e, n.id)}
                          title="حذف هذا الإشعار"
                          className="cursor-pointer text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors p-1 rounded-md hover:bg-[var(--danger-soft)] text-xs leading-none flex items-center justify-center"
                          style={{ border: "none", background: "none" }}
                        >
                          ✕
                        </button>
                        {!n.isRead && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)" }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div ref={searchRef} className="lg:relative">
            <button type="button" onClick={() => { setSearchOpen((o) => !o); setNotifOpen(false); setProfileMenuOpen(false); }}
              aria-label="بحث"
              className="h-[38px] flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--border)] transition-all cursor-pointer px-2 sm:px-3 w-10 sm:w-[135px]">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <span className="hidden sm:inline text-[13px] text-[var(--ink-2)] font-medium">بحث...</span>
              </div>
              <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono text-[10px] font-bold text-[var(--ink)]">
                ⌘K
              </kbd>
            </button>

            {searchOpen && (
              <div className="absolute top-full mt-2 rounded-[16px] overflow-hidden z-[var(--z-dropdown)] lg:right-0 lg:left-auto right-3 left-3 lg:w-[340px] w-auto"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="ابحث عن كورس، مدرس، فيديو..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
                    className="w-full outline-none"
                    style={{ background: "transparent", border: "none", fontSize: 16, color: "var(--ink)", fontFamily: "var(--font-body)" }}
                    dir="rtl"
                  />
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {searching && (
                    <div className="flex items-center justify-center gap-2 py-6" style={{ color: "var(--ink-3)" }}>
                      <div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
                      <span style={{ fontSize: 13 }}>جارٍ البحث...</span>
                    </div>
                  )}
                  {!searching && searchQuery.length >= 2 && !hasResults && (
                    <div className="py-8 text-center" style={{ color: "var(--ink-3)", fontSize: 13 }}>لا توجد نتائج لـ «{searchQuery}»</div>
                  )}
                  {!searching && hasResults && (
                    <>
                      {searchResults!.courses.length > 0 && (
                        <div style={{ padding: "10px 14px 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px", letterSpacing: 1 }}>الكورسات</p>
                          {searchResults!.courses.map((c) => (
                            <Link key={c.id} href={`/courses/${c.id}`} onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 no-underline rounded-[10px] transition-colors"
                              style={{ padding: "9px 10px", marginBottom: 4 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-soft)", fontSize: 16 }}>📚</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{c.subject} · {c.teacher.name}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults!.videos.length > 0 && (
                        <div style={{ padding: "6px 14px 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px", letterSpacing: 1 }}>الفيديوهات</p>
                          {searchResults!.videos.map((v) => (
                            <Link key={v.id} href={`/courses/${v.folder.courseId}/learn`} onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 no-underline rounded-[10px] transition-colors"
                              style={{ padding: "9px 10px", marginBottom: 4 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--gold-soft)", fontSize: 16 }}>▶️</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
                                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{v.folder.course.title}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults!.teachers.length > 0 && (
                        <div style={{ padding: "6px 14px 12px" }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px", letterSpacing: 1 }}>المعلمون</p>
                          {searchResults!.teachers.map((t) => (
                            <Link key={t.id} href={t.teacherProfile ? `/${t.teacherProfile.slug}` : "#"} onClick={() => setSearchOpen(false)}
                              className="flex items-center gap-3 no-underline rounded-[10px] transition-colors"
                              style={{ padding: "9px 10px", marginBottom: 4 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <span className="flex items-center justify-center shrink-0 font-bold text-white" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--brand)", fontSize: 14 }}>{t.name[0]}</span>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t.name}</div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!searching && searchQuery.length < 2 && (
                    <div className="py-6 text-center" style={{ color: "var(--ink-3)", fontSize: 13 }}>اكتب كلمتين أو أكثر للبحث</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User profile / auth */}
          {user ? (
            <div ref={profileMenuRef} className="relative shrink-0">
              <button type="button" onClick={() => { setProfileMenuOpen((o) => !o); setNotifOpen(false); setSearchOpen(false); }}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] no-underline cursor-pointer hover:bg-[var(--border)] transition-colors h-[38px] max-w-[170px] sm:max-w-[210px] px-2 sm:px-3"
                title={user.name}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 800, fontSize: 14 }}>
                  {user.name?.[0] ?? "م"}
                </span>
                <span style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600 }} className="hidden sm:inline truncate whitespace-nowrap">
                  {formatStudentName(user.name)}
                </span>
                <span className="text-[10px] text-[var(--ink-3)] transition-transform duration-200 shrink-0" style={{ transform: profileMenuOpen ? "rotate(180deg)" : "rotate(0)" }}>
                  ▼
                </span>
              </button>

              {profileMenuOpen && (
                <div className="absolute left-0 mt-2 w-[220px] rounded-[16px] overflow-hidden z-[var(--z-dropdown)]"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
                  dir="rtl">
                  <div style={{ padding: "6px" }}>
                    <div className="px-3 py-2 border-b border-[var(--border)] mb-1 sm:hidden">
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{user.role === "student" ? "طالب" : "معلم"}</div>
                    </div>

                    <Link href="/account" onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-3 no-underline rounded-[10px] transition-colors hover:bg-[var(--surface-2)] text-[var(--ink)]"
                      style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                      <span style={{ fontSize: 16 }}>👤</span>
                      <span>حسابي</span>
                    </Link>

                    {user.role === "student" && (
                      <>
                        <Link href="/environments" onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-3 no-underline rounded-[10px] transition-colors hover:bg-[var(--surface-2)] text-[var(--ink)]"
                          style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 16 }}>🔬</span>
                          <span>بيئات التعلم</span>
                        </Link>

                        <Link href="/leaderboard" onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-3 no-underline rounded-[10px] transition-colors hover:bg-[var(--surface-2)] text-[var(--ink)]"
                          style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 16 }}>🏆</span>
                          <span>الإنجازات</span>
                        </Link>

                        <div className="flex items-center gap-3 rounded-[10px] text-[var(--ink)]"
                          style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 16 }}>🔥</span>
                          <span>سلسلة المواظبة: <strong style={{ color: "var(--brand)" }}>{stats?.streak ?? 0}</strong></span>
                        </div>

                        <div className="flex items-center gap-3 rounded-[10px] text-[var(--ink)]"
                          style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 16 }}>⭐</span>
                          <span>النقاط: <strong style={{ color: "var(--gold-2)" }}>{stats?.points ?? 0}</strong></span>
                        </div>
                      </>
                    )}

                    <Link href="/account" onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-3 no-underline rounded-[10px] transition-colors hover:bg-[var(--surface-2)] text-[var(--ink)]"
                      style={{ padding: "10px 12px", fontSize: 14.5, fontWeight: 600 }}>
                      <span style={{ fontSize: 16 }}>⚙️</span>
                      <span>الإعدادات</span>
                    </Link>

                    <button type="button" onClick={cycleTheme}
                      className="w-full flex items-center gap-3 rounded-[10px] transition-colors hover:bg-[var(--surface-2)] text-[var(--ink)] text-right cursor-pointer"
                      style={{ padding: "10px 12px", border: "none", background: "none", fontSize: 14.5, fontWeight: 600 }}>
                      <span style={{ fontSize: 16 }}>{isDark ? "☀️" : "🌙"}</span>
                      <span>{isDark ? "المظهر الفاتح" : "المظهر الداكن"}</span>
                    </button>

                    <div style={{ height: "1px", background: "var(--border)", margin: "4px 8px" }} />

                    <button
                      type="button"
                      onClick={() => { handleLogout(); setProfileMenuOpen(false); }}
                      className="w-full flex items-center gap-3 rounded-[10px] transition-colors hover:bg-[var(--danger-soft)] text-[var(--danger)] text-right cursor-pointer"
                      style={{ padding: "10px 12px", border: "none", background: "none", fontSize: 14.5, fontWeight: 700 }}
                    >
                      <span style={{ fontSize: 16 }}>🚪</span>
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5">
              <Link href="/login" style={{ padding: "9px 14px", fontSize: 14, fontWeight: 600, color: "var(--ink-2)", textDecoration: "none" }}>دخول</Link>
              <Link href="/signup" className="hover:opacity-90 transition-opacity"
                style={{ padding: "9px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: "var(--brand)", color: "#fff", textDecoration: "none" }}>
                إنشاء حساب
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
    <MaintenanceWarningBanner />
    </>
  );
}
