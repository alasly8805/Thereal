/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs */
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/ui/Navbar";
import { useToast } from "@/components/ui/Toast";
import { SecurePlayer } from "@/components/ui/SecurePlayer";
import { VideoGuard } from "@/components/ui/VideoGuard";
import { usePositionSaver } from "@/lib/use-position-saver";
import { VideoQuestionModal } from "@/components/player/VideoQuestionModal";
import { VideoQuestionOverlay } from "@/components/player/VideoQuestionOverlay";
import { AmbientBackdrop } from "@/components/player/AmbientBackdrop";
import { studentHomeworkNotice } from "@/lib/homework-student-status";

// ─── Types ──────────────────────────────────────────────────────────────────

type VideoItem = {
  id: string;
  title: string;
  durationMinutes?: number;
  maxWatchesPerUser?: number;
  usedWatches?: number;
  grantedViews?: number;
  progress?: Array<{ watched: boolean; watchedAt?: string | null; lastPositionSeconds?: number }>;
  publishAt?: string | null;
  // Teacher-panel chain (مسار وفتح المحتوى) evaluation — present when the
  // course has prerequisite edges; chainLockedBy is the blocking item's title.
  chainLocked?: boolean;
  chainLockedBy?: string | null;
};

type MaterialItem = {
  id: string;
  title: string;
  url: string;
  type: string;
  chainLocked?: boolean;
  chainLockedBy?: string | null;
};

type QuizItem = {
  id: string;
  title: string;
  timeLimitMinutes: number;
  chainLocked?: boolean;
  chainLockedBy?: string | null;
  timedClosed?: boolean;
  myResult?: { score: number; totalQ: number; completedAt?: string | null; allowRetake?: boolean } | null;
};

type HomeworkItem = {
  id: string;
  title: string;
  type: string;
  isPublished?: boolean;
  timeLimitMinutes?: number;
  mySubmission?: {
    id: string;
    status: string;
    score?: number | null;
    totalQ?: number;
    allowRetake?: boolean;
    completedAt?: string | null;
    review?: { verdict?: string | null; reviewedAt?: string | null } | null;
  } | null;
  chainLocked?: boolean;
  chainLockedBy?: string | null;
  timedClosed?: boolean;
};

type FolderContentEntry =
  | { contentType: "VIDEO"; contentId: string; order: number; video: VideoItem }
  | { contentType: "HOMEWORK"; contentId: string; order: number; homework: HomeworkItem }
  | { contentType: "EXAM"; contentId: string; order: number; exam: QuizItem }
  | { contentType: "ATTACHMENT"; contentId: string; order: number; attachment: MaterialItem };

type FolderItem = {
  id: string;
  name: string;
  color?: string | null;
  publishAt?: string | null;
  videos: VideoItem[];
  materials: MaterialItem[];
  quizzes: QuizItem[];
  homeworks?: HomeworkItem[];
  contents?: FolderContentEntry[];
};

type CourseData = {
  id: string;
  title: string;
  subject: string;
  description?: string | null;
  teacher: { id: string; name: string };
  homeworkUrl?: string | null;
  sequentialAccess?: boolean;
  maxWatchCount?: number;
  folders: FolderItem[];
};

type PlayerState = {
  videoId: string;
  sessionToken: string;
  embedUrl: string;
  expiresAt: string;
  provider: string;
  startedAt: string;
  durationMinutes: number;
  startSeconds?: number;
  watchSessionId?: string;
  drm?: unknown;
};

type QuestionItem = {
  id: string;
  timestamp?: number;
  triggerSecond: number;
  mode: string; // "pause" | "overlay"
  question?: string;
  questionText: string;
  options?: string[];
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  isRequired?: boolean;
  refireOnRewatch?: boolean;
  answered?: boolean;
  isCorrect?: boolean;
  attempts?: number;
  correctOption?: string;
  explanation?: string;
};

