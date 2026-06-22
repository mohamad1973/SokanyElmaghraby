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
  const editableText = editor?.content[textKey] ?? (typeof children === "string" ? children : undefined);

  const visualStyle = {
    transform: `translate(${style.x}px, ${style.y}px)`,
    fontSize: style.fontSizeDelta ? `calc(1em + ${style.fontSizeDelta}px)` : undefined,
    whiteSpace: "pre-line",
  } satisfies CSSProperties;

  return (
    <span
      role={editor?.editMode ? "button" : undefined}
      tabIndex={editor?.editMode ? 0 : undefined}
      contentEditable={editor?.editMode || undefined}
      suppressContentEditableWarning
      title={editor?.editMode ? `Editable text: ${textKey}` : undefined}
      data-text-key={editor?.editMode ? textKey : undefined}
      onClick={(event) => {
        if (!editor?.editMode) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        editor.selectText(textKey);
      }}
      onInput={(event) => {
        if (!editor?.editMode) {
          return;
        }

        editor.updateContent(textKey, event.currentTarget.textContent || "");
      }}
      className={[
        "relative inline-block transition-transform",
        editor?.editMode ? "cursor-text rounded-md px-1 outline outline-2 outline-dashed outline-brand-gold/80 hover:bg-brand-gold/15" : "",
        isSelected ? "bg-brand-gold/25 outline-4 outline-black ring-4 ring-brand-gold/40" : "",
        className || "",
      ].join(" ")}
      style={visualStyle}
    >
      {editableText ?? children}
    </span>
  );
}
