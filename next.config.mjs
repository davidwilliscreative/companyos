/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The weekly briefing moved into Home; keep old bookmarks working with a real redirect.
  async redirects() {
    return [{ source: "/briefing", destination: "/?view=weekly", permanent: false }];
  },
};
export default nextConfig;
