import test from "node:test";
import assert from "node:assert/strict";
import { totals, customerGroups, normalizedPhone, csv, safeCell, needsAdvance, autoStatus, matchProducts } from "../logic.mjs";

test("totals: 50% advance on product only, delivery added", () => {
  const t = totals({ productTotal: 1000, deliveryArea: "inside", advancePaid: 200 });
  assert.deepEqual([t.ship, t.total, t.required, t.advanceDue, t.balance], [80, 1080, 500, 300, 880]);
  assert.equal(totals({ productTotal: 1000, deliveryArea: "outside" }).ship, 130);
});

test("normalizedPhone folds +880 prefix", () => {
  assert.equal(normalizedPhone("+880 1712-345678"), "01712345678");
});

test("customerGroups matches by phone or username, never name", () => {
  const g = customerGroups([
    { id: "a", phone: "01712345678", customerName: "X" },
    { id: "b", phone: "+8801712345678", customerName: "Y" },
    { id: "c", username: "@Foo", customerName: "Z" },
    { id: "d", username: "foo", customerName: "W" },
    { id: "e", customerName: "X" },
  ]);
  assert.equal(g.length, 3);
});

test("csv neutralises formulas and escapes quotes", () => {
  assert.equal(safeCell("=1+1"), "'=1+1");
  assert.equal(safeCell(-5), -5);
  assert.equal(csv([['a"b', "@x"]]), `"a""b","'@x"`);
});

test("needsAdvance / autoStatus", () => {
  const o = { productTotal: 1000, advancePaid: 0, status: "Inquiry" };
  assert.equal(needsAdvance(o), true);
  assert.equal(autoStatus(o), "Inquiry");
  assert.equal(autoStatus({ ...o, advancePaid: 500 }), "Advance paid");
  assert.equal(autoStatus({ ...o, advancePaid: 500, status: "Delivered" }), "Delivered");
  assert.equal(needsAdvance({ ...o, status: "Cancelled" }), false);
});

test("matchProducts matches all words anywhere, prefix first, hides exact", () => {
  const names = ["Blue Totoro Plush", "Totoro Keychain", "Hello Kitty Bag"];
  assert.deepEqual(matchProducts(names, "toto"), ["Totoro Keychain", "Blue Totoro Plush"]);
  assert.deepEqual(matchProducts(names, "plush blue"), ["Blue Totoro Plush"]);
  assert.deepEqual(matchProducts(names, "totoro keychain"), []);
  assert.deepEqual(matchProducts(names, "  "), []);
});
