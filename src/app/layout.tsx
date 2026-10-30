import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

/**
 * Render every route per request.
 *
 * The production Content-Security-Policy is nonce-based. Next.js only stamps
 * the nonce onto the inline bootstrap scripts it emits when the HTML is
 * rendered at request time — a statically prerendered page is built ahead of
 * time with no request context, so its scripts carry no nonce, the browser
 * blocks them, and the page renders blank.
 *
 * Declaring this in the *root* layout covers every route beneath it,
 * including the built-in `_not-found` page and any route added later, so a
 * new page can never silently ship with a blank-page CSP failure.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlimited Google Storage",
  description:
    "Distribute uploads across multiple Google accounts for unlimited free storage. Sign in once, link as many Google accounts as you own, then drop files in — the app picks the account with the most free space.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
