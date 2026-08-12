"use strict";

const fs = require("node:fs");
const path = require("node:path");

async function build() {
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (error) {
    throw new Error("Missing build dependency. Run npm install before npm run build.");
  }
  const root = path.resolve(__dirname, "..");
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(root, "src", "main.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2018",
    external: ["obsidian", "electron"],
    outfile: path.join(dist, "main.js"),
    sourcemap: false,
    logLevel: "info"
  });
  fs.copyFileSync(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
  const styles = path.join(root, "src", "styles.css");
  if (fs.existsSync(styles)) fs.copyFileSync(styles, path.join(dist, "styles.css"));
}

build().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

