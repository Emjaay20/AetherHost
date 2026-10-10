export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');    // Replace multiple - with single -
}

export function safeAppName(name: string): string {
  let s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 40) {
    s = s.slice(0, 40).replace(/-+$/g, '');
  }
  return s || 'app';
}
