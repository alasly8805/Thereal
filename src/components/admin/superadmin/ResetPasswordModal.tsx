"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button, Field, Input, Modal, readJson } from "@/components/admin/ui/kit";

interface Props {
  teacherId: string;
  teacherName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResetPasswordModal({ teacherId, teacherName, onClose, onSuccess }: Props) {
  const { success: toastSuccess } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mismatch = confirm.length > 0 && confirm !== newPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    if (newPassword !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "تعذر تغيير كلمة المرور");
        return;
      }
      toastSuccess(`تم تغيير كلمة مرور "${teacherName}"`);
      onSuccess();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="sm"
      title="تغيير كلمة المرور"
      description={`المعلم: ${teacherName}`}
      icon={
        <span className="w-9 h-9 rounded-[10px] grid place-items-center" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
          <KeyRound size={18} />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button type="submit" form="adm-reset-pass" variant="primary" loading={submitting}>
            حفظ كلمة المرور
          </Button>
        </>
      }
    >
      <form id="adm-reset-pass" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="كلمة المرور الجديدة" htmlFor="rp-new" hint="٦ أحرف على الأقل">
          <Input
            id="rp-new"
            data-autofocus
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>
        <Field
          label="تأكيد كلمة المرور"
          htmlFor="rp-confirm"
          error={error || (mismatch ? "كلمتا المرور غير متطابقتين" : undefined)}
        >
          <Input
            id="rp-confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            aria-invalid={mismatch || !!error || undefined}
          />
        </Field>
      </form>
    </Modal>
  );
}
