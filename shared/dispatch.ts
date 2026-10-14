type DispatchCourier = { id: string; active: boolean };

export function selectDispatchCourierId(
  couriers: DispatchCourier[],
  existingCourierId?: string,
) {
  const active = couriers.filter((courier) => courier.active);
  if (existingCourierId && active.some((courier) => courier.id === existingCourierId))
    return existingCourierId;
  return active.length === 1 ? active[0].id : "";
}

export function sriLankaDateTimeLocal(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function sriLankaDateTimeToIso(value: string) {
  return new Date(`${value}:00+05:30`).toISOString();
}
