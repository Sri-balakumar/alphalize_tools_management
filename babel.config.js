module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            "@": "./src",
            "@assets": "./assets",
            "@components": "./src/components",
            "@screens": "./src/screens",
            "@api": "./src/api",
            "@stores": "./src/stores",
            "@hooks": "./src/hooks",
            "@constants": "./src/constants",
            "@utils": "./src/utils",
            "@navigation": "./src/navigation",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
