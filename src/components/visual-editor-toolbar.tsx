"use client";

import { useVisualEditor } from "./visual-editor-provider";

export function VisualEditorToolbar() {
  const editor = useVisualEditor();

  if (!editor?.isAdmin) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-[100] max-w-sm rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-2xl" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => editor.setEditMode(!editor.editMode)}
          className="rounded-xl bg-black px-4 py-2 font-bold text-white"
        >
          {editor.editMode ? "إيقاف تعديل النص" : "تفعيل تعديل النص"}
        </button>
        <button
          type="button"
          onClick={() => void editor.save()}
          disabled={editor.isSaving}
          className="rounded-xl bg-brand-gold px-4 py-2 font-bold text-black disabled:opacity-60"
        >
          {editor.isSaving ? "جاري الحفظ..." : "حفظ"}
        </button>
        <button
          type="button"
          onClick={editor.resetSelected}
          disabled={!editor.selectedKey}
          className="rounded-xl border border-black/10 px-4 py-2 font-bold text-zinc-700 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
      <p className="mt-3 leading-6 text-zinc-600">
        حدد النص ثم استخدم الأسهم للتحريك. اضغط Shift مع الأسهم للحركة الأسرع. Ctrl + سهم فوق/تحت للتكبير والتصغير.
      </p>
      {editor.selectedKey ? <p className="mt-2 text-xs font-bold text-zinc-500">النص المحدد: {editor.selectedKey}</p> : null}
      {editor.status ? <p className="mt-2 text-xs font-bold text-zinc-950">{editor.status}</p> : null}
    </div>
  );
}
