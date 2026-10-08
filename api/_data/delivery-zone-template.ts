import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";
import { withTransaction } from "../_db.js";
import { sriLankaDistricts } from "../_shared.js";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 50_000;

type Field =
  | "zoneCode"
  | "zoneName"
  | "fee"
  | "district"
  | "city"
  | "postalCode"
  | "fallback"
  | "active";

type ParsedZone = {
  zoneCode: string;
  zoneName: string;
  fee: number;
  districts: string[];
  cities: string[];
  postalCodes: string[];
  fallback: boolean;
  active: boolean;
  sortOrder: number;
  sourceRows: number[];
};

export class DeliveryZoneTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryZoneTemplateError";
  }
}

const text = (value: unknown) => String(value ?? "").trim();
const headerKey = (value: unknown) =>
  text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function fieldForHeader(value: unknown): Field | "" {
  const key = headerKey(value);
  if (!key) return "";
  if (/^zone code$|^code$/.test(key)) return "zoneCode";
  if (/^zone$|zone name|area name|delivery area|shipping zone/.test(key)) return "zoneName";
  if (/^fee$|delivery fee|shipping fee|^rate$|^charge$/.test(key)) return "fee";
  if (/district/.test(key)) return "district";
  if (/city|area/.test(key)) return "city";
  if (/postal|postcode|zip/.test(key)) return "postalCode";
  if (/fallback|default zone|default area/.test(key)) return "fallback";
  if (/active|enabled/.test(key)) return "active";
  return "";
}

const boolValue = (value: unknown, fallback: boolean) => {
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["yes", "y", "true", "1", "active", "enabled"].includes(raw)) return true;
  if (["no", "n", "false", "0", "inactive", "disabled"].includes(raw)) return false;
  throw new DeliveryZoneTemplateError(`Invalid Yes/No value "${text(value)}".`);
};

const moneyValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return cleaned && Number.isFinite(number) ? number : NaN;
};

const districtLookup = new Map(
  sriLankaDistricts.map((district) => [district.toLowerCase(), district]),
);

function canonicalDistrict(value: unknown, rowNumber: number) {
  const raw = text(value);
  if (!raw) return "";
  const district = districtLookup.get(raw.toLowerCase());
  if (!district)
    throw new DeliveryZoneTemplateError(
      `Row ${rowNumber}: "${raw}" is not a valid Sri Lankan district.`,
    );
  return district;
}

function canonicalPostal(value: unknown, rowNumber: number) {
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return "";
  if (!/^(?:\d{5}|\d{1,4}\*)$/.test(raw))
    throw new DeliveryZoneTemplateError(
      `Row ${rowNumber}: postal code must be 5 digits or a prefix such as 10*.`,
    );
  return raw;
}

