import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs'
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AetherHost | Agency Dashboard",
  description: "Manage your applications and quotas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased min-h-screen selection:bg-primary selection:text-primary-foreground`}
      ><ClerkProvider>
          {children}
        </ClerkProvider></body>
    </html>
  );
}
