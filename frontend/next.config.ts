import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep trailing slashes intact so proxied API calls are NOT 308-redirected.
  // Without this, a fetch to `/api/v1/patients/?…` is redirected by Next to the
  // slash-less `/api/v1/patients`, which FastAPI then 307-redirects to an
  // ABSOLUTE backend URL (http://localhost:8000/…). That hop is cross-origin,
  // so the browser strips the Authorization header → backend sees no token
  // → 401 → the page wipes the session and bounces to /login. Preserving the
  // slash lets the request hit FastAPI's `/patients/` route directly (no
  // redirect, no cross-origin hop, token kept).
  skipTrailingSlashRedirect: true,
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
