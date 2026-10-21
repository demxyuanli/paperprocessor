import { createTwoFilesPatch, diffLines } from "diff";

/** A unified diff with a short, stable header. */
export function unifiedDiff(before, after, fromLabel = "before", toLabel = "after") {
  return createTwoFilesPatch(fromLabel, toLabel, String(before ?? ""), String(after ?? ""), "", "", { context: 3 });
}

/** Added/removed line counts for a pair of documents. */
export function diffStats(before, after) {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const part of diffLines(String(before ?? ""), String(after ?? ""))) {
    const count = (part.value.match(/\n/g) ?? []).length || (part.value.length > 0 ? 1 : 0);
    if (part.added) added += count;
    else if (part.removed) removed += count;
    else unchanged += count;
  }
  return { added, removed, unchanged };
}
