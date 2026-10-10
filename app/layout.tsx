import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeTokens } from "./theme";
import { PwaProvider } from "@/components/pwa";
const geist = localFont({
  src: "./fonts/Geist-Variable.ttf",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#15191f",
};
export const metadata: Metadata = {
  applicationName: "ResiVault",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ResiVault" },
  icons: {
    icon: { url: "/icons/resivault-tab.svg", type: "image/svg+xml", sizes: "any" },
    apple: "/icons/apple-touch-icon.png",
  },
  title: "ResiVault — Receipt Tracker",
  description:
    "Your receipts, neatly in one place. Scan, organize, and understand your spending.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      {/* Browser extensions may add body attributes before React hydrates. */}
      <body suppressHydrationWarning>
        <ThemeTokens />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
