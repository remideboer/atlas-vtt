const path = require('node:path');

module.exports = {
  plugins: [
    {
      postcssPlugin: 'atlas-tailwind-entry',
      Once(root, { AtRule }) {
        if (path.resolve(root.source.input.file) !== path.resolve(__dirname, 'styles/index.css')) return;
        // Keep the authored stylesheet valid CSS. Tailwind consumes these
        // framework directives during the build, before CSS reaches Obsidian.
        for (const layer of ['utilities', 'components', 'base']) {
          const rule = new AtRule({ name: 'tailwind', params: layer });
          rule.source = root.source;
          root.prepend(rule);
        }
      },
    },
    require('postcss-nesting'),
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
