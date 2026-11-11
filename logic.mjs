// Pure business logic: no DOM, no network. Imported by app.js and tested in test/logic.test.mjs.
export const DELIVERY = { inside: 80, outside: 130 };
export const ADVANCE_RATE = 0.5;
export function delivery(o) {
  return DELIVERY[o.deliveryArea] ?? (Number(o.deliveryCharge) || 0);
}
export function totals(o) {
  const product = Number(o.productTotal ?? (Number(o.quantity) || 0) * (Number(o.unitPrice) || 0)) || 0,
    ship = delivery(o),
    total = product + ship,
    required = product * ADVANCE_RATE,
    paid = Number(o.advancePaid) || 0;
  return { product, ship, total, required, paid, advanceDue: Math.max(0, required - paid), balance: Math.max(0, total - paid) };
}
export function normalizedPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("880")) digits = "0" + digits.slice(3);
  return digits;
}
export function normalizedUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLocaleLowerCase();
}
export function customerGroups(orders) {
  const rows = orders.slice(),
    parent = rows.map((_, i) => i),
    find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i]))),
    join = (a, b) => {
      const x = find(a),
        y = find(b);
      if (x !== y) parent[y] = x;
    },
    phones = new Map(),
    users = new Map();
  rows.forEach((o, i) => {
    const phone = normalizedPhone(o.phone),
      username = normalizedUsername(o.username);
    if (phone.length >= 7) {
      if (phones.has(phone)) join(i, phones.get(phone));
      else phones.set(phone, i);
    }
    if (username) {
      if (users.has(username)) join(i, users.get(username));
      else users.set(username, i);
    }
  });
  const byRoot = new Map();
  rows.forEach((o, i) => {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(o);
  });
  const groups = [...byRoot.values()]
    .map((os) => {
      os.sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "") || (b._updatedAt || "").localeCompare(a._updatedAt || ""));
      return {
        id: os
          .map((o) => o.id)
          .sort()
          .join("|"),
        orders: os,
      };
    })
    .sort((a, b) => (b.orders[0]?.orderDate || "").localeCompare(a.orders[0]?.orderDate || ""));
  return groups;
}
export const safeCell = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
export function csv(rows) {
  return rows.map((r) => r.map((v) => '"' + String(v == null ? "" : safeCell(v)).replace(/"/g, '""') + '"').join(",")).join("\r\n");
}
// True when an active order still needs its 50% advance.
export function needsAdvance(o) {
  const t = totals(o);
  return t.product > 0 && t.advanceDue > 0 && ["Inquiry", "Awaiting advance"].includes(o.status);
}
// Returns "Advance paid" when an early-stage order has its full 50% advance; otherwise the unchanged status.
export function autoStatus(o) {
  const t = totals(o);
  return t.product > 0 && t.paid >= t.required && ["Inquiry", "Awaiting advance"].includes(o.status) ? "Advance paid" : o.status;
}
// Saved product names containing every typed word; names starting with the typed text come first. Max 6.
export function matchProducts(names, typed) {
  const t = String(typed || "")
      .trim()
      .toLowerCase(),
    words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return names
    .filter((p) => p.toLowerCase() !== t && words.every((w) => p.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.toLowerCase().startsWith(t)) - Number(a.toLowerCase().startsWith(t)))
    .slice(0, 6);
}

export const monthOf = (o) => (o.orderDate || "").slice(0, 7);
const nameKey = (o) => (o.customerName || o.displayName || o.username || "").trim().toLocaleLowerCase();
const createdKey = (o) => o.createdAt || o._updatedAt || o.orderDate || "";
// mode: "recent" (newest added first), "az" or "za" by customer name (unnamed orders always last).
export function sortOrders(list, mode) {
  const arr = list.slice(),
    dir = mode === "za" ? -1 : 1;
  if (mode === "az" || mode === "za") {
    return arr.sort((a, b) => {
      const x = nameKey(a),
        y = nameKey(b);
      if (!!x !== !!y) return x ? -1 : 1;
      return dir * x.localeCompare(y) || createdKey(b).localeCompare(createdKey(a));
    });
  }
  return arr.sort((a, b) => createdKey(b).localeCompare(createdKey(a)));
}
// Groups by order month, newest month first; orders without a date go last. Keeps the input order inside each month.
export function groupByMonth(list) {
  const by = new Map();
  for (const o of list) {
    const m = monthOf(o);
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(o);
  }
  return [...by.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a))).map((month) => ({ month, orders: by.get(month) }));
}
