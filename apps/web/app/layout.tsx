import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "sandboxed/cli",
  description: "Run coding agents in isolated sandboxed virtual machines.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="app-shell">{children}</body>
    </html>
  );
}
