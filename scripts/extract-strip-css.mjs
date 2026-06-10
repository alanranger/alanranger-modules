import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { STRIP_SNIPPET } from "./snippet-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(STRIP_SNIPPET, "utf8");
const m = html.match(/<style id="ar-do-next-strip-style">([\s\S]*?)<\/style>/);
const css = m ? m[1] : "";
fs.writeFileSync(path.join(__dirname, "strip-only.css"), css);
let braces = 0;
for (const ch of css) {
  if (ch === "{") braces++;
  if (ch === "}") braces--;
}
console.log({ cssLength: css.length, braceBalance: braces, hasCircle: css.includes("ar-do-next-badge__circle") });