async function matrixFromFile(fileName: string, base64: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !["xlsx", "csv"].includes(extension))
    throw new DeliveryZoneTemplateError("Choose an .xlsx or .csv ZEVENRA delivery template.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES)
    throw new DeliveryZoneTemplateError("Delivery template must be between 1 byte and 3 MB.");
  try {
    if (extension === "xlsx") return await readXlsxFile(buffer);
    return parseCsv(buffer, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as unknown[][];
  } catch {
    throw new DeliveryZoneTemplateError(
      "The delivery template could not be read. Download the ZEVENRA template and try again.",
    );
  }
}

async function parseTemplate(fileName: string, base64: string) {
  const matrix = await matrixFromFile(fileName, base64);
  if (!matrix.some((row) => row.some((cell) => text(cell))))
    throw new DeliveryZoneTemplateError("The delivery template is empty.");

  let headerIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < Math.min(20, matrix.length); index += 1) {
    const fields = new Set(matrix[index].map(fieldForHeader).filter(Boolean));
    const score = fields.has("zoneName") && fields.has("fee") ? fields.size : 0;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }
  if (headerIndex < 0)
    throw new DeliveryZoneTemplateError(
      'This is not a ZEVENRA delivery-area template. Click "Download template" and use columns such as "Zone Name" and "Fee".',
    );

  const headers = matrix[headerIndex].map((cell) => text(cell));
  const mapping = new Map<Field, number>();
  headers.forEach((header, index) => {
    const field = fieldForHeader(header);
    if (field && !mapping.has(field)) mapping.set(field, index);
  });
  if (!mapping.has("zoneName") || !mapping.has("fee"))
    throw new DeliveryZoneTemplateError('Template needs "Zone Name" and "Fee" columns.');

  const dataRows = matrix
    .slice(headerIndex + 1)
    .map((row, offset) => ({ row, rowNumber: headerIndex + offset + 2 }))
    .filter(({ row }) => row.some((cell) => text(cell)));
  if (!dataRows.length)
    throw new DeliveryZoneTemplateError("No delivery areas were found below the header.");
  if (dataRows.length > MAX_ROWS)
    throw new DeliveryZoneTemplateError(`Delivery templates are limited to ${MAX_ROWS.toLocaleString()} rows.`);

  type MutableZone = {
    zoneCode: string;
    zoneName: string;
    fee: number;
    districts: Set<string>;
    cities: Set<string>;
    postalCodes: Set<string>;
    fallback: boolean;
    active: boolean;
    sortOrder: number;
    sourceRows: number[];
  };

  const groups = new Map<string, MutableZone>();
  for (const { row, rowNumber } of dataRows) {
    const value = (field: Field) => {
      const index = mapping.get(field);
      return index === undefined ? "" : row[index];
    };
    const zoneName = text(value("zoneName"));
    if (!zoneName) throw new DeliveryZoneTemplateError(`Row ${rowNumber}: zone name is required.`);
    const fee = moneyValue(value("fee"));
    if (!Number.isFinite(fee) || fee < 0)
      throw new DeliveryZoneTemplateError(`Row ${rowNumber}: delivery fee must be zero or more.`);

    const zoneCode = text(value("zoneCode"));
    const key = (zoneCode || zoneName).toLowerCase();
    const fallback = boolValue(value("fallback"), false);
    const active = boolValue(value("active"), true);
    const district = canonicalDistrict(value("district"), rowNumber);
    const city = text(value("city"));
    const postalCode = canonicalPostal(value("postalCode"), rowNumber);

    let group = groups.get(key);
    if (!group) {
      group = {
        zoneCode,
        zoneName,
        fee,
        districts: new Set(),
        cities: new Set(),
        postalCodes: new Set(),
        fallback,
        active,
        sortOrder: groups.size + 1,
        sourceRows: [],
      };
      groups.set(key, group);
    } else {
      if (group.zoneName.toLowerCase() !== zoneName.toLowerCase())
        throw new DeliveryZoneTemplateError(`Row ${rowNumber}: one zone code is used for different zone names.`);
      if (group.fee !== fee)
        throw new DeliveryZoneTemplateError(`Row ${rowNumber}: "${zoneName}" has conflicting delivery fees.`);
      if (text(value("fallback")) && group.fallback !== fallback)
        throw new DeliveryZoneTemplateError(`Row ${rowNumber}: "${zoneName}" has conflicting fallback values.`);
      if (text(value("active")) && group.active !== active)
        throw new DeliveryZoneTemplateError(`Row ${rowNumber}: "${zoneName}" has conflicting active values.`);
    }

    if (district) group.districts.add(district);
    if (city) group.cities.add(city);
    if (postalCode) group.postalCodes.add(postalCode);
    group.sourceRows.push(rowNumber);
  }

  const zones: ParsedZone[] = [...groups.values()].map((zone) => ({
    ...zone,
    districts: [...zone.districts],
    cities: [...zone.cities],
    postalCodes: [...zone.postalCodes],
  }));
  const activeZones = zones.filter((zone) => zone.active);
  if (!activeZones.length) throw new DeliveryZoneTemplateError("Template needs at least one active delivery area.");
  let fallbacks = activeZones.filter((zone) => zone.fallback);
  if (!fallbacks.length) {
    const safest = [...activeZones].sort((a, b) => b.fee - a.fee)[0];
    safest.fallback = true;
    fallbacks = [safest];
  }
  if (fallbacks.length !== 1)
    throw new DeliveryZoneTemplateError("Template must have only one active fallback area.");

  return { headerRowNumber: headerIndex + 1, totalRows: dataRows.length, zones };
}

export async function previewDeliveryZoneTemplate(input: Record<string, unknown>) {
  const fileName = text(input.fileName);
  const base64 = text(input.base64);
  if (!fileName || !base64)
    throw new DeliveryZoneTemplateError("Choose a ZEVENRA delivery template first.");
  const parsed = await parseTemplate(fileName, base64);
  return {
    headerRowNumber: parsed.headerRowNumber,
    totalRows: parsed.totalRows,
    zones: parsed.zones.map((zone) => ({
      zoneCode: zone.zoneCode,
      zoneName: zone.zoneName,
      fee: zone.fee,
      active: zone.active,
      fallback: zone.fallback,
      districts: zone.districts.length,
      cities: zone.cities.length,
      postalCodes: zone.postalCodes.length,
    })),
  };
}

export async function applyDeliveryZoneTemplate(input: Record<string, unknown>) {
  const courierProviderId = text(input.courierProviderId);
  const fileName = text(input.fileName);
  const base64 = text(input.base64);
  if (!courierProviderId)
    throw new DeliveryZoneTemplateError("Choose a courier before applying the template.");
  const parsed = await parseTemplate(fileName, base64);

  await withTransaction(async (client) => {
    const courier = await client.query<{ id: string }>(
      "SELECT id FROM courier_providers WHERE id=$1 FOR UPDATE",
      [courierProviderId],
    );
    if (!courier.rowCount) throw new DeliveryZoneTemplateError("Courier provider was not found.");

    await client.query("DELETE FROM delivery_rates WHERE courier_provider_id=$1", [courierProviderId]);
    for (const zone of parsed.zones) {
      await client.query(
        `INSERT INTO delivery_rates(
          id,courier_provider_id,name,fee,active,districts,cities,postal_codes,fallback,sort_order,updated_at
        ) VALUES($1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9,$10,now())`,
        [
          randomUUID(),
          courierProviderId,
          zone.zoneName,
          zone.fee,
          zone.active,
          zone.districts,
          zone.cities,
          zone.postalCodes,
          zone.fallback,
          zone.sortOrder,
        ],
      );
    }
    await client.query(
      "UPDATE courier_providers SET pricing_mode='zone',updated_at=now() WHERE id=$1",
      [courierProviderId],
    );
    await client.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES('owner','delivery_template_applied','courier',$1,$2::jsonb)",
      [courierProviderId, JSON.stringify({ fileName, zones: parsed.zones.length })],
    );
  });

  return { applied: true, courierProviderId, zones: parsed.zones.length };
}
