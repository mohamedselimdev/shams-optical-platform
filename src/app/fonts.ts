import { Alexandria, IBM_Plex_Sans_Arabic } from "next/font/google";

export const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const alexandria = Alexandria({
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-alexandria",
  display: "swap",
});
