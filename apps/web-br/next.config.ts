import type { NextConfig } from "next";
import { pageSecurityHeaders } from "./security-headers";

const apiOrigin = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333").replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/auth/:path*", destination: `${apiOrigin}/auth/:path*` },
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: pageSecurityHeaders()
      }
    ];
  }
};

export default nextConfig;
