"use client";

import { useVisualEditor } from "./visual-editor-provider";

export function VisualEditorToolbar() {
  const editor = useVisualEditor();
  const activeDeviceLabel = editor?.device === "mobile" ? "الموبايل" : "الديسكتوب";

  if (!editor?.isAdmin || !editor.editMode) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full border border-black/10 bg-white/95 px-3 py-2 text-sm shadow-2xl backdrop-blur" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {editor.selectedKey ? (
          <div className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1">
            <span className="px-2 text-xs font-bold text-zinc-600">محاذاة {activeDeviceLabel}</span>
            {[
              ["right", "يمين"],
              ["center", "وسط"],
              ["left", "يسار"],
            ].map(([align, label]) => (
              <button
                key={align}
                type="button"
                onClick={() => editor.setTextAlign(editor.selectedKey || "", align as "right" | "center" | "left")}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-brand-gold"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void editor.save()}
          disabled={editor.isSaving}
          className="rounded-full bg-brand-gold px-4 py-2 font-bold text-black disabled:opacity-60"
        >
          {editor.isSaving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}
