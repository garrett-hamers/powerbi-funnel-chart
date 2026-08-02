const path = require("path");

module.exports = {
  entry: "./src/visual.ts",
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.build.json"
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "visual.js",
    libraryTarget: "var",
    library: "AtlynFunnel"
  },
  externals: {
    "powerbi-visuals-api": "powerbi"
  },
  devtool: false,
  performance: {
    hints: false
  }
};
