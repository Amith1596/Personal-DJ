const nextConfig = {
  reactStrictMode: true,
  webpack: (config: unknown) => {
    // Handle Node.js modules in browser
    const webpackConfig = config as { resolve: { fallback: Record<string, unknown> } };
    webpackConfig.resolve.fallback = {
      ...webpackConfig.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;