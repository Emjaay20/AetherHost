import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import "./landing.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-landing-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-landing-mono",
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`landing ${sans.variable} ${mono.variable} ${sans.className}`}>
      {children}
      <Script
        id="flowmeet-widget"
        src="https://flowmeet.aetherhost.app/widget.js"
        strategy="afterInteractive"
        data-slug="aetherhost"
        data-no-button="true"
      />
    </div>
  );
}
