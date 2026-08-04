/** 手机号脱敏：保留前三后四 */
export function maskPhone(value: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (v.length < 7) return "***";
  return `${v.slice(0, 3)}****${v.slice(-4)}`;
}

/** 地址脱敏：保留前 6 字 */
export function maskAddress(value: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (v.length <= 6) return `${v.slice(0, 2)}***`;
  return `${v.slice(0, 6)}***`;
}

export function maskRawValue(
  fieldName: string | null | undefined,
  rawValue: string | null | undefined
): string {
  const field = (fieldName || "").toLowerCase();
  const value = rawValue ?? "";
  if (
    field.includes("phone") ||
    field.includes("电话") ||
    field === "recipientphone"
  ) {
    return maskPhone(value);
  }
  if (
    field.includes("address") ||
    field.includes("地址") ||
    field === "recipientaddress"
  ) {
    return maskAddress(value);
  }
  if (value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}
