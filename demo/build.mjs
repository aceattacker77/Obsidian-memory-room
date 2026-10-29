// Builds the one-file browser demo: bundles demo.ts (with three.js and the plugin's src/), then
// inlines it, styles.css and the cat model into shell.html.
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const catPath = process.argv[2] ?? path.join(here, "cat.glb");
const out = process.argv[3] ?? path.join(here, "memory-room-demo.html");
const res = await esbuild.build({
  entryPoints: [path.join(here, "demo.ts")], bundle: true, format: "iife", target: "es2020",
  minify: true, write: false, legalComments: "none",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(path.join(here, "../styles.css"), "utf8");
const cat = fs.readFileSync(catPath).toString("base64");
const html = fs.readFileSync(path.join(here, "shell.html"), "utf8")
  .replace("/*PLUGIN_CSS*/", () => css)
  .replace("/*CAT_GLB*/", () => cat)
  .replace("/*DEMO_JS*/", () => js);
fs.writeFileSync(out, html);
// The Artifact host wraps pages in its own document, so it gets the head and body contents only.
const fragment = html
  .replace(/^[\s\S]*?<head>\s*/, "")
  .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/, "")
  .replace(/<\/head>\s*<body>\s*/, "")
  .replace(/\s*<\/body>\s*<\/html>\s*$/, "\n");
fs.writeFileSync(out.replace(/\.html$/, ".artifact.html"), fragment);
console.log(`${out}: ${(html.length / 1e6).toFixed(1)} MB (js ${(js.length / 1e3).toFixed(0)} KB)`);
