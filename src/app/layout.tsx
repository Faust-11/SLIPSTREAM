import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slipstream",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
