"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/server/action";
import { cn } from "./cn";

type State = ActionResult<unknown> | null;
export type FormAction = (prev: State, formData: FormData) => Promise<State>;

const FormStateContext = createContext<State>(null);
export const useFormState = () => useContext(FormStateContext);

/**
 * Progressive-enhancement form bound to a server action. Field components read validation
 * errors from context; a status banner shows the server's message. Works without JavaScript.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
  id,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={className} id={id} noValidate>
        <FormStatus state={state} showSuccess={showSuccess} />
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function FormStatus({ state, showSuccess = true }: { state: State; showSuccess?: boolean }) {
  if (!state) return null;
  if (state.ok && (!showSuccess || !state.message)) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={cn(
        "mb-4 rounded-md border px-4 py-3 text-sm animate-fade-in",
        state.ok ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger",
      )}
    >
      {state.ok ? state.message : state.error}
    </div>
  );
}

export function useFieldError(name: string): string | undefined {
  const state = useFormState();
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[name];
}
