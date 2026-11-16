"use client";

export function PhotoLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="عرض الصورة"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-3 top-3 z-[101] rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#14213D]"
      >
        إغلاق
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="max-h-[100dvh] max-w-[100vw] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
