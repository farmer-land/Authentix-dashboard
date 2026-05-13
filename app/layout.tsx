import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Authentix - Certificate Generation & Verification Platform",
  description: "Enterprise certificate generation, management, and verification platform",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.svg", type: "image/svg+xml", sizes: "32x32" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#3ECF8E",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Razorpay Checkout JS — loaded on-demand by payment-methods-card.tsx */}
        {/* Unregister any stale service workers from other projects on the same origin */}
        {/* suppressHydrationWarning: nonce is server-only (request header) and will
            intentionally differ from the empty string the client sees during hydration. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister()})})}` +
              (process.env.NODE_ENV === "production"
                ? `;(function(){var n=function(){};console.log=n;console.debug=n;console.info=n;})()`
                : "")
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning>
        <QueryProvider>
          {children}
          <Toaster richColors theme="dark" position="bottom-right" />
          {/* Vercel telemetry — Core Web Vitals + page analytics (production only) */}
          <SpeedInsights />
          <Analytics />
        </QueryProvider>
      </body>
    </html>
  );
}
