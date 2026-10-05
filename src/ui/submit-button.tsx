"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { useFormPending } from "./action-form";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";
import { useT } from "@/i18n/client";

export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { pendingLabel?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const t = useT();
  const status = useFormStatus();
  const actionPending = useFormPending();
  const pending = status.pending || actionPending;
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel ?? t("جارٍ الحفظ…")}
        </>
      ) : (
        children
      )}
    </button>
  );
}
