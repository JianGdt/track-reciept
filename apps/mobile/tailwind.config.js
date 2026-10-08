const tokens = require("../../packages/shared/src/tokens.json");
module.exports = {
  content: ["./App.tsx"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: { card: `${tokens.radius.card}px` },
      fontSize: Object.fromEntries(
        Object.entries(tokens.fontSize).map(([key, value]) => [
          key,
          `${value}px`,
        ]),
      ),
    },
  },
  plugins: [],
};
