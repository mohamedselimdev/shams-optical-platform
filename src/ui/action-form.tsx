"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/server/action";
import { cn } from "./cn";

type State = ActionResult<unknown> | null;
export type FormAction = (prev: State, formData: FormData) => Promise<State>;

const FormStateContext = createContext<State>(null);
export const useFormState = () => useContext(FormStateContext);
const FormPendingContext = createContext(false);
/** True while the enclosing ActionForm's action is running. */
export const useFormPending = () => useContext(FormPendingContext);

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
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  // With JavaScript, submit manually so React does not reset uncontrolled fields after the action
  // (users keep their input when validation fails). Without JavaScript, the native action still works.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return (
    <FormStateContext.Provider value={state}>
      <FormPendingContext.Provider value={pending}>
        <form ref={ref} action={formAction} onSubmit={onSubmit} className={className} id={id} noValidate>
          <FormStatus state={state} showSuccess={showSuccess} />
          {children}
        </form>
      </FormPendingContext.Provider>
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
