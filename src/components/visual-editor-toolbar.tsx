"use client";

import { useVisualEditor } from "./visual-editor-provider";

export function VisualEditorToolbar() {
  const editor = useVisualEditor();

  if (!editor?.isAdmin) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full border border-black/10 bg-white/95 px-3 py-2 text-sm shadow-2xl backdrop-blur" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => editor.setEditMode(!editor.editMode)}
          className="rounded-full bg-black px-4 py-2 font-bold text-white"
        >
          {editor.editMode ? "إيقاف تعديل النص" : "تفعيل تعديل النص"}
        </button>
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
