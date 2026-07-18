import Link from "next/link";

import type { MenuNode } from "@/lib/types";

export function MobileMenuTree({
  items,
  depth = 0,
  onNavigate,
}: {
  items: MenuNode[];
  depth?: number;
  onNavigate: () => void;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <ul className={depth ? "mt-2 grid gap-2 border-r border-black/10 pr-3" : "grid gap-2"}>
      {items.map((item) => (
        <li key={item.id} className={depth ? "" : "rounded-2xl border border-black/10 bg-white"}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className={[
              "flex items-center justify-between rounded-2xl px-4 py-3 font-bold transition hover:bg-brand-gold hover:text-black",
              depth ? "bg-zinc-50 text-sm text-zinc-700" : "bg-white text-sm text-zinc-950",
            ].join(" ")}
          >
            <span className="inline-flex items-center gap-2">
              {item.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.iconUrl} alt="" className="h-5 w-5 shrink-0 object-contain" />
              ) : null}
              <span>{item.title}</span>
            </span>
            {item.children.length && !depth ? <span className="text-xs text-zinc-400">‹</span> : null}
          </Link>
          <MobileMenuTree items={item.children} depth={depth + 1} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}
