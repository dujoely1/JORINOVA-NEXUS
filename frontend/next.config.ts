import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok / localtunnel / cloudflared subdomains through Next's host-check.
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.loca.lt',
    '*.ngrok-free.app',
    '*.ngrok.io',
  ],
  // Proxy /api/* and /media/* to the FastAPI backend.
  // Lets the frontend use relative URLs so it works behind any tunnel, VM IP,
  // or domain — the browser always talks to its own origin, and THIS server
  // forwards to the backend. In Docker the backend is reached by its service
  // name (BACKEND_INTERNAL_URL=http://api-exposed:8000); locally it defaults
  // to localhost:8000.
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';
    return [
      { source: '/api/:path*',   destination: `${backend}/api/:path*` },
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
