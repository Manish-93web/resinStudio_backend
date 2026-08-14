import sanitizeHtmlLib from 'sanitize-html';

/**
 * Load-bearing XSS defense for every rich-text field authored via Tiptap (Product.description,
 * BlogPost.content): sanitized here on write, not left to each renderer. The mobile app has no
 * DOM to sanitize on render, so write-time sanitization is the only defense that covers every
 * client uniformly (web + admin + RN) - per IMPLEMENTATION_PROMPT.md's rich-text XSS risk flag.
 *
 * Uses `sanitize-html` (pure JS, no DOM) rather than isomorphic-dompurify - this is a Node-only
 * backend that never renders in a browser, so the "isomorphic" part of that package buys nothing
 * while its Node code path drags in jsdom's large, ESM-heavy dependency tree for no benefit.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'code',
      'pre',
      'img',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      '*': ['class'],
    },
  });
}
