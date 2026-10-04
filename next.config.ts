import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Prescription scans (≤8 MB) and product photos (≤5 MB) are uploaded through server actions;
    // per-kind limits and MIME sniffing are enforced again in src/server/storage.
    serverActions: { bodySizeLimit: "9mb" },
  },
};

export default nextConfig;
