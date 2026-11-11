export function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
