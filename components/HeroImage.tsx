"use client";

import { useState, useEffect, memo } from "react";

interface HeroImageProps {
  className?: string;
}

const HeroImage = memo(function HeroImage({ className }: HeroImageProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Array com as imagens do carrossel
  const images = [
    "/images/1.webp",
    "/images/2.webp",
    "/images/3.webp",
    "/images/4.webp",
    "/images/5.webp",
  ];

  // Efeito para trocar as imagens a cada 3 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3000); // 3 segundos

    return () => clearInterval(interval);
  }, [images.length]);

  const handleImageError = () => {
    setImageError(true);
  };

  if (imageError) {
    return (
      <div
        className={`w-full h-full bg-pink-400 flex items-center justify-center ${
          className || ""
        }`}
      >
        <div className="text-white text-center p-8">
          <h2 className="text-4xl font-bold mb-4">HUD LAB</h2>
          <p className="text-xl">Dashboard Analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full relative overflow-hidden ${className || ""}`}
    >
      {images.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentImageIndex ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      ))}
    </div>
  );
});

export default HeroImage;
