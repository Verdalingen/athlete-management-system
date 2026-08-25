import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the dev server to be reached from a phone on the same network for mobile testing.
  //
  // Scope, honestly: page rendering over the LAN works WITHOUT this — verified by requesting
  // a page from an unlisted origin and getting 200. Next only gates "dev-only assets and
  // endpoints" (its wording), which is the HMR channel, so this is precautionary for live
  // reload rather than a fix for anything currently broken. Remove it if it earns nothing.
  //
  // Only the mDNS wildcard is listed. A hard-coded LAN IP went stale within the hour on DHCP,
  // and the .local name survives that — including on a phone hotspot, where the Mac lands on
  // a completely different subnet. Development only; no effect on a production build.
  allowedDevOrigins: ["*.local"],
};

export default nextConfig;
