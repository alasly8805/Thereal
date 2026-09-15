/**
 * VdoCipher API integration for secure video playback.
 * Supports multi-account dynamic OTP generation, custom player IDs, dynamic watermark annotations,
 * and resilient cross-account failover.
 */

import { generateAccountOtp, decryptVdoCipherSecret } from "./vdocipher-accounts";
import { prisma } from "./prisma";

export interface VdoCipherOtpResponse {
  otp: string;
  playbackInfo: string;
  embedUrl: string;
}

export interface GetVdoCipherOtpOptions {
  apiKey?: string;
  playerId?: string | null;
  userId?: string;
  watermarkText?: string;
  ttl?: number;
}

export async function getVdoCipherOtp(
  vdoCipherId: string,
  options?: GetVdoCipherOtpOptions
): Promise<VdoCipherOtpResponse> {
  const ttl = options?.ttl || Number(process.env.VDOCIPHER_OTP_TTL) || 120;
  const userId = options?.userId;
  const watermarkText = options?.watermarkText;
  let playerId = options?.playerId;

  // 1. If an explicit API key was provided, try it first
  if (options?.apiKey) {
    try {
      return await generateAccountOtp({
        apiKey: options.apiKey,
        playerId,
        vdoCipherVideoId: vdoCipherId,
        userId,
        watermarkText,
        ttl,
      });
    } catch (err) {
      console.warn(`[vdocipher] Direct apiKey attempt failed for ${vdoCipherId}:`, err);
    }
  }

  // 2. Look up the specific account linked to this asset in the database
  try {
    const asset = await prisma.vdoCipherVideoAsset.findFirst({
      where: { vdoCipherVideoId: vdoCipherId },
      include: { account: true },
    });

    if (asset?.account?.isActive && asset.account.apiKeyEnc) {
      try {
        const decryptedKey = decryptVdoCipherSecret(asset.account.apiKeyEnc);
        const resolvedPlayerId = playerId || asset.account.playerId;
        return await generateAccountOtp({
          apiKey: decryptedKey,
          playerId: resolvedPlayerId,
          vdoCipherVideoId: vdoCipherId,
          userId,
          watermarkText,
          ttl,
        });
      } catch (assetErr) {
        console.warn(`[vdocipher] Linked account ${asset.account.name} OTP failed for ${vdoCipherId}:`, assetErr);
      }
    }
  } catch (dbErr) {
    console.warn("[vdocipher] Database asset lookup warning:", dbErr);
  }

  // 3. Multi-Account Pool Failover: Try ALL active VdoCipher accounts in order
  const activeAccounts = await prisma.vdoCipherAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  for (const acc of activeAccounts) {
    if (!acc.apiKeyEnc) continue;
    try {
      const accKey = decryptVdoCipherSecret(acc.apiKeyEnc);
      const accPlayerId = playerId || acc.playerId;
      return await generateAccountOtp({
        apiKey: accKey,
        playerId: accPlayerId,
        vdoCipherVideoId: vdoCipherId,
        userId,
        watermarkText,
        ttl,
      });
    } catch (accErr) {
      console.warn(`[vdocipher] Account ${acc.name} rejected OTP for ${vdoCipherId}`);
    }
  }

  // 4. Fallback to environment variable if configured
  if (process.env.VDOCIPHER_API_SECRET) {
    return await generateAccountOtp({
      apiKey: process.env.VDOCIPHER_API_SECRET,
      playerId,
      vdoCipherVideoId: vdoCipherId,
      userId,
      watermarkText,
      ttl,
    });
  }

  throw new Error(`تعذر توليد تصريح تشغيل VdoCipher من أي من الحسابات النشطة (${activeAccounts.length} حسابات فحصت).`);
}
