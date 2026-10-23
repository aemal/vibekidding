import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Keep local AI development separate from the production acceptance build.
  distDir: process.env.VIBEKIDDING_NEXT_DIST_DIR || (process.env.VIBEKIDDING_DEMO_AI_DEV === "1" ? ".next-demo-ai" : ".next"),
  output: "standalone",
  async headers() {
    const configuredRuntime = process.env.VIBEKIDDING_RUNTIME_ORIGIN;
    let runtimeOrigin = "";
    if (configuredRuntime) {
      const parsed = new URL(configuredRuntime);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Runtime origin must use HTTP or HTTPS.");
      runtimeOrigin = ` ${parsed.origin} ${parsed.protocol}//*.${parsed.host}`;
    }
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              `frame-src 'self'${runtimeOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
