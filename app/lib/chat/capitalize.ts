/**
 * Uppercase the first letter of a string (accented letters included),
 * preserving any leading whitespace. Returns the input unchanged when it
 * has no cased letter.
 */
export function capitalizeFirstLetter(text: string): string {
  const match = text.match(/^(\s*)([a-zA-Z\u00C0-\u024F])(.*)$/s);
  return match ? match[1] + match[2].toUpperCase() + match[3] : text;
}
