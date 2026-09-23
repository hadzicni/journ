import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home page reads the example notes at runtime (lib/examples.ts).
  outputFileTracingIncludes: {
    "/": ["./examples/*.txt"],
  },
};

export default nextConfig;
