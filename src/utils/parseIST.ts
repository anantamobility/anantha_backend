const IST_OFFSET_MS = 330 * 60_000;

export function parseISTDateTime(input: string): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(input)) return new Date(input);
  const utc = Date.parse(input.length === 10 ? `${input}T00:00:00Z` : `${input}Z`);
  return new Date(utc - IST_OFFSET_MS);
}
/**
- Validate the string in zod before it reaches the helper; native parse gives Invalid Date, not an error.
- The regex accepts offsets but not a bare +0530 without colon? It does ([+-]\d{2}:?\d{2}) Fine.
 */