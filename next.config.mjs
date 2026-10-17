/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions are not used; Next 15 still emits the body-size warning
    // by default. Setting this to a reasonable cap avoids noisy logs.
    serverActions: { bodySizeLimit: "1mb" },
  },
  // We don't use image optimization for the icons in the landing page; the
  // custom SVGs are imported as React components, not as <Image> assets.
  images: { unoptimized: true },
};

export default nextConfig;
