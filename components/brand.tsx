import Image from "next/image";
import LOGO from "@/public/resivault-logo.png";

export function Brand() {
  return (
    <a href="/" className="brand" aria-label="ResiVault home">
      <span className="brand-logo">
        <Image
          src={LOGO}
          alt="ResiVault"
          width={LOGO.width}
          height={LOGO.height}
          unoptimized
          priority
        />
      </span>
    </a>
  );
}
