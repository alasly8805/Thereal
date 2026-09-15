import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import { actingTeacherId, hasAssistantPermission, isTeacherLike, type AssistantPermission } from "@/lib/teacher-scope";

/** Shared request plumbing for the AI essay-grading routes. */

/** cuid-shaped ids only — rejects objects, arrays, huge strings and path tricks. */
export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

// Per-worker burst guard in front of the DB-backed daily caps: stops a client
// from hammering the database/AI claim paths. Authoritative limits live in the DB.
const hits = new Map<string, number[]>();
export function burstLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return false;
}

export function tooMany(): NextResponse {
  return NextResponse.json({ error: "طلبات كثيرة، حاول بعد قليل" }, { status: 429 });
}

/**
 * Teacher-side scope. Returns the teacher id whose courses this session may
 * manage (assistants act for their teacher and need `permission`), or a
 * response to return. Superadmin gets `null` = unrestricted.
 */
export function teacherScope(
  session: SessionUser | null,
  permission: AssistantPermission
): { teacherId: string | null } | { response: NextResponse } {
  if (!session) return { response: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
  if (session.role === "superadmin") return { teacherId: null };
  if (!isTeacherLike(session.role)) return { response: NextResponse.json({ error: "غير مصرح" }, { status: 403 }) };
  if (!hasAssistantPermission(session, permission)) {
    return { response: NextResponse.json({ error: "المدرّس لم يمنحك هذه الصلاحية" }, { status: 403 }) };
  }
  return { teacherId: actingTeacherId(session) };
}
