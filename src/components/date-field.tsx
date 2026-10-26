"use client";

import { useEffect, useRef, useState } from "react";

import { formatDisplayYmd, parseDisplayYmd } from "@/lib/cs/order-window";

type DateFieldProps = {
  value?: string;
  defaultValue?: string;
  name?: string;
  max?: string;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (ymd: string) => void;
};

export function DateField({
  value,
  defaultValue,
  name,
  max,
  min,
  required,
  disabled,
  className = "",
  onChange,
}: DateFieldProps) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const ymd = value ?? inner;
  const [text, setText] = useState(() => formatDisplayYmd(ymd));

  useEffect(() => {
    if (focused) return;
    setText(formatDisplayYmd(value ?? inner));
  }, [value, inner, focused]);

  function commitYmd(next: string) {
    setInner(next);
    if (next) setText(formatDisplayYmd(next));
    onChange?.(next);
  }

  function openPicker() {
    if (disabled) return;
    const input = nativeRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // Picker already open, or this browser only opens it from the native control.
    }
  }

  return (
    <div
      dir="rtl"
      onClick={openPicker}
      className={`cs-date-field relative flex h-9 min-w-0 cursor-pointer items-center rounded-lg border border-[#E5E5E5] bg-[#F5F5F0] px-2.5 text-xs font-bold text-[#14213D] ${className}`}
    >
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={text}
        placeholder=""
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const parsed = parseDisplayYmd(text);
          if (parsed) commitYmd(parsed);
          else setText(formatDisplayYmd(ymd));
        }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d/\-]/g, "").slice(0, 10);
          setText(next);
          const parsed = parseDisplayYmd(next);
          if (parsed) commitYmd(parsed);
        }}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs font-bold text-[#14213D] outline-none"
      />
      <input
        ref={nativeRef}
        type="date"
        name={name}
        required={required}
        disabled={disabled}
        max={max}
        min={min}
        tabIndex={-1}
        aria-hidden="true"
        value={/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : ""}
        onChange={(event) => {
          if (event.target.value) commitYmd(event.target.value);
        }}
        className="cs-date-native"
      />
    </div>
  );
}
