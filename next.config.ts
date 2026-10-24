import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep proxy agents as native Node requires (CONNECT/SOCKS sockets).
  serverExternalPackages: [
    "https-proxy-agent",
    "socks-proxy-agent",
    "agent-base",
    "socks",
    "ethers",
  ],
};

export default nextConfig;
