import { verifyDrmPassword, verifyVdoCipherSecurityPassword } from "./admin-auth";

export interface DrmUser {
  id?: string;
  name?: string | null;
  role?: string | null;
  isOwner?: boolean;
}

export const AUTHORIZED_DRM_TEACHER_ID = "cms96imqx0003qxhnvmkhhr59";

/**
 * Checks if user is inherently authorized for DRM (Superadmin/Owner or Mohamed Abdelbaset).
 */
export function isDrmAuthorized(user: DrmUser | null | undefined): boolean {
  if (!user) return false;

  // 1. Superadmin / Admin / Owner
  if (user.role === "superadmin" || user.role === "admin" || user.isOwner) {
    return true;
  }

  // 2. Teacher: Specifically Mohamed Abdelbaset (أ/محمد عبدالباسط)
  if (user.id === AUTHORIZED_DRM_TEACHER_ID) {
    return true;
  }

  if (user.name) {
    const cleanName = user.name.replace(/\s+/g, "").toLowerCase();
    if (cleanName.includes("عبدالباسط") || cleanName.includes("عبدالاسط") || cleanName.includes("abdelbaset")) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a DRM request is authorized:
 * - Inherently authorized user (Superadmin/Owner/Mohamed Abdelbaset), OR
 * - Valid security password provided (DRM password or VdoCipher password).
 */
export async function isDrmRequestAuthorized(
  user: DrmUser | null | undefined,
  password?: string | null
): Promise<boolean> {
  if (isDrmAuthorized(user)) return true;
  if (!password) return false;
  const trimmed = password.trim();
  if (verifyDrmPassword(trimmed)) return true;
  if (await verifyVdoCipherSecurityPassword(trimmed)) return true;
  return false;
}
