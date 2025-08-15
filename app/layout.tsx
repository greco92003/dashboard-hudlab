import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { OptimizedAuthProvider } from "@/contexts/OptimizedAuthContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { ConditionalSidebar } from "@/components/ConditionalSidebar";
import { Toaster } from "@/components/ui/sonner";
import { PWAWrapper } from "@/components/PWAWrapper";
import { CacheRecoveryProvider } from "@/components/CacheRecoveryProvider";
import { SyncChecker } from "@/components/ui/sync-checker";

export const metadata: Metadata = {
  title: "Dashboard Hud Lab",
  description: "Painel de controle e gerenciamento de dados Hud Lab",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HudLab Dashboard",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "HudLab Dashboard",
    title: "Dashboard Hud Lab",
    description: "Painel de controle e gerenciamento de dados Hud Lab",
  },
  twitter: {
    card: "summary",
    title: "Dashboard Hud Lab",
    description: "Painel de controle e gerenciamento de dados Hud Lab",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get sidebar state from cookies for SSR
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state");
  // Default to true (open) if no cookie is set, otherwise use cookie value
  const defaultSidebarOpen = sidebarCookie
    ? sidebarCookie.value === "true"
    : true;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script src="http://localhost:8097" async></script>
        <script src="/cache-recovery.js" async></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw-custom.js')
                    .then(function(registration) {
                      console.log('✅ SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('❌ SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HudLab" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-tap-highlight" content="no" />

        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/icons/icon-152x152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icons/icon-192x192.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/icons/icon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/icons/icon-16x16.png"
        />
        <link
          rel="mask-icon"
          href="/icons/safari-pinned-tab.svg"
          color="#000000"
        />
        <link rel="shortcut icon" href="/favicon.ico" />

        {/* Apple Splash Screens */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-2048x2732.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1668x2388.png"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1668x2224.png"
          media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1536x2048.png"
          media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1284x2778.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1179x2556.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1170x2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1242x2688.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1242x2208.png"
          media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-1125x2436.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-828x1792.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-750x1334.png"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/splash-640x1136.png"
          media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />

        <meta name="twitter:card" content="summary" />
        <meta
          name="twitter:url"
          content="https://dashboard-hudlab.vercel.app"
        />
        <meta name="twitter:title" content="HudLab Dashboard" />
        <meta
          name="twitter:description"
          content="Painel de controle e gerenciamento de dados Hud Lab"
        />
        <meta
          name="twitter:image"
          content="https://dashboard-hudlab.vercel.app/icons/icon-192x192.png"
        />
        <meta name="twitter:creator" content="@hudlab" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="HudLab Dashboard" />
        <meta
          property="og:description"
          content="Painel de controle e gerenciamento de dados Hud Lab"
        />
        <meta property="og:site_name" content="HudLab Dashboard" />
        <meta property="og:url" content="https://dashboard-hudlab.vercel.app" />
        <meta
          property="og:image"
          content="https://dashboard-hudlab.vercel.app/icons/icon-192x192.png"
        />
      </head>
      <body className="antialiased">
        <CacheRecoveryProvider autoRecover={true} showRecoveryButton={true}>
          <PWAWrapper>
            <OptimizedAuthProvider>
              <SyncProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="dark"
                  enableSystem
                  disableTransitionOnChange
                >
                  <ConditionalSidebar defaultSidebarOpen={defaultSidebarOpen}>
                    {children}
                  </ConditionalSidebar>
                  <Toaster />
                  <SyncChecker />
                </ThemeProvider>
              </SyncProvider>
            </OptimizedAuthProvider>
          </PWAWrapper>
        </CacheRecoveryProvider>
      </body>
    </html>
  );
}
