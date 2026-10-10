"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/admin/ui/kit";

interface ExtraField {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}

interface Props {
  title: string;
  description: string;
  actionLabel: string;
  variant: "danger" | "warning";
  /** Optional extra input rendered above the password field (e.g. new teacher name) */
  extraField?: ExtraField;
  /** Receives the admin password. Should throw an Error with an Arabic message on failure. */
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}

function storedActionPassword() {
  try {
    return sessionStorage.getItem("admin_action_password") || "";
  } catch {
    return "";
  }
}

export function ConfirmActionModal({ title, description, actionLabel, variant, extraField, onConfirm, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [fromKey, setFromKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isDanger = variant === "danger";

  // Pre-fill from the header "action key" when the owner saved it this session.
  useEffect(() => {
    const saved = storedActionPassword();
    if (saved) {
      setPassword(saved);
      setFromKey(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("أدخل كلمة مرور المشرف");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
      setFromKey(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="sm"
      title={title}
      icon={
        <span
          className="w-9 h-9 rounded-[10px] grid place-items-center"
          style={{
            background: isDanger ? "var(--danger-soft)" : "var(--warn-soft)",
            color: isDanger ? "var(--danger)" : "var(--warn)",
          }}
        >
          {isDanger ? <AlertTriangle size={18} /> : <BellRing size={18} />}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button type="submit" form="adm-confirm-action" variant={isDanger ? "danger-solid" : "primary"} loading={submitting}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <form id="adm-confirm-action" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {description}
        </p>

        {extraField && (
          <Field label={extraField.label} htmlFor="adm-confirm-extra">
            <Input
              id="adm-confirm-extra"
              data-autofocus
              type={extraField.type ?? "text"}
              required
              value={extraField.value}
              onChange={(e) => extraField.onChange(e.target.value)}
              placeholder={extraField.placeholder}
            />
          </Field>
        )}

        <Field
          label="كلمة مرور المشرف للتأكيد"
          htmlFor="adm-confirm-pass"
          error={error || undefined}
          hint={fromKey ? "مُعبّأة من مفتاح الإجراءات المحفوظ في هذه الجلسة." : undefined}
        >
          <Input
            id="adm-confirm-pass"
            {...(extraField || fromKey ? {} : { "data-autofocus": true })}
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFromKey(false);
              if (error) setError("");
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={error ? true : undefined}
          />
        </Field>
      </form>
    </Modal>
  );
}
