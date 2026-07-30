import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SmoothScroll } from "@/components/experience/smooth-scroll";

export const metadata: Metadata = {
  title: {
    default: "Vespera — The Bestiary",
    template: "%s · Vespera",
  },
  description:
    "An immersive dark-fantasy bestiary of monsters, lore, weaknesses, and encounters.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
