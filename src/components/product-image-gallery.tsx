"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type ProductImageGalleryProps = {
  images: string[];
  productName: string;
};

export function ProductImageGallery({ images, productName }: ProductImageGalleryProps) {
  const galleryImages = useMemo(() => images.filter(Boolean), [images]);
  const galleryKey = galleryImages.join("|");
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const selectedImage = galleryImages[selectedIndex] || "/product-placeholder.svg";

  function selectImage(index: number) {
    activeIndexRef.current = index;
    setSelectedIndex(index);
  }

  useEffect(() => {
    activeIndexRef.current = 0;
    setSelectedIndex(0);
    setLightboxOpen(false);
  }, [galleryKey]);

  useEffect(() => {
    if (galleryImages.length <= 3 || lightboxOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      const nextIndex = activeIndexRef.current >= galleryImages.length - 1 ? 0 : activeIndexRef.current + 1;
      const scroller = thumbnailsRef.current;
      const targetThumbnail = scroller?.children[nextIndex] as HTMLElement | undefined;

      activeIndexRef.current = nextIndex;
      setSelectedIndex(nextIndex);

      if (scroller && targetThumbnail) {
        scroller.scrollTo({
          left: targetThumbnail.offsetLeft,
          behavior: "smooth",
        });
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [galleryKey, galleryImages, lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }
      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) => (current >= galleryImages.length - 1 ? 0 : current + 1));
      }
      if (event.key === "ArrowRight") {
        setSelectedIndex((current) => (current <= 0 ? galleryImages.length - 1 : current - 1));
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen, galleryImages.length]);

  if (!galleryImages.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white bg-white p-3 shadow-sm sm:p-4">
      <div className="relative">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-black/10 bg-white"
          aria-label="تكبير صورة المنتج بملء الشاشة"
        >
          <Image
            src={selectedImage}
            alt={productName}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-5 transition duration-500 group-hover:scale-105 sm:p-8"
            unoptimized
          />
        </button>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-3 left-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/95 text-zinc-900 shadow-md transition hover:bg-brand-gold"
          aria-label="تكبير الصورة"
          title="تكبير الصورة"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6" />
            <path d="M16 16l4 4" strokeLinecap="round" />
            <path d="M11 8v6M8 11h6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {galleryImages.length > 1 ? (
        <div
          ref={thumbnailsRef}
          className="mt-4 flex gap-3 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {galleryImages.map((image, index) => {
            const isSelected = selectedIndex === index;

            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => selectImage(index)}
                className={[
                  "relative aspect-square shrink-0 basis-[calc((100%_-_1.5rem)/3)] overflow-hidden rounded-xl border bg-white transition sm:w-28 sm:basis-auto",
                  isSelected ? "border-brand-gold ring-2 ring-brand-gold/40" : "border-black/10 hover:border-brand-gold",
                ].join(" ")}
                aria-label={`عرض صورة المنتج ${index + 1}`}
              >
                <Image
                  src={image}
                  alt={`${productName} ${index + 1}`}
                  fill
                  sizes="112px"
                  className="object-contain p-2"
                  unoptimized
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="عرض صورة المنتج مكبرة"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 left-4 z-[101] rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
            onClick={() => setLightboxOpen(false)}
          >
            إغلاق
          </button>

          {galleryImages.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute right-4 top-1/2 z-[101] -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-lg font-bold"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex((current) => (current <= 0 ? galleryImages.length - 1 : current - 1));
                }}
                aria-label="الصورة السابقة"
              >
                ›
              </button>
              <button
                type="button"
                className="absolute left-4 top-1/2 z-[101] -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-lg font-bold"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex((current) => (current >= galleryImages.length - 1 ? 0 : current + 1));
                }}
                aria-label="الصورة التالية"
              >
                ‹
              </button>
            </>
          ) : null}

          <div
            className="relative h-[min(90vh,900px)] w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={selectedImage}
              alt={productName}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
              priority
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
