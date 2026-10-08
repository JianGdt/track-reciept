import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Resibo’ko",
    short_name: "Resibo’ko",
    description: "Your receipts, neatly in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#15191f",
    theme_color: "#15191f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
