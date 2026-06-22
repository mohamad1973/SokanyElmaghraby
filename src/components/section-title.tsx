import { VisualEditableText } from "./visual-editable-text";

type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  textKeyPrefix?: string;
};

export function SectionTitle({ eyebrow, title, description, textKeyPrefix }: SectionTitleProps) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      {eyebrow ? (
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-brand-gold">
          <VisualEditableText textKey={`${textKeyPrefix || title}.eyebrow`}>{eyebrow}</VisualEditableText>
        </p>
      ) : null}
      <h2 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
        <VisualEditableText textKey={`${textKeyPrefix || title}.title`}>{title}</VisualEditableText>
      </h2>
      {description ? (
        <p className="mt-4 leading-8 text-zinc-600">
          <VisualEditableText textKey={`${textKeyPrefix || title}.description`}>{description}</VisualEditableText>
        </p>
      ) : null}
    </div>
  );
}

