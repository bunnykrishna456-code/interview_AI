import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  // Pin workspace root so Next.js doesn't pick up the parent hack/ lockfile
  outputFileTracingRoot: __dirname,
  // Prevent build-time Firebase initialisation errors when env vars are
  // present on Vercel but not during static pre-rendering of error pages
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
}

export default nextConfig
