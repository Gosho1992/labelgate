// Bundles src/bench/run.js into ONE self-contained HTML file (works from file://, no server needed).
import { build } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
await build({ logLevel: "warn", configFile: false, build: { outDir: "bench/.build", emptyOutDir: true, minify: true,
  lib: { entry: "src/bench/run.js", formats: ["iife"], name: "LabelGateBench", fileName: () => "bench.js" } } });
const js = readFileSync("bench/.build/bench.js", "utf8").replace(/<\/script/gi, "<\\/script");
writeFileSync("bench/dist/labelgate-v3-bench.html", readFileSync("bench/bench.template.html", "utf8").replace("/*BUNDLE*/", () => js));
console.log("bench/dist/labelgate-v3-bench.html", js.length, "chars of JS");
