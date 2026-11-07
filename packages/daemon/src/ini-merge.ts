/**
 * Minimal INI helpers for Ark GameUserSettings.ini / Game.ini.
 * Preserves unknown keys; upserts under the given section.
 */

export function normalizeIniNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function upsertIniSectionKeys(
  existing: string,
  section: string,
  keys: Record<string, string>,
): string {
  let text = normalizeIniNewlines(existing);
  const sectionHeader = `[${section}]`;
  const sectionRe = new RegExp(`^\\[${escapeRegExp(section)}\\]\\s*$`, "im");

  if (!sectionRe.test(text)) {
    const block = Object.entries(keys)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    text = `${text.trimEnd()}\n\n${sectionHeader}\n${block}\n`.trimStart();
    if (!text.endsWith("\n")) text += "\n";
    return text;
  }

  for (const [key, value] of Object.entries(keys)) {
    const keyRe = new RegExp(`^${escapeRegExp(key)}=.*$`, "im");
    if (keyRe.test(text)) {
      text = text.replace(keyRe, `${key}=${value}`);
    } else {
      text = text.replace(sectionRe, (match) => `${match}\n${key}=${value}`);
    }
  }

  if (!text.endsWith("\n")) text += "\n";
  return text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function boolIni(value: boolean): string {
  return value ? "True" : "False";
}

export function parseModIds(mods: string): string[] {
  return mods
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}
