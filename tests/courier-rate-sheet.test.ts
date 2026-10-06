import test from "node:test";
import assert from "node:assert/strict";
import { parseCourierRateFile } from "../api/_data/courier-rate-parser.ts";

test("detects courier CSV headers and preserves quoted values", async () => {
  const csv = [
    "From Branch,To District,To City,Charge for 1st kg,Charge per additional 1kg",
    'Colombo,Colombo,"Colombo 01, Fort",350,100',
    "Kandy,Kandy,Peradeniya,450,120",
  ].join("\n");
  const result = await parseCourierRateFile("rates.csv", Buffer.from(csv).toString("base64"));
  assert.deepEqual(result.headers, ["From Branch","To District","To City","Charge for 1st kg","Charge per additional 1kg"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].raw["To City"], "Colombo 01, Fort");
});

test("rejects unsupported courier rate-sheet formats", async () => {
  await assert.rejects(() => parseCourierRateFile("rates.xls", Buffer.from("data").toString("base64")), /xlsx or \.csv/);
});
