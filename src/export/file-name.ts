export interface FileNameValues {
  name: string;
  mode: string;
  algo: string;
  date: Date;
}

const pad = (n: number) => `${n}`.padStart(2, '0');

/**
 * Fills the export file name template: {name} (the source's name), {mode}, {algo} (algorithm or
 * character set), {date} (YYYY-MM-DD) and {time} (HHMMSS, local time). Characters file systems
 * reject are dropped; an empty result falls back to the source name.
 */
export function exportFileName(template: string, v: FileNameValues, ext: string): string {
  const d = v.date;
  const tags: Record<string, string> = {
    name: v.name,
    mode: v.mode,
    algo: v.algo,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
  const filled = template.replace(/\{(\w+)\}/g, (tag, key: string) => tags[key] ?? tag);
  const safe = clean(filled) || clean(v.name) || 'export';
  return `${safe}.${ext}`;
}

// Control characters, path separators and the characters Windows refuses; no leading / trailing dots or spaces.
const clean = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '')
    .replace(/^[\s.]+|[\s.]+$/g, '');
