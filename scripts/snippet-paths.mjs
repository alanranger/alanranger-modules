/**
 * Squarespace paste snippet paths (single folder for all code blocks).
 */
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SNIPPETS_DIR = path.join(root, "Squarespace Snippets");

export function snippetPath(filename) {
  return path.join(SNIPPETS_DIR, filename);
}

export const STRIP_SNIPPET = snippetPath("academy-do-next-strip-squarespace-snippet-v1.html");
export const HEADER_SNIPPET = snippetPath("academy-header-elements-squarespace-snippet-v1.html");
export const DASHBOARD_SNIPPET = snippetPath("academy-dashboard-squarespace-snippet-v1.html");
export const BOOKMARK_SNIPPET = snippetPath("academy-bookmark-buttons-squarespace-snippet-v1.html");
