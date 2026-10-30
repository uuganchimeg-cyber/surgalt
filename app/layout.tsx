import type { Metadata } from "next";
import type { Viewport } from "next";
import "./globals.css";
import DisableBrowserZoom from "@/components/disable-browser-zoom";

export const metadata: Metadata = {
  title: "Эрдэм | Сургалтын удирдлага",
  description: "Сургалтын төвийн өдөр тутмын үйл ажиллагааны платформ.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn">
      <body>
        {children}
        <DisableBrowserZoom />
      </body>
    </html>
  );
}
