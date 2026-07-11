import type { ReactNode } from "react";

type ProductSpecRowProps = {
  label: ReactNode;
  value: string;
  striped?: boolean;
};

export function ProductSpecRow({ label, value, striped = false }: ProductSpecRowProps) {
  return (
    <div
      className={[
        "flex justify-between gap-4 border-b border-black/5 py-3 text-sm",
        striped ? "bg-zinc-50" : "bg-white",
      ].join(" ")}
    >
      <span className="font-bold text-zinc-500">{label}</span>
      <span className="text-left font-bold text-zinc-950">{value}</span>
    </div>
  );
}
