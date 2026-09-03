import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  allowedDevOrigins: ["192.168.101.19"],
  serverExternalPackages: ["sharp"],
  experimental: {
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
};

export default nextConfig;
