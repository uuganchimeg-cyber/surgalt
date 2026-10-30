import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Эрдэм | Сургалтын удирдлага",
  description: "Сургалтын төвийн өдөр тутмын үйл ажиллагааны платформ.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
