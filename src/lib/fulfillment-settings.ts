import { prisma } from "@/lib/prisma";

/**
 * Owner switch (superadmin "Terms & Bookings" page): should a confirmed online
 * payment activate the booking/course it was started for automatically?
 *
 * Off by default. When off, the money is credited to the student's wallet and
 * the student chooses what to enroll in themselves (/choose-course).
 */
export const AUTO_ENROLL_SETTING_KEY = "auto_enroll_after_payment";

export async function isAutoEnrollEnabled(db: { appSetting: typeof prisma.appSetting } = prisma): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: AUTO_ENROLL_SETTING_KEY }, select: { value: true } });
  return row?.value === "true";
}
