/** Keep stored LiveLink aliases intact while shortening the old default in UI. */
export function obsTrackLabel(alias: string): string {
  return /^Channel ([1-9]\d*)$/.test(alias) ? alias.replace(/^Channel /, "Track ") : alias;
}
