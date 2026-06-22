"use client";

import type { CSSProperties, ReactNode } from "react";

import { getVisualTextStyle, useVisualEditor } from "./visual-editor-provider";

type VisualEditableTextProps = {
  textKey: string;
  children: ReactNode;
  className?: string;
};

export function VisualEditableText({ textKey, children, className }: VisualEditableTextProps) {
  const editor = useVisualEditor();
  const style = getVisualTextStyle(editor?.styles[textKey]);
  const isSelected = editor?.selectedKey === textKey;

  const visualStyle = {
    transform: `translate(${style.x}px, ${style.y}px)`,
    fontSize: style.fontSizeDelta ? `calc(1em + ${style.fontSizeDelta}px)` : undefined,
    whiteSpace: "pre-line",
  } satisfies CSSProperties;

  return (
    <span
      role={editor?.editMode ? "button" : undefined}
      tabIndex={editor?.editMode ? 0 : undefined}
      onClick={(event) => {
        if (!editor?.editMode) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        editor.selectText(textKey);
      }}
      className={[
        "inline-block transition-transform",
        editor?.editMode ? "cursor-move rounded-sm outline outline-1 outline-dashed outline-brand-gold/70" : "",
        isSelected ? "bg-brand-gold/20 outline-2 outline-black" : "",
        className || "",
      ].join(" ")}
      style={visualStyle}
    >
      {children}
    </span>
  );
}
