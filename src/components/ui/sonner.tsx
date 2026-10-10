"use client";

import { Toaster as Sonner, toast } from "sonner";

export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="top-center"
      dir="rtl"
      richColors
      closeButton
      theme="system"
      toastOptions={{
        style: {
          fontFamily: "var(--font-ibm, inherit)",
          borderRadius: "0.75rem",
        },
      }}
      {...props}
    />
  );
}

export { toast };
