/**
 * Markdown-lite → HTML / plain text for lifecycle emails.
 * Merge vars must be substituted BEFORE calling these helpers.
 */

function markdownLinksToHtml(text) {
  return String(text || "").replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );
}

function htmlFromMarkdown(body) {
  let html = String(body || "");
  html = html.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, '<strong><a href="$2">$1</a></strong>');
  html = markdownLinksToHtml(html);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}

function plainTextFromMarkdown(body) {
  let text = String(body || "");
  text = text.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, "$1: $2");
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
  htmlFromMarkdown,
  plainTextFromMarkdown,
  extractLinksFromHtml,
};
