"use client";

import { useState, type MouseEvent } from "react";

import { formatDisplayYmd } from "@/lib/cs/order-window";

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
  const [inner, setInner] = useState(defaultValue ?? "");
  const ymd = value ?? inner;
  const display = formatDisplayYmd(ymd);

  function openPicker(event: MouseEvent<HTMLDivElement>) {
    const input = event.currentTarget.querySelector("input[type='date']");
    if (!(input instanceof HTMLInputElement) || disabled) return;
    input.focus();
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
      <span className="pointer-events-none min-w-0 flex-1 truncate text-right">
        {display || "يوم-شهر-سنة"}
      </span>
      <input
        type="date"
        name={name}
        required={required}
        disabled={disabled}
        max={max}
        min={min}
        value={value ?? inner}
        onChange={(event) => {
          setInner(event.target.value);
          onChange?.(event.target.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
