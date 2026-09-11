/** A `?next=` target we are willing to follow: a path on this site, nothing else.
    "//evil.example" and "/\evil.example" look like paths but leave the site. */
export function safeNext(value: string | null | undefined, fallback = "/") {
  return value && /^\/(?![/\\])/.test(value) ? value : fallback;
}
