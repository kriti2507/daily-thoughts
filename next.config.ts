import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OAuth discovery for the MCP server. The handlers live under /oauth so the
  // app directory needs no dot-folder.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/openid-configuration/:path*",
        destination: "/oauth/metadata/authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/oauth/metadata/protected-resource",
      },
    ];
  },
};

export default nextConfig;
