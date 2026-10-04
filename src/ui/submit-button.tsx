"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { pendingLabel?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel ?? "جارٍ الحفظ…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
