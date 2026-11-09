import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ClassLedger · School report cards",
  description:
    "A clear path from teacher marks to approved student report cards.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
