import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeTokens } from "./theme";
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
};
export const metadata: Metadata = {
  title: "Resibo’ko — A little less paper",
  description:
    "Your receipts, neatly in one place. Scan, organize, and understand your spending.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      {/* Browser extensions may add body attributes before React hydrates. */}
      <body suppressHydrationWarning>
        <ThemeTokens />
        {children}
      </body>
    </html>
  );
}
