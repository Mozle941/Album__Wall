import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Albumwall",
  description: "Create device wallpapers from artwork you own or are licensed to use.",
};

export const viewport: Viewport = { themeColor: "#121212" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#121212", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
