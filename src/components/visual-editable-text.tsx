"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

import { getVisualTextStyle, useVisualEditor } from "./visual-editor-provider";

type VisualEditableTextProps = {
  textKey: string;
  children: ReactNode;
  className?: string;
};

type VisualEditableStyle = CSSProperties & {
  "--visual-mobile-x": string;
  "--visual-mobile-y": string;
  "--visual-mobile-font-delta": string;
  "--visual-mobile-align": string;
  "--visual-desktop-x": string;
  "--visual-desktop-y": string;
  "--visual-desktop-font-delta": string;
  "--visual-desktop-align": string;
};

export function VisualEditableText({ textKey, children, className }: VisualEditableTextProps) {
  const editor = useVisualEditor();
  const style = getVisualTextStyle(editor?.styles[textKey]);
  const isSelected = editor?.selectedKey === textKey;
  const editableText = editor?.content[textKey] ?? (typeof children === "string" ? children : undefined);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const visualStyle = {
    "--visual-mobile-x": `${style.mobile.x}px`,
    "--visual-mobile-y": `${style.mobile.y}px`,
    "--visual-mobile-font-delta": `${style.mobile.fontSizeDelta}px`,
    "--visual-mobile-align": style.mobile.align,
    "--visual-desktop-x": `${style.desktop.x}px`,
    "--visual-desktop-y": `${style.desktop.y}px`,
    "--visual-desktop-font-delta": `${style.desktop.fontSizeDelta}px`,
    "--visual-desktop-align": style.desktop.align,
    direction: "rtl",
    transform: "translate(var(--visual-current-x), var(--visual-current-y))",
    fontSize: "calc(1em + var(--visual-current-font-delta))",
    textAlign: "var(--visual-current-align)" as CSSProperties["textAlign"],
    unicodeBidi: "plaintext",
    whiteSpace: "pre-line",
  } as unknown as VisualEditableStyle;

  return (
    <span
      role={editor?.editMode ? "button" : undefined}
      tabIndex={editor?.editMode ? 0 : undefined}
      contentEditable={editor?.editMode || undefined}
      dir="rtl"
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
      onPointerDown={(event) => {
        if (!editor?.editMode || event.pointerType !== "touch") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        editor.selectText(textKey);
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!editor?.editMode || !dragRef.current || dragRef.current.pointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        const deltaX = event.clientX - dragRef.current.x;
        const deltaY = event.clientY - dragRef.current.y;
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        editor.moveText(textKey, deltaX, deltaY);
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onFocus={() => {
        if (!editor?.editMode) {
          return;
        }

        editor.selectText(textKey);
      }}
      onInput={(event) => {
        if (!editor?.editMode) {
          return;
        }

        editor.updateContent(textKey, event.currentTarget.textContent || "");
      }}
      className={[
        "relative inline-block [--visual-current-align:var(--visual-mobile-align)] [--visual-current-font-delta:var(--visual-mobile-font-delta)] [--visual-current-x:var(--visual-mobile-x)] [--visual-current-y:var(--visual-mobile-y)] sm:[--visual-current-align:var(--visual-desktop-align)] sm:[--visual-current-font-delta:var(--visual-desktop-font-delta)] sm:[--visual-current-x:var(--visual-desktop-x)] sm:[--visual-current-y:var(--visual-desktop-y)]",
        editor?.editMode ? "min-w-4 cursor-text rounded-md px-1 outline outline-2 outline-dashed outline-brand-gold/80 hover:bg-brand-gold/15 focus:bg-brand-gold/20 focus:outline-black" : "",
        isSelected ? "touch-none bg-brand-gold/25 outline-4 outline-black ring-4 ring-brand-gold/40" : "",
        className || "",
      ].join(" ")}
      style={visualStyle}
    >
      {editableText ?? children}
    </span>
  );
}
