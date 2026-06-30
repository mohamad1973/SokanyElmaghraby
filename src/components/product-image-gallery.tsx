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
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] || "/product-placeholder.svg");
  const [isZoomed, setIsZoomed] = useState(false);

  function selectImage(image: string, index: number) {
    activeIndexRef.current = index;
    setSelectedImage(image);
    setIsZoomed(false);
  }

  useEffect(() => {
    activeIndexRef.current = 0;
    setSelectedImage(galleryImages[0] || "/product-placeholder.svg");
    setIsZoomed(false);
  }, [galleryKey, galleryImages]);

  useEffect(() => {
    if (galleryImages.length <= 3) {
      return;
    }

    const interval = window.setInterval(() => {
      const nextIndex = activeIndexRef.current >= galleryImages.length - 1 ? 0 : activeIndexRef.current + 1;
      const scroller = thumbnailsRef.current;
      const targetThumbnail = scroller?.children[nextIndex] as HTMLElement | undefined;

      activeIndexRef.current = nextIndex;

      if (scroller && targetThumbnail) {
        scroller.scrollTo({
          left: targetThumbnail.offsetLeft,
          behavior: "smooth",
        });
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [galleryKey, galleryImages]);

  if (!galleryImages.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white bg-white p-3 shadow-sm sm:p-4">
      <button
        type="button"
        onClick={() => setIsZoomed((currentValue) => !currentValue)}
        className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-black/10 bg-white"
        aria-label="تكبير صورة المنتج"
      >
        <Image
          src={selectedImage}
          alt={productName}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={[
            "object-contain p-5 transition duration-500 sm:p-8",
            "group-hover:scale-110",
            isZoomed ? "scale-125" : "scale-100",
          ].join(" ")}
          unoptimized
        />
      </button>

      {galleryImages.length > 1 ? (
        <div
          ref={thumbnailsRef}
          className="mt-4 flex gap-3 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {galleryImages.map((image, index) => {
            const isSelected = selectedImage === image;

            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => selectImage(image, index)}
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
    </div>
  );
}
