const CHUNK_BYTES = 512 * 1024;
const MAX_CHUNK_ATTEMPTS = 4;

type UploadResult = { fileUrl: string; fileName: string };

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: text ? JSON.parse(text) : {} };
  } catch {
    throw new Error("استجابة غير متوقعة من الخادم، يرجى المحاولة مرة أخرى");
  }
}

function uploadHttpError(status: number, data: { error?: string }) {
  return new Error(
    data.error ||
      (status === 400
        ? "تعذر قراءة الملف. ارفع PDF أو صورة jpg/png أصغر من 10 ميجابايت"
        : "فشل رفع الملف")
  );
}

async function postUpload(homeworkId: string, formData: FormData) {
  const res = await fetch(`/api/homework/${homeworkId}/upload`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const parsed = await parseJsonResponse(res);
  if (!parsed.ok) throw uploadHttpError(parsed.status, parsed.data);
  return parsed.data as { fileUrl?: string; fileName?: string; received?: number };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a homework file as the signed-in student.
 *
 * Files larger than 512 KiB are sent as sequential chunks so a slow mobile
 * link (and Cloudflare's ~100s origin timeout) cannot abort an 8 MB PDF as
 * one POST. Each chunk is retried independently.
 */
export async function uploadHomeworkFile(homeworkId: string, file: File): Promise<UploadResult> {
  if (file.size <= CHUNK_BYTES) {
    const formData = new FormData();
    formData.append("file", file);
    const data = await postUpload(homeworkId, formData);
    if (!data.fileUrl) throw new Error("فشل رفع الملف");
    return { fileUrl: data.fileUrl, fileName: data.fileName || file.name };
  }

  const uploadId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `u${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunkTotal = Math.ceil(file.size / CHUNK_BYTES);

  for (let index = 0; index < chunkTotal; index += 1) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_CHUNK_ATTEMPTS; attempt += 1) {
      try {
        const slice = file.slice(index * CHUNK_BYTES, Math.min(file.size, (index + 1) * CHUNK_BYTES));
        const formData = new FormData();
        formData.append("file", slice, file.name);
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(index));
        formData.append("chunkTotal", String(chunkTotal));
        formData.append("originalName", file.name);
        formData.append("fileSize", String(file.size));
        formData.append("fileType", file.type || "");
        const data = await postUpload(homeworkId, formData);
        if (data.fileUrl) {
          return { fileUrl: data.fileUrl, fileName: data.fileName || file.name };
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        await delay(400 * 2 ** attempt);
      }
    }
    if (lastError) throw lastError;
  }

  throw new Error("لم يكتمل رفع الملف. تحقق من الاتصال وأعد المحاولة");
}

export function homeworkUploadNetworkMessage(err: unknown) {
  if (!(err instanceof Error)) return "تعذر رفع الملف";
  if (/failed to fetch|networkerror|load failed|aborted/i.test(err.message)) {
    return "تعذر الاتصال بالخادم أثناء رفع الملف. تحقق من اتصال الإنترنت وحجم الملف (حد أقصى 10 ميجابايت) ثم أعد المحاولة";
  }
  return err.message;
}
