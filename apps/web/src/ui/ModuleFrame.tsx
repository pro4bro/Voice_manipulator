import type { ReactNode } from "react";

interface ModuleFrameProps {
  eyebrow?: string;
  title?: string;
  index?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "paper" | "dark" | "warm";
}

export function ModuleFrame({
  eyebrow,
  title,
  index,
  action,
  children,
  className = "",
  tone = "paper",
}: ModuleFrameProps) {
  return (
    <section className={`module-frame module-frame--${tone} ${className}`}>
      <header className="module-frame__header">
        <div className="module-frame__identity">
          {index ? <span className="module-frame__index">{index}</span> : null}
          <div className="module-frame__copy">
            {title ? <h2>{title}</h2> : null}
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="module-frame__body">{children}</div>
    </section>
  );
}