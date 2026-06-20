type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function SectionTitle({ eyebrow, title, description }: SectionTitleProps) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      {eyebrow ? (
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-brand-gold">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 leading-8 text-zinc-600">{description}</p> : null}
    </div>
  );
}

