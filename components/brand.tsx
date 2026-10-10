import Image from "next/image";
import LOGO from "@/public/resivault-logo.png";

export function Brand() {
  return (
    <a href="/" className="brand" aria-label="ResiVault home">
      <span className="brand-logo">
        <Image
          src={LOGO}
          alt="ResiVault"
          width={186}
          height={Math.round((186 * LOGO.height) / LOGO.width)}
          sizes="186px"
          preload
        />
      </span>
    </a>
  );
}
