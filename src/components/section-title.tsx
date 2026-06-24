import { VisualEditableText } from "./visual-editable-text";
import type { ReactNode } from "react";

type SectionTitleProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  textKeyPrefix?: string;
};

export function SectionTitle({ eyebrow, title, description, textKeyPrefix }: SectionTitleProps) {
  void eyebrow;

  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      <h2 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
        {typeof title === "string" ? (
          <VisualEditableText textKey={`${textKeyPrefix || title}.title`}>{title}</VisualEditableText>
        ) : title}
      </h2>
      {description ? (
        <p className="mt-4 leading-8 text-zinc-600">
          {typeof description === "string" ? (
            <VisualEditableText textKey={`${textKeyPrefix || String(title)}.description`}>{description}</VisualEditableText>
          ) : description}
        </p>
      ) : null}
    </div>
  );
}

