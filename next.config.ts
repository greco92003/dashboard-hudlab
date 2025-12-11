import type { NextConfig } from "next";
const withPWA = require("@ducanh2912/next-pwa").default;

const nextConfig: NextConfig = {
  // Add empty turbopack config to silence the warning
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "dcdn-us.mitiendanube.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "acdn-us.mitiendanube.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.mitiendanube.com",
        port: "",
        pathname: "/**",
      },
    ],
    // Disable image optimization cache for Supabase storage
    unoptimized: false,
    // Add retry and timeout for images
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Add headers for better cache control
  async headers() {
    return [
      {
        source: "/storage/v1/object/public/avatars/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
      {
        source: "/((?!api).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
    ];
  },
  // Configure external packages for better API performance
  serverExternalPackages: ["@supabase/supabase-js"],
  // Optimize for production
  poweredByHeader: false,
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})(nextConfig);
