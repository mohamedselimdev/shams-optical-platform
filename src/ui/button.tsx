import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const variants = {
  primary: "bg-ink text-surface hover:bg-ink-soft",
  accent: "bg-sun-400 text-ink hover:bg-sun-300",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-2",
  ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
  link: "text-sun-700 underline-offset-4 hover:underline px-0",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-9 w-9 justify-center",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
