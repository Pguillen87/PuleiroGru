import type { ButtonHTMLAttributes, ReactNode } from "react";

type StageButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary";
  children: ReactNode;
};

export function StageButton({ tone = "primary", className = "", ...props }: StageButtonProps) {
  return <button className={`stage-button stage-button--${tone} ${className}`} {...props} />;
}
