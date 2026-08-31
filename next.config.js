const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,   // saves the HTML report instead of auto-opening a tab
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['ws'],
  },

  webpack(config, { isServer }) {
    // ── 1. SVGR — import SVG files as React components ──────────────────────
    // Usage: import ChartIcon from '@/icons/chart.svg'
    // The existing Next.js file-loader rule is found and modified so SVGs go
    // through @svgr/webpack instead, giving proper React component output.
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test instanceof RegExp && rule.test.test('.svg'),
    );
    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/i;
    }
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            // Produces clean, typed React components. titleProp adds
            // an accessible <title> element; ref forwards to the <svg>.
            titleProp: true,
            ref: true,
            svgoConfig: {
              plugins: [{ name: 'removeViewBox', active: false }],
            },
          },
        },
      ],
    });

    // ── 2. Custom path alias (explicit Webpack resolution) ───────────────────
    // tsconfig.json already defines '@/' for TypeScript, but wiring it in
    // Webpack's resolve.alias ensures it works even in non-TS tooling
    // (Cypress, babel transforms, etc.) that bypass ts-paths.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    };

    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
