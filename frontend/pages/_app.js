import { Orbitron, Rajdhani } from "next/font/google";
import "../styles/globals.css";

const displayFont = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800", "900"],
});

const bodyFont = Rajdhani({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export default function App({ Component, pageProps }) {
  return (
    <main className={`${displayFont.variable} ${bodyFont.variable} font-body`}>
      <Component {...pageProps} />
    </main>
  );
}
