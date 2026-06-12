import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok / localtunnel / cloudflared subdomains through Next's host-check.
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.loca.lt',
    '*.ngrok-free.app',
    '*.ngrok.io',
  ],
  // Proxy /api/* and /media/* to the FastAPI backend on :8000.
  // Lets the frontend use relative URLs so it works behind any tunnel.
  async rewrites() {
    return [
      { source: '/api/:path*',   destination: 'http://localhost:8000/api/:path*' },
      { source: '/media/:path*', destination: 'http://localhost:8000/media/:path*' },
    ];
  },
};

export default nextConfig;
