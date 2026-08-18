/**
 * Folds the Vite build into one self-contained HTML file.
 *
 * Artifact pages run under a strict CSP that blocks every external host, and
 * they are wrapped in a document skeleton at publish time — so the output here
 * carries no doctype/html/head/body of its own, and inlines all CSS and JS.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const assets = join(dist, "assets");

const files = readdirSync(assets);
const cssFile = files.find((f) => f.endsWith(".css"));
const jsFile = files.find((f) => f.endsWith(".js"));
if (!cssFile || !jsFile) throw new Error("run `vite build` first");

const css = readFileSync(join(assets, cssFile), "utf8");
const js = readFileSync(join(assets, jsFile), "utf8");

/** A literal </script> inside the bundle would close the tag early. */
const safeJs = js.replace(/<\/script>/gi, "<\\/script>");

// Pulled from the built index.html so the markup never drifts from source.
const builtHtml = readFileSync(join(dist, "index.html"), "utf8");
const bodyMatch = builtHtml.match(/<div id="app">[\s\S]*?<\/div>\s*(?=<script|<\/body>)/i);
if (!bodyMatch) throw new Error("could not find #app markup in built index.html");

const page = `<title>Thrum</title>
<style>
/* The game commits to one dark world by design, so it paints its own ground
   rather than inheriting the viewer's theme. */
${css}
html, body { background: #12151c; }
#app { height: 100dvh; }
</style>
${bodyMatch[0]}
<script type="module">
${safeJs}
</script>
`;

const out = join(dist, "artifact.html");
writeFileSync(out, page);
console.log(`wrote ${out}  (${(page.length / 1024).toFixed(1)} kB, fully inlined)`);
