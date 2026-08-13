/**
 * Minimal, safe-by-construction markdown → HTML.
 *
 * **All text is HTML-escaped BEFORE any transform**, so raw HTML and scripts in
 * the source become inert text. That is the whole security model: there is no
 * sanitizer to configure and no XSS surface, which is why the panel does not
 * pull in `marked` + `dompurify` for this. Covers the common subset — fenced
 * and inline code, headings, bold, italic, links (http/https/mailto/relative
 * only), unordered lists, paragraphs.
 *
 * Two consumers, one implementation: the blog-CMS editor's preview pane and the
 * customer wiki's handbook articles. Both hand the result to
 * `dangerouslySetInnerHTML`, so this function is their XSS boundary and is
 * tested directly rather than only through the panes that use it.
 *
 * This is deliberately NOT the public blog's renderer — that content goes
 * through the full build-time pipeline and is baked into static HTML.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Allow-list the scheme of an href. The input is ALREADY HTML-escaped — the
 * whole line goes through `escapeHtml` before `inlineMd` runs — so escaping
 * again here would double-encode: `/a?x=1&y=2` became `…&amp;amp;…` and the
 * browser resolved a wrong target. Quotes cannot break out of the attribute
 * because that first pass already turned them into `&quot;`.
 */
function safeHref(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(u) ? u : null;
}

function inlineMd(escaped: string): string {
  // Operates on already-escaped text — only our own tags are ever emitted.
  return escaped
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
    .replace(/(^|[^*])\*([^*]+)\*/g, (_m, pre, c) => `${pre}<em>${c}</em>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const href = safeHref(url);
      return href ? `<a href="${href}" rel="noopener" target="_blank">${text}</a>` : m;
    });
}

/** Render a markdown string to HTML. Safe to pass to `dangerouslySetInnerHTML`. */
export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceBuf: string[] = [];
  let listBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map((li) => `<li>${inlineMd(escapeHtml(li))}</li>`).join("")}</ul>`);
      listBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${inlineMd(escapeHtml(paraBuf.join(" ")))}</p>`);
      paraBuf = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inFence) {
        out.push(`<pre><code>${escapeHtml(fenceBuf.join("\n"))}</code></pre>`);
        fenceBuf = [];
        inFence = false;
      } else {
        flushPara();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inlineMd(escapeHtml(heading[2]!))}</h${level}>`);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      listBuf.push(li[1]!);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    paraBuf.push(line.trim());
  }
  if (inFence) {
    out.push(`<pre><code>${escapeHtml(fenceBuf.join("\n"))}</code></pre>`);
  }
  flushPara();
  flushList();
  return out.join("\n");
}
