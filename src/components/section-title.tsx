import { VisualEditableText } from "./visual-editable-text";

type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  textKeyPrefix?: string;
};

export function SectionTitle({ eyebrow, title, description, textKeyPrefix }: SectionTitleProps) {
  void eyebrow;

  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
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

