import Image from "next/image";
import LOGO from "@/public/logo.png";

export function Brand() {
  return (
    <a href="/" className="brand" aria-label="Resibo’ko home">
      <span className="brand-logo">
        <Image
          src={LOGO}
          alt="Resibo’ko — Tago’ko"
          width={LOGO.width}
          height={LOGO.height}
          unoptimized
          priority
        />
      </span>
    </a>
  );
}
