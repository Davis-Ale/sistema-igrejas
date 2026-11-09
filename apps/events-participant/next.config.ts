import type { NextConfig } from "next";
import { pageSecurityHeaders } from "./security-headers";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.7"],
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
