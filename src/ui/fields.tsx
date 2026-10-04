"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { useFieldError } from "./action-form";
import { cn } from "./cn";

const control =
  "block w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-sun-500 focus:outline-none focus:ring-2 focus:ring-sun-200 disabled:bg-surface-2 aria-[invalid=true]:border-danger";

type FieldProps = { label?: ReactNode; hint?: ReactNode; name: string; errorKey?: string; className?: string; required?: boolean };

function FieldShell({ label, hint, error, id, className, required, children }: { label?: ReactNode; hint?: ReactNode; error?: string; id: string; className?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-ink-soft">
          {label}
          {required ? <span className="ms-0.5 text-danger" aria-hidden>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({ label, hint, name, errorKey, className, required, ...props }: FieldProps & Omit<ComponentProps<"input">, "name">) {
  const id = useId();
  const error = useFieldError(errorKey ?? name);
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className} required={required}>
      <input id={id} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={cn(control, "h-10")} {...props} />
    </FieldShell>
  );
}

export function TextArea({ label, hint, name, errorKey, className, required, ...props }: FieldProps & Omit<ComponentProps<"textarea">, "name">) {
  const id = useId();
  const error = useFieldError(errorKey ?? name);
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className} required={required}>
      <textarea id={id} name={name} required={required} aria-invalid={Boolean(error)} className={cn(control, "min-h-24 py-2")} {...props} />
    </FieldShell>
  );
}

export function SelectField({ label, hint, name, errorKey, className, required, options, placeholder, ...props }: FieldProps & Omit<ComponentProps<"select">, "name"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  const error = useFieldError(errorKey ?? name);
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className} required={required}>
      <select id={id} name={name} required={required} aria-invalid={Boolean(error)} className={cn(control, "h-10 pe-8")} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, name, className, hint, ...props }: { label: ReactNode; name: string; className?: string; hint?: ReactNode } & Omit<ComponentProps<"input">, "name" | "type">) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input id={id} type="checkbox" name={name} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-ink" {...props} />
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
        {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
      </label>
    </div>
  );
}
