import { NextResponse } from "next/server";
import { getMaintenanceWarning } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const warning = await getMaintenanceWarning();
    return NextResponse.json(warning, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      { active: false, message: "" },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }
}
