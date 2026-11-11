const { composePlugins, withNx } = require('@nx/next');

const nextConfig = {
  nx: { svgr: false },
  reactStrictMode: true,
};

module.exports = composePlugins(withNx)(nextConfig);
