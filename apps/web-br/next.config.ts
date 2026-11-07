import type { NextConfig } from "next";
import { pageSecurityHeaders } from "./security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
