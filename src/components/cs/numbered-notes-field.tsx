"use client";

import { useRef, type MutableRefObject, type RefObject } from "react";

export function initialNumberedNotes(raw: string) {
  const text = String(raw || "").trim();
  return text || "1- ";
}

export function nextNumberedNoteNumber(notes: string) {
  const matches = [...String(notes || "").matchAll(/^\s*(\d+)\s*-/gm)];
  const last = matches.length ? Number(matches[matches.length - 1][1]) : 0;
  return (Number.isFinite(last) ? last : 0) + 1;
}

export function appendNumberedNoteLine(notes: string) {
  const n = nextNumberedNoteNumber(notes);
  const trimmed = String(notes || "").replace(/\s+$/, "");
  return `${trimmed ? `${trimmed}\n` : ""}${n}- `;
}

export function focusNotesEnd(box: HTMLTextAreaElement | null) {
  if (!box) return;
  box.focus();
  const end = box.value.length;
  box.setSelectionRange(end, end);
  box.scrollTop = box.scrollHeight;
}

/** Double-click or double-tap (<350ms) — returns true when activated. */
export function shouldActivateNumberedNote(
  event: { preventDefault: () => void; type: string },
  lastTap: { current: number },
) {
  const now = Date.now();
  if (event.type === "dblclick" || (event.type === "touchend" && now - lastTap.current < 350)) {
    event.preventDefault();
    lastTap.current = 0;
    return true;
  }
  if (event.type === "touchend") lastTap.current = now;
  return false;
}

const DEFAULT_TEXTAREA =
  "min-h-36 w-full rounded-xl border border-[#E5E5E5] bg-[#F5F5F0] px-3 py-2 text-sm font-bold text-[#14213D] outline-none focus:border-[#FCA311]";

export function NumberedNotesField({
  value,
  onChange,
  label = "ملاحظات العميل",
  rows = 7,
  disabled = false,
  className = DEFAULT_TEXTAREA,
  textareaRef,
  lastTapRef,
  onAppend,
  showLabel = true,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  lastTapRef?: MutableRefObject<number>;
  /** When set, double-activate calls this instead of appending locally via onChange. */
  onAppend?: () => void;
  showLabel?: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const localTap = useRef(0);
  const boxRef = textareaRef || localRef;
  const tapRef = lastTapRef || localTap;

  function append() {
    if (onAppend) {
      onAppend();
      return;
    }
    onChange(appendNumberedNoteLine(value));
    window.requestAnimationFrame(() => focusNotesEnd(boxRef.current));
  }

  function onActivate(event: { preventDefault: () => void; type: string }) {
    if (disabled) return;
    if (shouldActivateNumberedNote(event, tapRef)) append();
  }

  const field = (
    <textarea
      ref={boxRef}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onDoubleClick={onActivate}
      onTouchEnd={onActivate}
      rows={rows}
      className={className}
      placeholder="1- "
    />
  );

  if (!showLabel) return field;

  return (
    <label className="grid gap-1 rounded-2xl bg-white p-3 text-sm font-bold text-[#14213D] shadow ring-1 ring-[#14213D]/15">
      {label}
      {field}
    </label>
  );
}
