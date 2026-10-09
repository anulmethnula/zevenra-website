export type CourierRateDuplicateInput = {
  rowNumber: number;
  destinationKey: string;
  firstKgCharge: number | null;
  additionalKgCharge: number | null;
  hasValidationErrors: boolean;
};

export type CourierRateDuplicateKind = "unique" | "duplicate" | "conflict";

export function classifyCourierRateDuplicates(
  rows: CourierRateDuplicateInput[],
) {
  const result = new Map<number, CourierRateDuplicateKind>(),
    groups = new Map<string, CourierRateDuplicateInput[]>();
  for (const row of rows) {
    result.set(row.rowNumber, "unique");
    if (row.hasValidationErrors) continue;
    const group = groups.get(row.destinationKey) || [];
    group.push(row);
    groups.set(row.destinationKey, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const pairs = new Set(
      group.map(
        (row) => `${row.firstKgCharge ?? ""}\u0000${row.additionalKgCharge ?? ""}`,
      ),
    );
    if (pairs.size > 1) {
      for (const row of group) result.set(row.rowNumber, "conflict");
      continue;
    }
    const ordered = [...group].sort((a, b) => a.rowNumber - b.rowNumber);
    for (const row of ordered.slice(1)) result.set(row.rowNumber, "duplicate");
  }
  return result;
}
