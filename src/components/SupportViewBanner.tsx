import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

/**
 * Fixed bar shown only while a support agent is viewing a student's account.
 *
 * Two jobs. It gives the agent a one-click way out that does not touch the
 * support cookie, and it makes the read-only state visible — without it an
 * agent would discover the restriction by having a click silently fail, and
 * might reach for the student's real password instead.
 *
 * This renders inside the root layout, so it runs on EVERY page for EVERY
 * visitor. It therefore reads the JWT directly instead of calling getSession():
 * both `supportView` and `name` are already claims in the token, and going
 * through getSession() would add a user lookup to every render on a box with
 * 3.7GB of RAM. Same approach the layout's own maintenance gate takes.
 *
 * A student loading their own dashboard has no supportView claim and gets null.
 */
export default async function SupportViewBanner() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token).catch(() => null);
  if (!payload?.supportView) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-center text-xs font-bold text-white shadow-lg"
      style={{ background: "#b45309" }}
    >
      <span>
        وضع الدعم الفني — تتصفح حساب {payload.name} للاطّلاع فقط. لا يمكن التعديل ولا تُخصم مشاهدات.
      </span>
      <form action="/thefake/support/exit-student" method="POST">
        <button
          type="submit"
          className="rounded-lg bg-white/20 px-3 py-1 font-bold transition-colors hover:bg-white/30"
        >
          العودة للوحة الدعم
        </button>
      </form>
    </div>
  );
}
