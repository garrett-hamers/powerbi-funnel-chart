const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

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
      },
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          "css-loader"
        ]
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
  plugins: [
    new MiniCssExtractPlugin({ filename: "visual.css" })
  ],
  devtool: false,
  performance: {
    hints: false
  }
};
