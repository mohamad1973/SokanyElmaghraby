import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CsShell } from "./cs-shell";

export const metadata: Metadata = {
  title: "Tooliano CS",
  description: "متابعة وتأكيد طلبات العملاء",
};

export default function CsLayout({ children }: { children: ReactNode }) {
  return <CsShell>{children}</CsShell>;
}
