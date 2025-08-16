"use client";

import { useState, memo } from "react";
import Image from "next/image";

interface HeroImageProps {
  className?: string;
}

const HeroImage = memo(function HeroImage({ className }: HeroImageProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  if (imageError) {
    return (
      <div className={`w-full h-full bg-pink-400 flex items-center justify-center ${className || ""}`}>
        <div className="text-white text-center p-8">
          <h2 className="text-4xl font-bold mb-4">HUD LAB</h2>
          <p className="text-xl">Dashboard Analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative ${className || ""}`}>
      <Image
        src="/images/hero-image.jpg"
        alt="HUD LAB Dashboard Analytics"
        fill
        className="object-cover"
        priority
        quality={100}
        sizes="50vw"
        onError={handleImageError}
      />
    </div>
  );
});

export default HeroImage;
