/**
 * Markdown-lite → HTML / plain text for lifecycle emails.
 * Merge vars must be substituted BEFORE calling these helpers.
 */

function normalizeMarkdownLinks(text) {
  // Outer bold around [text](url) leaks )** into plain-text linkifiers (Gmail etc.).
  return String(text || "").replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, "[**$1**]($2)");
}

function markdownLinksToHtml(text) {
  return normalizeMarkdownLinks(text).replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );
}

function htmlFromMarkdown(body) {
  let html = markdownLinksToHtml(body);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}

function plainTextFromMarkdown(body) {
  let text = normalizeMarkdownLinks(body);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  return text;
}

function extractLinksFromHtml(html) {
  const links = [];
  const re = /<a\s+href="([^"]+)">([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ href: m[1], text: m[2] });
  }
  return links;
}

module.exports = {
  normalizeMarkdownLinks,
  htmlFromMarkdown,
  plainTextFromMarkdown,
  extractLinksFromHtml,
};
