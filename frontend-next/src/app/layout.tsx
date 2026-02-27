import type { Metadata } from "next";

import { ServiceWorkerRegister } from "@/components/sw-register";

import "./globals.css";

export const metadata: Metadata = {
  title: "Expense Chat Pro",
  description: "Next.js app layer with typed contracts, encryption, offline support, and secure local storage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
