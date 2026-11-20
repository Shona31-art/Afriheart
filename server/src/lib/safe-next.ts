// Where to go after signing in. Pure, safe anywhere.

/** Only same-site paths. Browsers treat "\\" like "/", so "/\\evil.com" would leave the site. */
export function safeNext(next: string, fallback = "/"): string {
  if (!/^\/(?![/\\])/.test(next) || /[\\\s\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://common.invalid");
    return u.origin === "https://common.invalid" ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}
