import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Keep local AI development separate from the production acceptance build.
  distDir: process.env.VIBEKIDDING_DEMO_AI_DEV === "1" ? ".next-demo-ai" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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