// ─── Icons ──────────────────────────────────────────────────────────────────

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconChevron({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}


function IconQuiz({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconLink({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ─── Progress ring ───────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 44, stroke = 3.5 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#38bdf8"
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function fmtCountdown(expiresAt: string, nowMs?: number) {
  const diff = new Date(expiresAt).getTime() - (nowMs ?? Date.now());
  if (diff <= 0) return "00:00:00";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  
  if (d > 0) {
    return `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


// ─── Watch slots bar ─────────────────────────────────────────────────────────

function WatchSlots({ used, total }: { used: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${i < used ? "bg-(--brand)/70" : "bg-[var(--border)]"}`}
        />
      ))}
    </div>
  );
}

/** Videos in the order the sidebar shows them: folder by folder, contents order. */
function orderedLessons(course: { folders: FolderItem[] }): VideoItem[] {
  return course.folders.flatMap((f) =>
    f.contents && f.contents.length
      ? f.contents.flatMap((entry) => (entry.contentType === "VIDEO" ? [entry.video] : []))
      : f.videos
  );
}

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CourseLearningPage() {
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const searchParams = useSearchParams();
  const paramVideoId = searchParams.get("videoId");

  const [course, setCourse] = useState<CourseData | null>(null);
  const [chainActive, setChainActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [accessBlock, setAccessBlock] = useState<{
    message: string;
    teacher: boolean;
    isRenewalRequired?: boolean;
    renewalMonth?: number | null;
    teacherId?: string | null;
  } | null>(null);
  const [isTeacherPreview, setIsTeacherPreview] = useState(false);
  const [inIframe, setInIframe] = useState(true);
  const [user, setUser] = useState<{ name: string; role: string; phone?: string | null } | null>(null);

  useEffect(() => {
    setInIframe(window.self !== window.top);
  }, []);

  // Sidebar
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [navOpen, setNavOpen] = useState(false); // mobile lesson drawer
  // Desktop only: hide the lesson list so the video takes the whole width.
  const [theater, setTheater] = useState(false);
  // Coloured glow around the video on wide screens (runs in the browser only).
  const [ambient, setAmbient] = useState(true);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesFlag, setNotesFlag] = useState<Record<string, boolean>>({});
  const [markThreshold, setMarkThreshold] = useState(60); // % watched; superadmin-configurable

  // Player
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [countdown, setCountdown] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Watch modal
  const [modalVideo, setModalVideo] = useState<{ id: string; title: string } | null>(null);
  const [watching, setWatching] = useState(false);

  // Resume Position and Timed Questions state
  const [savedPosition, setSavedPosition] = useState<number>(0);
  const [fetchingPosition, setFetchingPosition] = useState(false);
  const [playerPaused, setPlayerPaused] = useState(false);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [firedQuestionIds, setFiredQuestionIds] = useState<Set<string>>(new Set());
  const [activeQuestion, setActiveQuestion] = useState<QuestionItem | null>(null);
  const [activeOverlayQuestion, setActiveOverlayQuestion] = useState<QuestionItem | null>(null);
  const playerTimeRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Anti-skip calculation: find the earliest unanswered required question
  const earliestUnansweredQuestion = useMemo(() => {
    const unanswered = questions.filter(
      (q) => !answeredQuestionIds.has(q.id) && q.isRequired !== false
    );
    if (!unanswered.length) return null;
    return unanswered.reduce((minQ, q) => {
      const qT = q.triggerSecond ?? q.timestamp ?? 0;
      const minT = minQ.triggerSecond ?? minQ.timestamp ?? 0;
      return qT < minT ? q : minQ;
    }, unanswered[0]);
  }, [questions, answeredQuestionIds]);

  const maxAllowedSecond = useMemo(() => {
    if (!earliestUnansweredQuestion) return null;
    return earliestUnansweredQuestion.triggerSecond ?? earliestUnansweredQuestion.timestamp ?? 0;
  }, [earliestUnansweredQuestion]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const flatVideos = useMemo(() => course?.folders.flatMap((f) => f.videos) ?? [], [course]);

  const totalVideos = flatVideos.length;
  const watchedCount = useMemo(
    () => flatVideos.filter((v) => v.progress?.some((p) => p.watched)).length,
    [flatVideos]
  );
  const progressPct = totalVideos > 0 ? Math.round((watchedCount / totalVideos) * 100) : 0;

  const isWatched = (v: VideoItem) => v.progress?.some((p) => p.watched) ?? false;

  // Sequential lock. When the teacher set up a content chain (مسار وفتح
  // المحتوى), the server-evaluated chain decides — the next content to unlock
  // is exactly what the chain declares, not the previous row in display order.
  // Courses without any chain edges keep the legacy previous-video rule.
  const isLocked = useCallback(
    (videoId: string) => {
      if (isTeacherPreview) return false;
      if (chainActive) {
        const video = flatVideos.find((v) => v.id === videoId);
        return !!video?.chainLocked;
      }
      // Teacher can allow free navigation — then nothing is locked.
      if (course?.sequentialAccess === false) return false;
      const idx = flatVideos.findIndex((v) => v.id === videoId);
      if (idx <= 0) return false;
      return !flatVideos[idx - 1].progress?.some((p) => p.watched);
    },
    [flatVideos, course?.sequentialAccess, isTeacherPreview, chainActive]
  );

  const activeVideo = flatVideos.find((v) => v.id === activeVideoId) ?? null;
  // Same order as the sidebar (folder contents), for previous / next.
  const lessonOrder = useMemo(() => (course ? orderedLessons(course) : []), [course]);
  const activeIndex = lessonOrder.findIndex((v) => v.id === activeVideoId);
  const prevLesson = activeIndex > 0 ? lessonOrder[activeIndex - 1] : null;
  const nextLesson = activeIndex >= 0 && activeIndex < lessonOrder.length - 1 ? lessonOrder[activeIndex + 1] : null;

  useEffect(() => {
    try {
      setTheater(window.localStorage.getItem("learn-theater") === "1");
      setAmbient(window.localStorage.getItem("learn-ambient") !== "0");
    } catch {
      // storage blocked: default layout
    }
  }, []);
  const toggleTheater = () => {
    setTheater((t) => {
      try {
        window.localStorage.setItem("learn-theater", t ? "0" : "1");
      } catch {
        // ignore
      }
      return !t;
    });
  };
  const toggleAmbient = () => {
    setAmbient((on) => {
      try {
        window.localStorage.setItem("learn-ambient", on ? "0" : "1");
      } catch {
        // ignore
      }
      return !on;
    });
  };

  const toolbarProps = activeVideo
    ? {
        prev: prevLesson,
        next: nextLesson,
        emphasizeNext: isWatched(activeVideo),
        onSelect: (id: string) => {
          setActiveVideoId(id);
          setNotesOpen(false);
        },
        notesOpen,
        onToggleNotes: () => setNotesOpen((o) => !o),
        hasNotes: notesFlag[activeVideo.id] ?? Boolean(readLessonNotes(activeVideo.id)),
        theater,
        onToggleTheater: toggleTheater,
        ambient,
        onToggleAmbient: toggleAmbient,
      }
    : null;

  const onNotesSaved = useCallback(
    (has: boolean) => {
      if (!activeVideoId) return;
      setNotesFlag((m) => (m[activeVideoId] === has ? m : { ...m, [activeVideoId]: has }));
    },
    [activeVideoId]
  );
  const activeFolder = course?.folders.find((f) => f.videos.some((v) => v.id === activeVideoId)) ?? null;
  const isPlayerActive = player?.videoId === activeVideoId;

  const getScheduledUnlockTime = useCallback(
    (videoId: string) => {
      const video = flatVideos.find((v) => v.id === videoId);
      if (!video) return null;
      const folder = course?.folders.find((f) => f.videos.some((v) => v.id === videoId));
      
      const vTime = video.publishAt ? new Date(video.publishAt).getTime() : 0;
      const fTime = folder?.publishAt ? new Date(folder.publishAt).getTime() : 0;
      const maxTime = Math.max(vTime, fTime);
      
      if (maxTime > now) return new Date(maxTime).toISOString();
      return null;
    },
    [flatVideos, course, now]
  );

  // Per-video watch counts. grantedViews is what support/teacher added on top
  // of the lesson's base limit — without it, extra watches never unlock play.
  const videoAllowance = (v: VideoItem) =>
    (v.maxWatchesPerUser ?? 3) + (v.grantedViews ?? 0);
  const videoRemainingWatches = (v: VideoItem) =>
    isTeacherPreview ? 999 : Math.max(0, videoAllowance(v) - (v.usedWatches ?? 0));
  const hasNoWatches = activeVideo ? videoRemainingWatches(activeVideo) <= 0 : false;

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadCourse = useCallback(async (opts?: { silent?: boolean }) => {
    // Silent mode refreshes progress/locks in the background (used when a
    // video auto-completes mid-playback) without unmounting the player.
    if (!opts?.silent) setLoading(true);
    setPageError("");
    setAccessBlock(null);
    try {
      const courseRes = await fetch(`/api/courses/${courseId}/learn`);
      const courseJson = await courseRes.json();
      if (!courseRes.ok) {
        console.log("[center-video-access] course load", {
          status: courseRes.status,
          code: courseJson.code,
          error: courseJson.error,
          courseId,
          silent: Boolean(opts?.silent),
        });
        if (courseRes.status === 401) { router.replace("/login"); return; }
        if (courseRes.status === 403) {
          const code = courseJson.code as string | undefined;
          if (code === "VPN_DETECTED" || courseJson.vpnDetected) {
            router.push(`/vpn-check?redirect_url=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          // Teacher/staff aren't allowed into the student course room — show a
          // clear message instead of a silent redirect.
          if (code === "TEACHER_NOT_ALLOWED" || code === "STAFF_NOT_ALLOWED") {
            setAccessBlock({
              message: courseJson.error || "هذه الصفحة مخصّصة للطلاب فقط.",
              teacher: code === "TEACHER_NOT_ALLOWED",
            });
            return;
          }
          // Stay on the learn page. A silent 403 used to kick the student back
          // to /courses/[id] right after "بدء الفيديو" and the player never opened.
          if (!opts?.silent) {
            setAccessBlock({
              message: courseJson.error || "لا يوجد صلاحية للوصول. فعّل كود الكورس أو تواصل مع المعلم.",
              teacher: false,
              isRenewalRequired: Boolean(courseJson.isRenewalRequired),
              renewalMonth: typeof courseJson.renewalMonth === "number" ? courseJson.renewalMonth : null,
              teacherId: typeof courseJson.teacherId === "string" ? courseJson.teacherId : null,
            });
          }
          return;
        }
        throw new Error(courseJson.error || "فشل تحميل الكورس");
      }
      if (courseJson.isTeacherPreview) {
        setIsTeacherPreview(true);
      }
      const c = courseJson.course as CourseData;
      if (typeof courseJson.markCompleteThreshold === "number") {
        setMarkThreshold(courseJson.markCompleteThreshold);
      }
      setChainActive(courseJson.chainActive === true);
      console.log("[center-video-access] subscription", {
        courseId: c.id,
        courseTitle: c.title,
        folders: c.folders?.length ?? 0,
        videos: c.folders?.flatMap((f) => f.videos).length ?? 0,
      });
      setCourse(c);
      
      const allVideos = c.folders.flatMap((f) => f.videos);
      const videoFromParam = allVideos.find((v) => v.id === paramVideoId);
      // No lesson in the link: open the first one not watched yet, so a
      // returning student lands where they stopped instead of on lesson 1.
      const firstUnwatched = orderedLessons(c).find((v) => !v.progress?.some((p) => p.watched));
      const initialVideoId = videoFromParam
        ? videoFromParam.id
        : (firstUnwatched ?? allVideos[0])?.id;

      if (initialVideoId) {
        setActiveVideoId((prev) => prev ?? initialVideoId);
      }

      const init: Record<string, boolean> = {};
      c.folders.forEach((f) => {
        const containsActive = f.videos.some((v) => v.id === initialVideoId);
        init[f.id] = !containsActive;
      });
      setCollapsed((prev) => Object.keys(prev).length > 0 ? prev : init);
    } catch (err) {
      // A failed silent refresh must not blank the page while the student is
      // watching — keep the last good course data and try again next time.
      if (!opts?.silent) setPageError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل الكورس");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [courseId, router, paramVideoId]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { name: d.user.name, role: d.user.role, phone: d.user.phone ?? null } : null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => { if (courseId) void loadCourse(); }, [courseId, loadCourse]);

  // Fetch saved resume position when selecting a video
  useEffect(() => {
    if (!activeVideoId) return;
    setSavedPosition(0);
    setFetchingPosition(true);
    fetch(`/api/videos/${activeVideoId}/position`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { seconds?: number } | null) => {
        setSavedPosition(d?.seconds ?? 0);
      })
      .catch(() => {})
      .finally(() => setFetchingPosition(false));
  }, [activeVideoId]);

  // Fetch questions for active video
  useEffect(() => {
    setFiredQuestionIds(new Set());
    setActiveQuestion(null);
    setActiveOverlayQuestion(null);
    if (!player?.videoId) {
      setQuestions([]);
      setAnsweredQuestionIds(new Set());
      return;
    }

    fetch(`/api/videos/${player.videoId}/questions`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: { questions?: QuestionItem[] }) => {
        if (data.questions) {
          setQuestions(data.questions);
          const answered = new Set<string>();
          data.questions.forEach((q) => {
            if (q.answered) answered.add(q.id);
          });
          setAnsweredQuestionIds(answered);
        }
      })
      .catch(() => {});
  }, [player?.videoId]);

  // ── Countdown ticker ─────────────────────────────────────────────────────

  useEffect(() => {
    if (playerPaused || activeQuestion) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playerPaused, activeQuestion]);

  useEffect(() => {
    if (!player) return;
    const next = fmtCountdown(player.expiresAt, now);
    setCountdown(next);
    // An expired session used to keep the player mounted with a dead 00:00:00
    // timer and no way to start again without a full refresh.
    if (next === "00:00:00") {
      setPlayer(null);
      setElapsedSeconds(0);
    }
  }, [player, now]);

  // ── DevTools deterrents (active while player is open) ────────────────────

  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F12") { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && ["U", "S"].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [player]);

  // ── Elapsed time ticker ──────────────────────────────────────────────────

  useEffect(() => {
    if (!player) { setElapsedSeconds(0); return; }
    const tick = () => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(player.startedAt).getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [player]);

  // YouTube end-detection is handled by SecurePlayer's onEnded (IFrame API) below.

  // ── Mark complete ────────────────────────────────────────────────────────

  const markCompleteFor = async (videoId: string) => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/complete`, { method: "POST", credentials: "include" });
      if (res.ok) {
        setPlayer(null);
        setElapsedSeconds(0);
        await loadCourse();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        toastError(d.error || "تعذر تسجيل الإنجاز");
      }
    } catch { toastError("تعذر تسجيل الإنجاز"); }
    finally { setCompleting(false); }
  };

  // ── Watch flow ───────────────────────────────────────────────────────────

  // Fires when a position ping crosses the completion threshold server-side
  // and the video flips to watched on its own. Refresh progress/locks in the
  // background so the next content in the teacher's chain unlocks right away,
  // without interrupting playback.
  const handleAutoWatched = useCallback(
    (_videoId: string) => {
      toastSuccess("أحسنت! تم تسجيل إنجاز هذه المحاضرة تلقائياً 🎉");
      void loadCourse({ silent: true });
    },
    [loadCourse, toastSuccess]
  );

  // Position saving hook (resume playback + cumulative watched time).
  const { reportProgress } = usePositionSaver(player?.videoId ?? null, { onWatched: handleAutoWatched });

  // Drives both position-save and timed-question triggering off the player's
  // reported currentTime. A question fires only when the playhead PASSES its
  // trigger second during forward playback (not on a seek/jump).
  const handleTimeUpdate = useCallback((seconds: number) => {
    const current = Math.floor(seconds);

    // متعملش seek protection هنا، اعملها بس في onSeeking
    if (activeQuestion) return;

    playerTimeRef.current = seconds;
    reportProgress(seconds);

    const prevT = lastTimeRef.current;

    // Seeked backward → re-arm refire-on-rewatch questions ahead of the playhead.
    if (seconds < prevT - 2) {
      setFiredQuestionIds((prev) => {
        const next = new Set(prev);
        questions.forEach((q) => {
          const qTime = q.triggerSecond ?? q.timestamp ?? 0;
          if (q.refireOnRewatch && qTime > seconds) next.delete(q.id);
        });
        return next;
      });
    }

    const q = questions.find((qq) => {
      const ts = qq.triggerSecond ?? qq.timestamp;
      return typeof ts === "number" && Math.abs(current - ts) < 1 && !answeredQuestionIds.has(qq.id);
    });

    console.log("time:", current, "question at:", q ? (q.triggerSecond ?? q.timestamp) : undefined, "active:", !!activeQuestion);

    if (q) {
      if (q.mode === "overlay" && q.isRequired === false) {
        if (!firedQuestionIds.has(q.id)) {
          setFiredQuestionIds((prev) => new Set(prev).add(q.id));
          setActiveOverlayQuestion(q);
        }
      } else {
        setPlayerPaused(true);
        setActiveQuestion(q); // اظهر السؤال الأول وبعدين امنع التقديم
        playerTimeRef.current = q.triggerSecond ?? q.timestamp ?? current;
        return;
      }
    }

    lastTimeRef.current = seconds;
  }, [questions, answeredQuestionIds, firedQuestionIds, reportProgress, activeQuestion]);

  const handleQuestionAnswered = () => {
    if (activeQuestion) {
      setAnsweredQuestionIds((prev) => new Set(prev).add(activeQuestion.id));
      setActiveQuestion(null);
      setPlayerPaused(false);
    }
  };

  const handleOverlayQuestionAnswered = () => {
    if (activeOverlayQuestion) {
      setAnsweredQuestionIds((prev) => new Set(prev).add(activeOverlayQuestion.id));
      setActiveOverlayQuestion(null);
    }
  };

  const handleOverlayQuestionDismissed = () => {
    setActiveOverlayQuestion(null);
  };

  const openModal = (video: VideoItem) => {
    if (isLocked(video.id)) return;
    if (videoRemainingWatches(video) <= 0) { toastError("استنفذت جميع محاولات المشاهدة — تواصل مع المعلم"); return; }
    setModalVideo({ id: video.id, title: video.title });
  };

  const confirmWatch = async (resume: boolean = true) => {
    if (!modalVideo) return;
    setWatching(true);
    try {
      const res = await fetch(`/api/videos/${modalVideo.id}/watch`, { method: "POST", credentials: "include" });
      const data = await res.json();
      console.log("[center-video-access] watch play", {
        status: res.status,
        code: data.code,
        error: data.error,
        videoId: modalVideo.id,
        courseId,
        sessionToken: data.sessionToken ? "present" : null,
        embedUrl: data.embedUrl || null,
      });
      if (!res.ok) {
        if (data.code === "VPN_DETECTED" || data.vpnDetected) {
          router.push(`/vpn-check?redirect_url=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toastError(data.error || "تعذر بدء جلسة المشاهدة");
        return;
      }
      const vid = flatVideos.find((v) => v.id === modalVideo.id);
      const startAt = resume ? savedPosition : 0;
      setPlayer({
        videoId: modalVideo.id,
        sessionToken: data.sessionToken,
        embedUrl: data.embedUrl,
        expiresAt: data.expiresAt,
        provider: data.provider ?? "vdocipher",
        startedAt: new Date().toISOString(),
        durationMinutes: vid?.durationMinutes ?? 0,
        startSeconds: startAt,
        watchSessionId: data.sessionId,
        drm: data.drm || null,
      });
      setModalVideo(null);
      await loadCourse({ silent: true });
    } catch { toastError("تعذر بدء جلسة المشاهدة"); }
    finally { setWatching(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh bg-[var(--bg)] overflow-hidden">
      <Navbar user={user} />

      {/* ── Loading ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-(--brand)/30 border-t-(--brand) animate-spin" />
            <p className="text-sm text-[var(--ink-muted)]">جارٍ تحميل الكورس...</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && pageError && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
            <p className="text-[var(--error)] text-sm leading-relaxed">{pageError}</p>
            <button onClick={() => router.push("/courses")} className="px-5 py-2.5 rounded-xl bg-(--brand) hover:bg-(--brand-strong) text-(--on-brand) text-sm font-bold transition-colors">
              الرجوع للكورسات
            </button>
          </div>
        </div>
      )}

      {/* ── Role block (teacher / staff / renewal) ── */}
      {!loading && accessBlock && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto text-2xl ${
              accessBlock.isRenewalRequired ? "bg-amber-500/20 text-amber-500 shadow-md shadow-amber-500/20" : "bg-(--brand)/10 text-(--brand)"
            }`}>
              {accessBlock.teacher ? "👨‍🏫" : accessBlock.isRenewalRequired ? "⚡" : "🔒"}
            </div>
            <h2 className="text-lg font-black text-[var(--ink)]">
              {accessBlock.teacher
                ? "مرحباً أستاذ 👋"
                : accessBlock.isRenewalRequired
                ? `تجديد الاشتراك مطلوب (الشهر ${accessBlock.renewalMonth || 2})`
                : "غير متاح"}
            </h2>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">{accessBlock.message}</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              {accessBlock.isRenewalRequired && accessBlock.teacherId && (
                <button
                  onClick={() => router.push(`/choose-course?teacherId=${accessBlock.teacherId}`)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                >
                  تجديد الاشتراك الآن ⚡
                </button>
              )}
              {accessBlock.teacher && (
                <button
                  onClick={() => router.push("/adminpanel/teacher")}
                  className="px-5 py-2.5 rounded-xl bg-(--brand) hover:bg-(--brand-strong) text-(--on-brand) text-sm font-bold transition-colors"
                >
                  لوحة المعلّم
                </button>
              )}
              <button
                onClick={() => router.push(`/courses/${courseId}`)}
                className="px-5 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--border)] text-[var(--ink)] text-sm font-bold transition-colors"
              >
                تفاصيل الكورس
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-5 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--border)] text-[var(--ink)] text-sm font-bold transition-colors"
              >
                الصفحة الرئيسية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && !pageError && !accessBlock && course && (
        <div className="flex flex-col flex-1 overflow-hidden relative">
          {/* Teacher Preview Banner */}
          {isTeacherPreview && !inIframe && (
            <div className="bg-(--brand)/15 border-b border-(--brand)/30 px-4 py-2 flex items-center justify-between gap-3 text-xs font-bold text-(--brand) shrink-0 z-20" dir="rtl">
              <div className="flex items-center gap-2">
                <span>👁️ وضع معاينة المعلم:</span>
                <span className="font-normal text-[var(--ink-muted)]">يمكنك تصفح المحتوى والأسئلة والتنقل بحرّية دون قيود تسلسلية أو استهلاك محاولات.</span>
              </div>
              <button
                onClick={() => router.push("/adminpanel/teacher")}
                className="px-3 py-1 rounded-lg bg-(--brand) text-(--on-brand) hover:bg-(--brand-strong) transition-colors shrink-0"
              >
                العودة للوحة المعلم
              </button>
            </div>
          )}

          <div className="flex flex-1 overflow-hidden relative">

          {/* Mobile drawer backdrop */}
          {navOpen && (
            <div
              className="lg:hidden fixed inset-0 z-30 bg-black/50"
              onClick={() => setNavOpen(false)}
              aria-hidden
            />
          )}

          {/* ════════════════════════════════════════════
              SIDEBAR — static rail on desktop, slide-in drawer on mobile
          ════════════════════════════════════════════ */}
          <aside
            className={`fixed lg:static inset-y-0 right-0 z-40 lg:z-auto w-[85%] max-w-[320px] lg:w-72 lg:max-w-none shrink-0 flex flex-col bg-[var(--surface)] border-e border-[var(--border)] overflow-hidden overscroll-contain shadow-2xl lg:shadow-none transition-transform duration-300 ${navOpen ? "translate-x-0" : "translate-x-full"} lg:translate-x-0 ${theater ? "lg:hidden" : ""}`}
          >

            {/* Course identity + progress */}
            <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] space-y-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-widest mb-1 truncate">{course.subject}</p>
                <h1 className="text-sm font-black text-[var(--ink)] leading-snug truncate">{course.title}</h1>
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">د. {course.teacher.name}</p>
              </div>

              {/* Progress ring + stats */}
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <ProgressRing pct={progressPct} size={44} stroke={3.5} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-(--brand)" aria-hidden>
                    {progressPct}%
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--ink)] leading-tight">تقدمك في الكورس</p>
                  <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">{watchedCount} من {totalVideos} محاضرة مكتملة</p>
                </div>
              </div>

              {/* Per-video watch count for selected video */}
              {activeVideo && (
                <div className="space-y-1.5">
                  <WatchSlots
                    used={activeVideo.usedWatches ?? 0}
                    total={videoAllowance(activeVideo)}
                  />
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    {videoRemainingWatches(activeVideo) > 0
                      ? `${videoRemainingWatches(activeVideo)} مشاهدة متبقية للفيديو الحالي`
                      : "استنفدت مشاهدات هذا الفيديو"}
                  </p>
                </div>
              )}
            </div>

            {/* Lesson tree */}
            <nav className="flex-1 overflow-y-auto py-1" aria-label="محتوى الكورس">
              {course.folders.map((folder) => {
                const isOpen = !collapsed[folder.id];
                const folderWatched = folder.videos.filter((v) => isWatched(v)).length;

                return (
                  <div key={folder.id}>
                    {/* Folder header */}
                    <button
                      onClick={() => setCollapsed((p) => ({ ...p, [folder.id]: !p[folder.id] }))}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-right hover:bg-[var(--border)] transition-colors group"
                    >
                      <div className="flex items-center gap-2 truncate flex-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          folder.color === "emerald" ? "bg-emerald-500" :
                          folder.color === "amber" ? "bg-amber-500" :
                          folder.color === "rose" ? "bg-rose-500" :
                          folder.color === "cyan" ? "bg-cyan-500" :
                          folder.color === "slate" ? "bg-slate-500" :
                          "bg-blue-500"
                        }`} />
                        <span className="text-[11px] font-bold text-[var(--ink)] truncate">{folder.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[var(--ink-muted)]">{folderWatched}/{folder.videos.length}</span>
                        <IconChevron className="w-3 h-3 text-[var(--ink-muted)]" open={isOpen} />
                      </div>
                    </button>

                    {/* Folder items */}
                    {isOpen && (
                      <div>
                        {(folder.contents ?? []).map((entry) => {
                          if (entry.contentType === "VIDEO") {
                          const video = entry.video;
                          const watched = isWatched(video);
                          const locked = isLocked(video.id);
                          const scheduledUnlock = getScheduledUnlockTime(video.id);
                          const active = activeVideoId === video.id;
                          const playing = player?.videoId === video.id;

                          // Calculate progress percent
                          const lastPos = video.progress?.[0]?.lastPositionSeconds ?? 0;
                          const durSec = (video.durationMinutes ?? 0) * 60;
                          const progressPct = durSec > 0 ? Math.min(100, Math.round((lastPos / durSec) * 100)) : 0;

                          return (
                            <button
                              key={video.id}
                              onClick={() => { setActiveVideoId(video.id); setNavOpen(false); }}
                              aria-current={active ? "true" : undefined}
                              className={`relative w-full flex flex-col items-stretch px-4 py-2.5 text-right transition-colors ${
                                active
                                  ? "bg-(--brand)/8 dark:bg-(--brand)/6"
                                  : "hover:bg-[var(--border)]"
                              } ${locked || scheduledUnlock ? "opacity-50" : ""}`}
                            >

                              <div className="flex items-center gap-2.5 w-full">

                                {/* State icon */}
                                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                                  playing ? "bg-(--brand)/20" :
                                  watched ? "bg-(--brand)/12" :
                                  "bg-[var(--border)]"
                                }`}>
                                  {playing ? (
                                    <IconPlay className="w-2.5 h-2.5 text-(--brand)" />
                                  ) : watched ? (
                                    <IconCheck className="w-3 h-3 text-(--brand)" />
                                  ) : scheduledUnlock ? (
                                    <IconClock className="w-3 h-3 text-[var(--ink-muted)]" />
                                  ) : locked ? (
                                    <IconLock className="w-3 h-3 text-[var(--ink-muted)]" />
                                  ) : (
                                    <IconPlay className="w-2.5 h-2.5 text-[var(--ink-muted)]" />
                                  )}
                                </span>

                                <span className={`text-xs leading-relaxed flex-1 text-right truncate ${
                                  active ? "text-[var(--ink)] font-semibold" :
                                  watched ? "text-[var(--ink-muted)]" :
                                  (locked || scheduledUnlock) ? "text-[var(--ink-muted)]" :
                                  "text-[var(--ink-muted)]"
                                }`}>
                                  {video.title}
                                </span>

                                {/* Playing pulse */}
                                {playing && (
                                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-(--brand) animate-pulse" aria-hidden />
                                )}
                              </div>

                              {/* Progress bar under card */}
                              {!watched && !locked && !scheduledUnlock && progressPct > 0 && (
                                <div className="w-full h-1 bg-[var(--border)] rounded-full overflow-hidden mt-1.5">
                                  <div
                                    className="h-full bg-(--brand) rounded-full"
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                              )}
                            </button>
                          );
                          }

                          if (entry.contentType === "EXAM") {
                          const quiz = entry.exam;
                          const quizSolved = !!quiz.myResult?.completedAt;
                          const quizReopened = !!quiz.myResult?.allowRetake;
                          const quizLocked = !quizReopened && ((chainActive && !!quiz.chainLocked) || (!!quiz.timedClosed && !quizSolved));
                          return (
                          <button
                            key={quiz.id}
                            onClick={() => {
                              if (quizLocked) return;
                              router.push(`/quizzes/${quiz.id}`);
                            }}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-right hover:bg-[var(--border)] transition-colors ${quizLocked ? "opacity-60" : ""}`}
                          >
                            <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--border)] flex items-center justify-center">
                              {quizLocked ? <span className="text-[11px]">🔒</span> : <IconQuiz className="w-3 h-3 text-[var(--ink-muted)]" />}
                            </span>
                            <span className="text-xs text-[var(--ink-muted)] flex-1 truncate">{quiz.title}</span>
                            {quizReopened ? (
                              <span className="text-[10px] text-(--brand) bg-(--brand)/10 px-1.5 py-0.5 rounded font-bold shrink-0">مفتوح</span>
                            ) : quiz.timedClosed && !quizSolved ? (
                              <span className="text-[10px] text-rose-500/90 shrink-0 truncate max-w-[40%]">انتهى وقت الامتحان</span>
                            ) : quizSolved ? (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold shrink-0">
                                {Math.round(quiz.myResult?.score ?? 0)}%
                              </span>
                            ) : quizLocked ? (
                              <span className="text-[10px] text-amber-500/80 shrink-0 truncate max-w-[40%]">
                                {quiz.chainLockedBy ? `أكمل «${quiz.chainLockedBy}»` : "مقفل"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--ink-muted)] shrink-0" dir="ltr">{quiz.timeLimitMinutes}د</span>
                            )}
                          </button>
                          );
                          }

                          if (entry.contentType === "HOMEWORK") {
                          const hw = entry.homework;
                          const hwSolved = !!hw.mySubmission && (hw.mySubmission.score != null || !!hw.mySubmission.completedAt);
                          const canRetry = !!hw.mySubmission?.allowRetake;
                          const hwLocked = !canRetry && ((chainActive && !!hw.chainLocked) || (!!hw.timedClosed && !hwSolved));
                          const isPassed = hw.mySubmission?.status === "passed" && !hw.mySubmission?.allowRetake;
                          const isPending = hw.mySubmission?.status === "pending" || hw.mySubmission?.status === "review_requested";
                          const isFailed = hw.mySubmission?.status === "failed" && !hw.mySubmission?.allowRetake;
                          const uploadNotice = hw.mySubmission
                            ? studentHomeworkNotice({
                                type: hw.type,
                                status: hw.mySubmission.status,
                                allowRetake: hw.mySubmission.allowRetake,
                                completedAt: hw.mySubmission.completedAt,
                                review: hw.mySubmission.review,
                              })
                            : null;
                          const rejectionVisible = uploadNotice?.tone === "failed";
                          return (
                            <button
                              key={hw.id}
                              onClick={() => {
                                if (hwLocked) return;
                                router.push(`/homeworks/${hw.id}`);
                              }}
                              className={`w-full flex items-center gap-2.5 px-4 py-2 text-right hover:bg-[var(--border)] transition-colors group ${hwLocked ? "opacity-60" : ""}`}
                            >
                              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${hwLocked ? "bg-[var(--border)]" : isPassed ? "bg-emerald-500/20 text-emerald-400" : isFailed ? "bg-rose-500/20 text-rose-400" : isPending || canRetry ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/10 text-amber-400"}`}>
                                <span className="text-[11px]">{hwLocked ? "🔒" : "📝"}</span>
                              </span>
                              <span className="text-xs text-[var(--ink-muted)] group-hover:text-[var(--ink)] flex-1 truncate">{hw.title}</span>
                              {rejectionVisible ? (
                                <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-bold shrink-0">{uploadNotice?.badge}</span>
                              ) : canRetry ? (
                                <span className="text-[10px] text-(--brand) bg-(--brand)/10 px-1.5 py-0.5 rounded font-bold">مفتوح</span>
                              ) : hw.timedClosed && !hwSolved ? (
                                <span className="text-[10px] text-rose-500/90 bg-rose-500/10 px-1.5 py-0.5 rounded font-bold truncate max-w-[40%]">
                                  انتهى وقت الامتحان
                                </span>
                              ) : hwLocked ? (
                                <span className="text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold truncate max-w-[40%]">
                                  {hw.chainLockedBy ? `أكمل «${hw.chainLockedBy}»` : "مقفل"}
                                </span>
                              ) : hw.mySubmission?.score != null ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold shrink-0">
                                  {Math.round(hw.mySubmission.score)}%
                                </span>
                              ) : isPassed ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">تم الحل ✅</span>
                              ) : isFailed ? (
                                <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-bold">مرفوض</span>
                              ) : isPending ? (
                                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">قيد المراجعة</span>
                              ) : (
                                <span className="text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">واجب</span>
                              )}
                            </button>
                          );
                          }

                          if (entry.contentType === "ATTACHMENT") {
                          const m = entry.attachment;
                          const materialLocked = chainActive && !!m.chainLocked;
                          return (
                          <a
                            key={m.id}
                            href={materialLocked ? undefined : m.url}
                            onClick={(e) => {
                              if (materialLocked) e.preventDefault();
                            }}
                            target={materialLocked ? undefined : "_blank"}
                            rel={materialLocked ? undefined : "noreferrer"}
                            className={`w-full flex items-center gap-2.5 px-4 py-2 text-right hover:bg-[var(--border)] transition-colors ${materialLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--border)] flex items-center justify-center">
                              {materialLocked ? (
                                <span className="text-[11px]">🔒</span>
                              ) : m.type === "pdf" ? (
                                <IconFile className="w-3 h-3 text-[var(--ink-muted)]" />
                              ) : (
                                <IconLink className="w-3 h-3 text-[var(--ink-muted)]" />
                              )}
                            </span>
                            <span className="text-xs text-[var(--ink-muted)] flex-1 truncate">{m.title}</span>
                            {materialLocked && (
                              <span className="text-[10px] text-amber-500/80 shrink-0 truncate max-w-[40%]">
                                {m.chainLockedBy ? `أكمل «${m.chainLockedBy}»` : "مقفل"}
                              </span>
                            )}
                          </a>
                          );
                          }

                          return null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Homework */}
              {course.homeworkUrl && (
                <div className="px-4 py-3 mt-1 border-t border-[var(--border)]">
                  <a
                    href={course.homeworkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                  >
                    <IconFile className="w-3.5 h-3.5 shrink-0" />
                    الواجب المنزلي
                  </a>
                </div>
              )}
            </nav>
          </aside>

          {/* ════════════════════════════════════════════
              MAIN PANEL
          ════════════════════════════════════════════ */}
          <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">

            {activeVideo ? (
              <>
                {/* Title bar */}
                <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
                  {/* Mobile: open lesson drawer */}
                  <button
                    onClick={() => setNavOpen(true)}
                    aria-label="قائمة الدروس"
                    className="lg:hidden shrink-0 w-10 h-10 -ms-1 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--border)] transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)] mb-1">
                      <span className="truncate">{course.title}</span>
                      {activeFolder && <><span aria-hidden>›</span><span className="truncate">{activeFolder.name}</span></>}
                    </div>
                    <h2 className="text-sm font-bold text-[var(--ink)] truncate">{activeVideo.title}</h2>
                  </div>

                  {/* Session countdown */}
                  {isPlayerActive && (
                    <div className="shrink-0 flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                      <span className="font-mono tabular-nums" dir="ltr">{countdown}</span>
                    </div>
                  )}

                  {/* Back to courses */}
                  <button
                    onClick={() => router.push(`/courses/${courseId}`)}
                    className="shrink-0 min-h-10 flex items-center gap-1.5 text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors px-3 rounded-lg hover:bg-[var(--border)]"
                  >
                    <svg className="w-3.5 h-3.5 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    الكورس
                  </button>
                </div>

                {/* ── PLAYER or PRE-PLAY ──
                    Sized to the screen: the video, one control row and the
                    notes panel (an overlay) all fit without page scrolling. */}
                <div className="relative flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
                  {isPlayerActive ? (
                    /* ─ Active player ─ */
                    <div className="flex flex-col flex-1 min-h-0" onContextMenu={(e) => e.preventDefault()}>
                      {/* Desktop: the stage is a size container and the player takes the
                          largest 16:9 box that fits it, so a wide window no longer pushes
                          the controls below the fold. Phones keep full width. */}
                      <div
                        ref={setStageEl}
                        className="relative bg-black flex items-center justify-center lg:flex-1 lg:min-h-0 lg:[container-type:size]"
                      >
                      {ambient && (
                        <AmbientBackdrop
                          key={player!.videoId}
                          stage={stageEl}
                          provider={player!.provider}
                          embedUrl={player!.embedUrl}
                        />
                      )}
                      {/* 16:9 watermark-safe player container with full VideoGuard security */}
                      <div className="relative z-[1] w-full lg:w-[min(100cqw,calc(100cqh*16/9))] overflow-hidden lg:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
                        <VideoGuard
                          studentName={user?.name || ""}
                          studentPhone={user?.phone || user?.name || ""}
                          videoId={player!.videoId}
                          disabled={player!.provider === "axinom" || player!.provider === "youtube"}
                        >
                          <SecurePlayer
                            key={player!.videoId}
                            videoId={player!.videoId}
                            embedUrl={player!.embedUrl}
                            title={activeVideo.title}
                            watermark={user?.phone || user?.name || ""}
                            provider={player!.provider}
                            drm={player!.drm}
                            startSeconds={player!.startSeconds}
                            onProgress={handleTimeUpdate}
                            paused={playerPaused || Boolean(activeQuestion)}
                            hideControls={Boolean(activeQuestion)}
                            maxAllowedSecond={maxAllowedSecond}
                            onEnded={() => void markCompleteFor(player!.videoId)}
                          >
                            {/* Programmatic blocking question modal (pause mode) */}
                            {activeQuestion && (
                              <VideoQuestionModal
                                question={activeQuestion}
                                videoId={player!.videoId}
                                watchSessionId={player!.watchSessionId}
                                currentSecond={playerTimeRef.current}
                                onAnswered={handleQuestionAnswered}
                              />
                            )}

                            {/* Non-blocking overlay question (overlay mode) */}
                            {activeOverlayQuestion && (
                              <VideoQuestionOverlay
                                question={activeOverlayQuestion}
                                videoId={player!.videoId}
                                watchSessionId={player!.watchSessionId}
                                currentSecond={playerTimeRef.current}
                                onAnswered={handleOverlayQuestionAnswered}
                                onDismiss={handleOverlayQuestionDismissed}
                              />
                            )}
                          </SecurePlayer>
                        </VideoGuard>
                      </div>
                      </div>

                      {/* ── One control row: previous/next, progress, AI, complete, notes ── */}
                      {(() => {
                        const dur = player!.durationMinutes * 60;
                        const watchPct = dur > 0 ? Math.min(100, Math.round((elapsedSeconds / dur) * 100)) : null;
                        const canComplete = dur === 0 || elapsedSeconds >= dur * (markThreshold / 100);
                        const alreadyWatched = activeVideo ? isWatched(activeVideo) : false;
                        return (
                          <LessonToolbar {...toolbarProps!}>
                            {/* Time progress bar */}
                            {watchPct !== null && (
                              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                                <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-(--brand) rounded-full transition-all duration-1000"
                                    style={{ width: `${watchPct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] tabular-nums text-[var(--ink-muted)] shrink-0" dir="ltr">
                                  {watchPct}%
                                </span>
                              </div>
                            )}
                            {watchPct === null && <div className="flex-1" />}

                            {/* Ask AI button under the video */}
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(
                                  new CustomEvent("open-ai-assistant", {
                                    detail: { initialPrompt: `اشرحلي درس ${activeVideo?.title || ""}` },
                                  })
                                );
                              }}
                              className="shrink-0 min-h-9 flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold border border-(--brand)/30 bg-(--brand-soft) text-(--brand) hover:border-(--brand) transition-colors"
                            >
                              <span>🤖</span>
                              <span>اسأل المساعد الذكي</span>
                            </button>

                            {/* Mark-complete button (or done state once auto/manual completion landed) */}
                            {alreadyWatched ? (
                              <span className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <IconCheck className="w-3 h-3" />
                                تم تسجيل الإنجاز
                              </span>
                            ) : (
                              <button
                                onClick={() => void markCompleteFor(player!.videoId)}
                                disabled={!canComplete || completing}
                                className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                  canComplete
                                    ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_14px_rgba(52,211,153,0.30)]"
                                    : "bg-[var(--border)] text-[var(--ink-muted)] cursor-not-allowed"
                                } disabled:opacity-60`}
                              >
                                {completing ? (
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <IconCheck className="w-3 h-3" />
                                )}
                                {canComplete ? "أنهيت المحاضرة" : `${watchPct !== null ? watchPct : 0}% — انتظر`}
                              </button>
                            )}
                          </LessonToolbar>
                        );
                      })()}
                    </div>
                  ) : (
                    /* ─ Pre-play state ─ */
                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 p-4 sm:p-6 [container-type:size]">

                      {/* Thumbnail placeholder / state — never taller than the space left */}
                      <div className="w-[min(42rem,100cqw-2rem,calc((100cqh-8rem)*16/9))] min-w-[16rem]">
                        <div className="relative aspect-video rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden flex flex-col items-center justify-center gap-4">

                          {/* Subtle radial highlight */}
                          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_50%_40%,_var(--brand),_transparent_65%)]" aria-hidden />

                          {(() => {
                            const scheduledUnlock = getScheduledUnlockTime(activeVideo.id);
                            if (scheduledUnlock) {
                              return (
                                <>
                                  <div className="w-14 h-14 rounded-full border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
                                    <IconClock className="w-7 h-7 text-[var(--ink-muted)]" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-[var(--ink)]">محتوى مجدول</p>
                                    <p className="text-xs font-mono text-[var(--ink-muted)] mt-1 tracking-widest text-(--brand)" dir="ltr">
                                      {fmtCountdown(scheduledUnlock, now)}
                                    </p>
                                  </div>
                                </>
                              );
                            }
                            if (isLocked(activeVideo.id)) {
                              return (
                                <>
                                  <div className="w-14 h-14 rounded-full border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
                                    <IconLock className="w-7 h-7 text-[var(--ink-muted)]" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-[var(--ink)]">هذه المحاضرة مقفلة</p>
                                    <p className="text-xs text-[var(--ink-muted)] mt-1">
                                      {activeVideo.chainLockedBy
                                        ? `أكمل «${activeVideo.chainLockedBy}» أولاً لفتح هذه`
                                        : "أكمل المحاضرة السابقة أولاً لفتح هذه"}
                                    </p>
                                  </div>
                                </>
                              );
                            }
                            if (hasNoWatches) {
                              return (
                                <>
                                  <div className="w-14 h-14 rounded-full border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
                                    <svg className="w-7 h-7 text-[var(--ink-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-[var(--ink)]">لا توجد مشاهدات متبقية</p>
                                    <p className="text-xs text-[var(--ink-muted)] mt-1">تواصل مع المعلم لتجديد رصيدك</p>
                                  </div>
                                </>
                              );
                            }
                            if (isWatched(activeVideo)) {
                              return (
                                <>
                                  <div className="w-14 h-14 rounded-full border border-(--brand)/25 bg-(--brand)/8 flex items-center justify-center">
                                    <IconCheck className="w-7 h-7 text-(--brand)" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-[var(--ink)]">تمت المشاهدة</p>
                                    <p className="text-xs text-[var(--ink-muted)] mt-1">يمكنك مشاهدتها مجدداً إذا كان لديك رصيد</p>
                                  </div>
                                  <button
                                    onClick={() => openModal(activeVideo)}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl border border-[var(--border)] hover:border-(--brand)/40 hover:bg-(--brand)/5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] font-semibold transition-all"
                                  >
                                    <IconPlay className="w-3.5 h-3.5 text-(--brand)" />
                                    مشاهدة مجدداً
                                  </button>
                                </>
                              );
                            }

                            return (
                              <>
                                <div
                                  aria-hidden
                                  className="w-16 h-16 rounded-full border border-(--brand)/30 bg-(--brand)/10 flex items-center justify-center"
                                >
                                  <IconPlay className="w-7 h-7 text-(--brand) group-hover:scale-110 transition-transform duration-150" />
                                </div>
                                <div className="text-center">
                                  <p className="text-sm font-semibold text-[var(--ink)]">{activeVideo.title}</p>
                                  <p className="text-xs text-[var(--ink-muted)] mt-1">اضغط للبدء — مدة الجلسة 4 ساعات</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Watch CTA + slot counter */}
                      {!isLocked(activeVideo.id) && !getScheduledUnlockTime(activeVideo.id) && !hasNoWatches && (
                        <div className="flex flex-col items-center gap-3">
                          <button
                            onClick={() => openModal(activeVideo)}
                            className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-(--brand) hover:bg-(--brand-strong) text-(--on-brand) font-bold text-sm transition-colors shadow-[0_0_20px_rgba(56,189,248,0.22)] hover:shadow-[0_0_28px_rgba(56,189,248,0.32)]"
                          >
                            <IconPlay className="w-4 h-4" />
                            مشاهدة المحاضرة
                          </button>

                          {activeVideo && (
                            <div className="flex items-center gap-2">
                              <WatchSlots
                                used={activeVideo.usedWatches ?? 0}
                                total={videoAllowance(activeVideo)}
                              />
                              <span className="text-xs text-[var(--ink-muted)]" dir="rtl">
                                {videoRemainingWatches(activeVideo)} من {videoAllowance(activeVideo)} متبقية
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!isPlayerActive && <LessonToolbar {...toolbarProps!} />}
                  {notesOpen && (
                    <LessonNotes
                      key={activeVideo.id}
                      videoId={activeVideo.id}
                      canStamp={isPlayerActive}
                      getTime={() => playerTimeRef.current}
                      onSaved={onNotesSaved}
                      onClose={() => setNotesOpen(false)}
                    />
                  )}
                </div>
              </>
            ) : (
              /* No videos at all */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-xl border border-[var(--border)] flex items-center justify-center mx-auto">
                    <IconPlay className="w-6 h-6 text-[var(--ink-muted)]" />
                  </div>
                  <p className="text-sm text-[var(--ink-muted)]">لا توجد محاضرات في هذا الكورس بعد</p>
                </div>
              </div>
            )}
          </main>
        </div>

      {/* ════════════════════════════════════════════
          WATCH CONFIRM MODAL
      ════════════════════════════════════════════ */}
      <AnimatePresence>
        {modalVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[var(--z-modal-bg)] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="تأكيد بدء المشاهدة"
          >
            {/* Scrim */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => { if (!watching) setModalVideo(null); }}
              aria-hidden
            />

            {/* Sheet */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-sm w-full shadow-2xl z-[var(--z-modal)]"
            >
              {/* Header */}
              <h2 className="text-base font-black text-[var(--ink)] mb-0.5">مشاهدة المحاضرة</h2>
              <p className="text-xs text-[var(--ink-muted)] mb-5 leading-relaxed">{modalVideo.title}</p>

              {/* Slot info — per-video */}
              {modalVideo && (() => {
                const vid = flatVideos.find((v) => v.id === modalVideo.id);
                if (!vid) return null;
                const used = vid.usedWatches ?? 0;
                const total = videoAllowance(vid);
                return (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 mb-5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--ink-muted)]">مشاهدة ستُستخدم</span>
                      <span className="text-xs font-bold text-[var(--ink)] tabular-nums" dir="ltr">
                        {used + 1} / {total}
                      </span>
                    </div>
                    <WatchSlots used={used + 1} total={total} />
                    <p className="text-[11px] text-[var(--ink-muted)]">مدة الجلسة: 4 ساعات من لحظة الفتح</p>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {savedPosition > 3 ? (
                  <>
                    <button
                      onClick={() => confirmWatch(true)}
                      disabled={watching}
                      className="w-full py-2.5 rounded-xl bg-(--brand) hover:bg-(--brand-strong) disabled:opacity-60 text-(--on-brand) text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(56,189,248,0.2)]"
                    >
                      {watching ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      )}
                      <span>استئناف من {formatTime(savedPosition)}</span>
                    </button>
                    <button
                      onClick={() => confirmWatch(false)}
                      disabled={watching}
                      className="w-full py-2.5 rounded-xl border border-(--brand)/30 hover:bg-(--brand)/5 text-(--brand) text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <IconPlay className="w-3.5 h-3.5" />
                      <span>البدء من البداية</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => confirmWatch(false)}
                    disabled={watching}
                    className="w-full py-2.5 rounded-xl bg-(--brand) hover:bg-(--brand-strong) disabled:opacity-60 text-(--on-brand) text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {watching ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        جارٍ البدء...
                      </>
                    ) : (
                      <>
                        <IconPlay className="w-3.5 h-3.5" />
                        ابدأ المشاهدة
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setModalVideo(null)}
                  disabled={watching}
                  className="w-full py-2 rounded-xl border border-[var(--border)] hover:border-[var(--ink-muted)]/40 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] font-semibold transition-all disabled:opacity-40"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Lesson toolbar: previous / next, notes, theater ────────────────────────

/**
 * One row under the video. Previous / next only select the lesson; they never
 * start it. Every start spends one of the student's limited views, so that
 * stays an explicit tap on the watch button (and its confirm dialog).
 * `children` is the progress / AI / complete group while a lesson plays.
 */
function LessonToolbar({
  prev,
  next,
  emphasizeNext,
  onSelect,
  notesOpen,
  onToggleNotes,
  hasNotes,
  theater,
  onToggleTheater,
  ambient,
  onToggleAmbient,
  children,
}: {
  prev: VideoItem | null;
  next: VideoItem | null;
  emphasizeNext: boolean;
  onSelect: (id: string) => void;
  notesOpen: boolean;
  onToggleNotes: () => void;
  hasNotes: boolean;
  theater: boolean;
  onToggleTheater: () => void;
  ambient: boolean;
  onToggleAmbient: () => void;
  children?: React.ReactNode;
}) {
  const base = "min-h-10 inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border transition-colors shrink-0";
  const quiet = `${base} border-[var(--border)] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:pointer-events-none`;
  const icon = "w-4 h-4 shrink-0";
  return (
    <div className="px-3 sm:px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)] flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0">
      <button type="button" className={quiet} disabled={!prev} onClick={() => prev && onSelect(prev.id)} title={prev?.title}>
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
        السابق
      </button>
      <button
        type="button"
        disabled={!next}
        onClick={() => next && onSelect(next.id)}
        title={next ? `التالي: ${next.title}` : "ده آخر درس"}
        className={
          emphasizeNext && next
            ? `${base} border-transparent bg-(--brand) text-(--on-brand) hover:bg-(--brand-strong)`
            : quiet
        }
      >
        التالي
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>

      {children ? (
        <div className="order-last lg:order-none basis-full lg:basis-auto flex-1 min-w-0 flex items-center gap-2">{children}</div>
      ) : (
        <div className="flex-1" />
      )}

      <button type="button" className={quiet} aria-pressed={notesOpen} onClick={onToggleNotes} title="ملاحظاتي على الدرس">
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
        <span className="hidden sm:inline">ملاحظاتي</span>
        {hasNotes && <span className="w-1.5 h-1.5 rounded-full bg-(--brand)" aria-label="فيه ملاحظات محفوظة" />}
      </button>
      <button
        type="button"
        className={`${quiet} hidden lg:inline-flex`}
        aria-pressed={ambient}
        aria-label={ambient ? "إيقاف الإضاءة المحيطة" : "تشغيل الإضاءة المحيطة"}
        onClick={onToggleAmbient}
        title={ambient ? "الإضاءة المحيطة: شغالة" : "الإضاءة المحيطة: مقفولة"}
      >
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          {ambient && <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />}
        </svg>
      </button>
      <button
        type="button"
        className={`${quiet} hidden lg:inline-flex`}
        aria-pressed={theater}
        aria-label={theater ? "إظهار قائمة الدروس" : "وضع المسرح: إخفاء قائمة الدروس"}
        onClick={onToggleTheater}
        title={theater ? "إظهار قائمة الدروس" : "وضع المسرح — كبّر الفيديو"}
      >
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {theater ? <path d="M3 5h18v14H3zM15 5v14" /> : <path d="M3 5h18v14H3z" />}
        </svg>
      </button>
    </div>
  );
}

// ─── Personal notes per lesson ──────────────────────────────────────────────

function notesKey(videoId: string) {
  return `lesson-notes:${videoId}`;
}

function readLessonNotes(videoId: string): string {
  try {
    return window.localStorage.getItem(notesKey(videoId)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Overlay panel, so opening notes never pushes the video or the controls off
 * screen: a side panel on desktop, a bottom sheet on phones. Saved on this
 * device as the student types; the time button inserts the player position.
 */
function LessonNotes({
  videoId,
  canStamp,
  getTime,
  onSaved,
  onClose,
}: {
  videoId: string;
  /** True while the player is running, so a time stamp means something. */
  canStamp: boolean;
  getTime: () => number;
  onSaved: (hasText: boolean) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => readLessonNotes(videoId));
  const [saved, setSaved] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text.trim()) window.localStorage.setItem(notesKey(videoId), text);
        else window.localStorage.removeItem(notesKey(videoId));
      } catch {
        // storage blocked: the note stays on screen for this visit only
      }
      setSaved(true);
      onSaved(Boolean(text.trim()));
    }, 500);
    return () => clearTimeout(t);
  }, [text, videoId, onSaved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stamp = () => {
    const label = `[${formatTime(Math.floor(getTime()))}] `;
    const el = ref.current;
    const at = el ? el.selectionStart : text.length;
    const before = text.slice(0, at);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    setText(`${before}${lead}${label}${text.slice(at)}`);
    setSaved(false);
    requestAnimationFrame(() => {
      const pos = before.length + lead.length + label.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <section
      aria-label="ملاحظاتي على الدرس"
      className="absolute z-30 inset-x-0 bottom-0 h-[62%] rounded-t-2xl border-t lg:inset-x-auto lg:end-0 lg:top-0 lg:h-auto lg:w-[360px] lg:rounded-none lg:border-t-0 lg:border-s border-[var(--border)] bg-[var(--surface)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] lg:shadow-[0_0_30px_rgba(0,0,0,0.18)] flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[var(--ink)]">ملاحظاتي على الدرس</h3>
          <p className="text-xs text-[var(--ink-3)]" aria-live="polite">
            {saved ? "محفوظة على الجهاز ده" : "جارٍ الحفظ…"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canStamp && (
            <button
              type="button"
              onClick={stamp}
              className="min-h-10 px-3 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
            >
              + الوقت الحالي
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق الملاحظات"
            className="w-10 h-10 grid place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        autoFocus
        placeholder="اكتب اللي عايز تفتكره من الدرس ده: قانون، ملاحظة، سؤال تسأله للمدرس…"
        className="flex-1 min-h-0 w-full bg-[var(--surface)] text-[var(--ink)] text-sm leading-relaxed p-4 resize-none focus:outline-none placeholder:text-[var(--ink-3)]"
      />
    </section>
  );
}
