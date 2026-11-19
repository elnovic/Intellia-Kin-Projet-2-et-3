// Rendu Markdown sûr : le texte est échappé avant toute mise en forme.

import { mediaUrl } from "./api.js";

export function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  const value = url.trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(value)) return value;
  return "#";
}

function inline(text) {
  // `text` est déjà échappé.
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
      const url = mediaUrl(safeUrl(src.replace(/&amp;/g, "&")));
      return `<figure class="md-figure"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Agrandir l'image"><img src="${escapeHtml(url)}" alt="${alt}" loading="lazy"></a>${
        alt ? `<figcaption>${alt}</figcaption>` : ""
      }</figure>`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = safeUrl(href.replace(/&amp;/g, "&"));
      const external = /^https?:/i.test(url);
      return `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function table(lines) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => inline(c.trim()));
  const head = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<div class="md-table"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function renderMarkdown(source = "") {
  const lines = escapeHtml(source).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      html.push("<hr>");
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|") && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
      html.push(table(block));
      continue;
    }
    if (line.startsWith("&gt;")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("&gt;")) quote.push(lines[i++].replace(/^&gt;\s?/, ""));
      html.push(`<blockquote>${renderMarkdown(unescape(quote.join("\n")))}</blockquote>`);
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        let item = lines[i++].replace(pattern, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !pattern.test(lines[i])) {
          item += " " + lines[i++].trim();
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|&gt;|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i]) &&
      !(lines[i].trim().startsWith("|") && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))
    ) {
      paragraph.push(lines[i++]);
    }
    const content = inline(paragraph.join(" "));
    html.push(content.startsWith("<figure") && content.endsWith("</figure>") ? content : `<p>${content}</p>`);
  }
  return html.join("\n");
}

function unescape(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
