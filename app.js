import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  DELIVERY,
  ADVANCE_RATE,
  delivery,
  totals,
  normalizedPhone,
  normalizedUsername,
  customerGroups as groupOrders,
  csv,
  needsAdvance,
  autoStatus,
} from "./logic.mjs";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const $ = (id) => document.getElementById(id),
  today = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },
  monthNow = () => today().slice(0, 7),
  money = (n) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(n) || 0),
  esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
  makeId = () =>
    globalThis.crypto?.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
let allOrders = [],
  channel = null,
  realtimeOk = false,
  ticks = 0,
  lastSig = "",
  sb = null,
  user = null,
  orders = [],
  activeMonth = monthNow(),
  editingId = "",
  editingBaseRevision = null,
  loading = false,
  poll = null,
  touchedFields = new Set(),
  selectedCustomerKey = "";
let toastTimer = null;
function toast(s, undo) {
  const t = $("toast");
  t.textContent = s;
  if (undo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "small primary";
    b.textContent = "Undo";
    b.addEventListener("click", () => {
      t.classList.remove("show");
      undo();
    });
    t.append(" ", b);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), undo ? 8000 : 3200);
}
function showPage(n) {
  document.querySelectorAll(".page").forEach((x) => x.classList.toggle("active", x.id === n + "Page"));
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.page === n));
}
let cgFor = null,
  cgCache = null;
function customerGroups() {
  if (cgFor !== orders) {
    cgCache = groupOrders(orders);
    cgFor = orders;
  }
  return cgCache;
}
function current() {
  return orders.filter((o) => (o.orderDate || "").slice(0, 7) === activeMonth);
}
function customer(o) {
  return o.customerName || o.displayName || "(Name not provided)";
}
function card(label, v) {
  return '<div class="card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(money(v)) + "</div></div>";
}
function td(label, value, cls = "") {
  return '<td data-label="' + esc(label) + '"' + (cls ? ' class="' + cls + '"' : "") + ">" + value + "</td>";
}
function renderCustomerHistory() {
  const box = $("customerHistory"),
    g = customerGroups().find((x) => x.id === selectedCustomerKey);
  if (!g) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  const latest = g.orders[0],
    phones = [...new Set(g.orders.map((o) => o.phone).filter(Boolean))],
    users = [...new Set(g.orders.map((o) => o.username).filter(Boolean))];
  box.classList.remove("hidden");
  box.innerHTML =
    '<div class="panel-heading"><div><h3>' +
    esc(customer(latest)) +
    '</h3><p class="muted">' +
    g.orders.length +
    " saved order" +
    (g.orders.length === 1 ? "" : "s") +
    ' · Possible identity group based on exact phone or username matches</p></div><button id="closeCustomerHistory" type="button" class="quiet">Close</button></div><p><strong>Phone:</strong> ' +
    esc(phones.join(", ") || "Not provided") +
    " &nbsp; <strong>Username:</strong> " +
    esc(users.map((u) => (u.startsWith("@") ? u : "@" + u)).join(", ") || "Not provided") +
    "<br><strong>Latest address:</strong> " +
    esc(latest.address || "Not provided") +
    '</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Order total</th><th>Paid advance</th><th>Balance due</th><th>Status</th></tr></thead><tbody>' +
    g.orders
      .map((o) => {
        const t = totals(o);
        return (
          "<tr>" +
          td("Date", esc(o.orderDate || "")) +
          td("Product", esc(o.product || "")) +
          td("Qty", esc(o.quantity || "")) +
          td("Order total", money(t.total), "num") +
          td("Paid advance", money(t.paid), "num") +
          td("Balance due", money(t.balance), "num") +
          td("Status", '<span class="badge">' + esc(o.status || "") + "</span>") +
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table></div>";
  $("closeCustomerHistory").addEventListener("click", () => {
    selectedCustomerKey = "";
    renderCustomerHistory();
  });
}
function renderCustomers() {
  const q = $("customerSearch").value.trim().toLocaleLowerCase(),
    groups = customerGroups().filter((g) => {
      const text = g.orders
        .flatMap((o) => [o.customerName, o.displayName, o.phone, o.username])
        .join(" ")
        .toLocaleLowerCase();
      return !q || text.includes(q);
    });
  $("customerRows").innerHTML =
    groups
      .map((g) => {
        const latest = g.orders[0],
          phones = [...new Set(g.orders.map((o) => o.phone).filter(Boolean))].join(", "),
          users = [...new Set(g.orders.map((o) => o.username).filter(Boolean))].map((u) => (u.startsWith("@") ? u : "@" + u)).join(", ");
        return (
          "<tr>" +
          td("Customer", esc(customer(latest))) +
          td("Phone", esc(phones)) +
          td("Username", esc(users)) +
          td("Orders", String(g.orders.length)) +
          td("Latest order", esc(latest.orderDate || "")) +
          td("Recent product", esc(latest.product || "")) +
          td("History", '<button type="button" data-customer-history="' + esc(g.id) + '">View</button>') +
          "</tr>"
        );
      })
      .join("") || '<tr><td class="empty" colspan="7">No saved customers match this search.</td></tr>';
  renderCustomerHistory();
}
function updateDuplicateWarning() {
  const box = $("duplicateWarning"),
    phone = normalizedPhone($("phone").value),
    username = normalizedUsername($("username").value);
  if (phone.length < 7 && !username) {
    box.classList.add("hidden");
    return;
  }
  const matches = orders
    .filter(
      (o) =>
        o.id !== editingId &&
        ((phone.length >= 7 && normalizedPhone(o.phone) === phone) || (username && normalizedUsername(o.username) === username)),
    )
    .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
  if (!matches.length) {
    box.classList.add("hidden");
    return;
  }
  const reasons = [];
  if (phone.length >= 7 && matches.some((o) => normalizedPhone(o.phone) === phone)) reasons.push("phone");
  if (username && matches.some((o) => normalizedUsername(o.username) === username)) reasons.push("username");
  $("duplicateText").textContent =
    `Possible existing customer match by ${reasons.join(" or ")}. ${matches.length} previous order${matches.length === 1 ? "" : "s"} found. Names are not used for matching.`;
  box.classList.remove("hidden");
}
function openDuplicateHistory() {
  const phone = normalizedPhone($("phone").value),
    username = normalizedUsername($("username").value);
  const matches = orders.filter(
    (o) => (phone.length >= 7 && normalizedPhone(o.phone) === phone) || (username && normalizedUsername(o.username) === username),
  );
  if (!matches.length) return;
  const matchIds = new Set(matches.map((o) => o.id)),
    g = customerGroups().find((x) => x.orders.some((o) => matchIds.has(o.id)));
  if (!g) return;
  selectedCustomerKey = g.id;
  $("customerSearch").value = phone.length >= 7 ? phone : $("username").value;
  showPage("customers");
  renderCustomers();
  $("customerHistory").scrollIntoView({ behavior: "smooth", block: "start" });
}
function render() {
  const os = current();
  let product = 0,
    ship = 0,
    total = 0,
    paid = 0,
    advance = 0,
    balance = 0;
  os.forEach((o) => {
    const t = totals(o);
    product += t.product;
    ship += t.ship;
    total += t.total;
    paid += t.paid;
    advance += t.advanceDue;
    balance += t.balance;
  });
  $("summaryTitle").textContent = "Monthly summary · " + activeMonth;
  $("summaryCards").innerHTML =
    card("Orders", os.length) +
    card("Product total", product) +
    card("Delivery charges", ship) +
    card("Order total", total) +
    card("Paid advance", paid) +
    card("Advance still due", advance) +
    card("Balance due", balance);
  $("summaryOrderRows").innerHTML =
    os
      .map((o) => {
        const t = totals(o);
        return (
          "<tr>" +
          td("Date", esc(o.orderDate || "")) +
          td("Customer", esc(customer(o))) +
          td("Product", esc(o.product || "")) +
          td("Qty", esc(o.quantity || "")) +
          td("Order total", money(t.total), "num") +
          td("Paid advance", money(t.paid), "num") +
          td("Balance due", money(t.balance), "num") +
          td("Status", '<span class="badge">' + esc(o.status || "") + "</span>") +
          "</tr>"
        );
      })
      .join("") || '<tr><td class="empty" colspan="8">No orders for this month yet.</td></tr>';
  const q = $("orderSearch").value.toLowerCase(),
    sf = $("statusFilter").value,
    vis = (q ? orders : os)
      .filter((o) => [o.customerName, o.username, o.phone, o.product].join(" ").toLowerCase().includes(q))
      .filter((o) =>
        !sf
          ? true
          : sf === "__needs"
            ? needsAdvance(o)
            : sf === "__balance"
              ? totals(o).balance > 0 && o.status !== "Cancelled"
              : o.status === sf,
      );
  $("orderRows").innerHTML =
    vis
      .map((o) => {
        const t = totals(o),
          actions =
            '<div class="row-actions"><button data-edit="' +
            esc(o.id) +
            '">Edit</button><button data-delete="' +
            esc(o.id) +
            '">Delete</button></div>';
        return (
          "<tr>" +
          td("Date", esc(o.orderDate || "")) +
          td("Customer", esc(customer(o)) + (o.username ? '<br><span class="muted">@' + esc(o.username) + "</span>" : "")) +
          td("Phone", esc(o.phone || "")) +
          td("Product", esc(o.product || "")) +
          td("Qty", esc(o.quantity || "")) +
          td("Product total", money(t.product), "num") +
          td("Delivery", money(t.ship), "num") +
          td("Advance due", money(t.advanceDue), "num") +
          td("Paid advance", money(t.paid), "num") +
          td("Balance due", money(t.balance), "num") +
          td("Status", '<span class="badge">' + esc(o.status || "") + "</span>") +
          td("Actions", actions) +
          "</tr>"
        );
      })
      .join("") || '<tr><td class="empty" colspan="12">No matching orders.</td></tr>';
  updatePreview();
  renderCustomers();
  updateDuplicateWarning();
}
function updatePreview() {
  if (!$("productTotal")) return;
  const p = Number($("productTotal").value) || 0,
    a = Number($("advancePaid").value) || 0,
    zone = $("deliveryArea").value,
    d = DELIVERY[zone] || 0;
  $("orderPreview").textContent =
    "Product total: BDT " +
    money(p) +
    " · Delivery: BDT " +
    money(d) +
    " · Order total: BDT " +
    money(p + d) +
    " · 50% product advance: BDT " +
    money(p * ADVANCE_RATE) +
    " · Balance after paid advance: BDT " +
    money(Math.max(0, p + d - a));
}
async function load() {
  if (!user || loading) return;
  loading = true;
  try {
    const { data, error } = await sb.from("orders").select("id,data,revision,updated_at").eq("owner_id", user.id);
    if (error) throw error;
    const sig = (data || [])
      .map((r) => r.id + ":" + r.revision)
      .sort()
      .join(",");
    const changed = sig !== lastSig;
    lastSig = sig;
    if (changed) {
      allOrders = (data || [])
        .map((r) => ({ ...r.data, id: r.id, _revision: r.revision, _updatedAt: r.updated_at }))
        .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
      orders = allOrders.filter((o) => !o.deletedAt);
    }
    $("syncStatus").textContent = "Synced · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (changed) render();
    autoBackup();
  } catch (e) {
    console.error(e);
    $("syncStatus").textContent = "Sync issue";
    toast("Could not load orders. Check your connection.");
  } finally {
    loading = false;
  }
}
async function saveRow(o) {
  const payload = { ...o };
  delete payload._revision;
  delete payload._updatedAt;
  const updatedAt = new Date().toISOString();
  if (editingId) {
    const { data, error } = await sb
      .from("orders")
      .update({ data: payload, revision: editingBaseRevision + 1, updated_at: updatedAt })
      .eq("id", editingId)
      .eq("owner_id", user.id)
      .eq("revision", editingBaseRevision)
      .select("id,revision")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("CONFLICT");
  } else {
    const { error } = await sb.from("orders").insert({ id: o.id, owner_id: user.id, data: payload, revision: 1, updated_at: updatedAt });
    if (error) throw error;
  }
}
function clearForm() {
  editingId = "";
  editingBaseRevision = null;
  touchedFields.clear();
  $("orderForm").reset();
  $("orderDate").value = today();
  $("quantity").value = 1;
  $("advancePaid").value = 0;
  $("orderFormTitle").textContent = "Add an order";
  $("saveOrderBtn").textContent = "Save order";
  $("cancelEdit").classList.add("hidden");
  updatePreview();
  updateDuplicateWarning();
}
function edit(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  touchedFields.clear();
  touchedFields.add("orderDate");
  touchedFields.add("quantity");
  editingId = id;
  editingBaseRevision = o._revision;
  $("orderDate").value = o.orderDate || "";
  $("platform").value = o.platform || "";
  $("customerName").value = o.customerName || o.displayName || "";
  $("username").value = o.username || "";
  $("phone").value = o.phone || "";
  $("address").value = o.address || "";
  $("product").value = o.product || "";
  $("quantity").value = o.quantity || 1;
  $("productTotal").value = o.productTotal ?? (Number(o.quantity) || 0) * (Number(o.unitPrice) || 0);
  $("deliveryArea").value = o.deliveryArea || "";
  $("advancePaid").value = o.advancePaid ?? 0;
  $("bkashDigits").value = o.bkashDigits || "";
  $("status").value = o.status || "Inquiry";
  $("orderNotes").value = o.notes || "";
  $("orderFormTitle").textContent = "Edit order";
  $("saveOrderBtn").textContent = "Save changes";
  $("cancelEdit").classList.remove("hidden");
  showPage("orders");
  updatePreview();
  updateDuplicateWarning();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function saveOrder(e) {
  e.preventDefault();
  const o = {
    id: editingId || makeId(),
    orderDate: $("orderDate").value,
    platform: $("platform").value,
    customerName: $("customerName").value.trim(),
    username: $("username").value.trim().replace(/^@/, ""),
    phone: $("phone").value.trim(),
    address: $("address").value.trim(),
    product: $("product").value.trim(),
    quantity: Number($("quantity").value) || 1,
    productTotal: Number($("productTotal").value) || 0,
    deliveryArea: $("deliveryArea").value,
    advancePaid: Number($("advancePaid").value) || 0,
    bkashDigits: $("bkashDigits").value.trim(),
    status: $("status").value,
    notes: $("orderNotes").value.trim(),
  };
  if (o.status !== "Inquiry" && !o.deliveryArea) {
    toast("Choose inside or outside Dhaka.");
    return;
  }
  if (!o.customerName && !o.username && !o.phone) {
    toast("Enter a name, username, or phone number.");
    return;
  }
  const statusBefore = o.status,
    auto = autoStatus(o);
  if (auto !== statusBefore) {
    o.status = auto;
    $("status").value = auto;
  }
  try {
    await saveRow(o);
    await load();
    clearForm();
    toast("Order saved to the shared list." + (auto !== statusBefore ? ` Status set to "${auto}" (advance covered).` : ""));
    showPage("orders");
  } catch (err) {
    if (err.message === "CONFLICT") {
      await load();
      const latest = orders.find((x) => x.id === editingId);
      if (latest) editingBaseRevision = latest._revision;
      toast("Changed on another device. Your edits are kept: press Save again to overwrite, or Cancel edit to discard.");
    } else {
      console.error(err);
      toast("Could not save the order. Check your sign-in and internet connection.");
    }
  }
}
const stripMeta = (o) => {
  const x = { ...o };
  delete x._revision;
  delete x._updatedAt;
  return x;
};
async function setDeleted(id, deleted) {
  const o = allOrders.find((x) => x.id === id);
  if (!o) return false;
  const data = stripMeta(o);
  if (deleted) data.deletedAt = new Date().toISOString();
  else delete data.deletedAt;
  const { data: row, error } = await sb
    .from("orders")
    .update({ data, revision: o._revision + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("revision", o._revision)
    .select("id")
    .maybeSingle();
  await load();
  return !error && !!row;
}
async function deleteOrder(id) {
  if (!(await setDeleted(id, true))) {
    toast("Order changed on another device or could not be deleted. Review it and try again.");
    return;
  }
  toast("Order deleted.", async () => {
    toast((await setDeleted(id, false)) ? "Order restored." : "Could not restore the order.");
  });
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const BACKUP_DAYS = 7;
function backupFile() {
  download(
    "kawaiii-kart-backup-" + today() + ".json",
    JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), orders: allOrders.map(stripMeta) }, null, 2),
    "application/json",
  );
  try {
    localStorage.setItem("kkLastBackup", String(Date.now()));
  } catch (_) {}
}
async function backup() {
  await load();
  backupFile();
}
let autoBackupDone = false;
// Downloads a backup on app open when the last one is over a week old (browsers cannot run unattended jobs).
function autoBackup() {
  if (autoBackupDone || !allOrders.length) return;
  autoBackupDone = true;
  try {
    const last = Number(localStorage.getItem("kkLastBackup")) || 0;
    if (Date.now() - last > BACKUP_DAYS * 864e5) {
      backupFile();
      toast("Weekly backup downloaded.");
    }
  } catch (_) {}
}
async function restore() {
  const f = $("restoreFile").files[0];
  if (!f) {
    toast("Choose a JSON backup first.");
    return;
  }
  if (!confirm("Import orders from this backup? Matching order IDs will be replaced.")) return;
  try {
    const doc = JSON.parse(await f.text());
    if (!Array.isArray(doc.orders) || doc.orders.some((r) => !r || typeof r !== "object" || typeof r.id !== "string" || !r.id)) {
      throw new Error("Invalid backup shape");
    }
    const now = new Date().toISOString();
    const rows = doc.orders.map((raw) => {
      const existing = allOrders.find((x) => x.id === raw.id);
      const data = { ...raw };
      delete data._revision;
      delete data._updatedAt;
      return { id: raw.id, owner_id: user.id, data, revision: existing ? existing._revision + 1 : 1, updated_at: now };
    });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("orders").upsert(rows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw error;
    }
    await load();
    toast("Backup imported.");
  } catch (e) {
    console.error(e);
    toast("Backup import failed. Check the file and try again.");
  }
}
async function orderCsv() {
  await load();
  const head = [
      "Order date",
      "Platform",
      "Customer name",
      "Username",
      "Phone",
      "Full address",
      "Product",
      "Quantity",
      "Product total BDT",
      "Delivery area",
      "Delivery charge BDT",
      "Order total BDT",
      "50% product advance BDT",
      "Paid advance BDT",
      "Advance still due BDT",
      "Balance due BDT",
      "bKash sender last digits",
      "Status",
      "Notes",
    ],
    rows = [
      head,
      ...current().map((o) => {
        const t = totals(o);
        return [
          o.orderDate,
          o.platform,
          o.customerName,
          o.username,
          o.phone,
          o.address,
          o.product,
          o.quantity,
          t.product,
          o.deliveryArea || "(unspecified)",
          t.ship,
          t.total,
          t.required,
          t.paid,
          t.advanceDue,
          t.balance,
          o.bkashDigits,
          o.status,
          o.notes,
        ];
      }),
    ];
  download("orders-" + activeMonth + ".csv", "\ufeff" + csv(rows), "text/csv;charset=utf-8");
}
async function summaryCsv() {
  await load();
  const os = current();
  let p = 0,
    d = 0,
    t = 0,
    a = 0,
    b = 0;
  os.forEach((o) => {
    const x = totals(o);
    p += x.product;
    d += x.ship;
    t += x.total;
    a += x.paid;
    b += x.balance;
  });
  download(
    "monthly-summary-" + activeMonth + ".csv",
    "\ufeff" +
      csv([
        ["Month", activeMonth],
        ["Order count", os.length],
        ["Product total BDT", p],
        ["Delivery charges BDT", d],
        ["Order total BDT", t],
        ["50% product advance required BDT", p * ADVANCE_RATE],
        ["Paid advance BDT", a],
        ["Balance due BDT", b],
      ]),
    "text/csv;charset=utf-8",
  );
}
function enterApp(session) {
  const prevId = user?.id;
  user = session?.user || null;
  $("authPage").classList.toggle("hidden", !!user);
  $("appShell").classList.toggle("hidden", !user);
  if (user) {
    if (prevId !== user.id) activeMonth = monthNow();
    $("monthFilter").value = activeMonth;
    if (!editingId) {
      if (!$("orderDate").value) $("orderDate").value = today();
      if (!$("quantity").value) $("quantity").value = 1;
      if (!$("advancePaid").value) $("advancePaid").value = 0;
    }
    load();
    if (!channel) {
      let timer = null;
      channel = sb
        .channel("orders-" + user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "owner_id=eq." + user.id }, () => {
          clearTimeout(timer);
          timer = setTimeout(load, 300);
        })
        .subscribe((status) => (realtimeOk = status === "SUBSCRIBED"));
    }
    if (!poll)
      poll = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        // Realtime pushes changes; the slow poll is only a safety net. Without realtime, poll every 5s.
        if (!realtimeOk || ++ticks % 6 === 0) load();
      }, 5000);
  } else {
    if (poll) {
      clearInterval(poll);
      poll = null;
    }
    orders = [];
    allOrders = [];
    lastSig = "";
    autoBackupDone = false;
    if (channel) {
      sb.removeChannel(channel);
      channel = null;
      realtimeOk = false;
    }
  }
}
async function extractMessage() {
  const message = $("messagePaste").value.trim(),
    button = $("extractMessageBtn"),
    status = $("extractStatus");
  if (!message) {
    status.textContent = "Paste a customer message first.";
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    status.textContent = "Sign in again before extracting.";
    return;
  }
  button.disabled = true;
  status.textContent = "Extracting explicit details…";
  try {
    const response = await fetch("/api/parse-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Extraction failed.");
    const ids = {
      orderDate: "orderDate",
      platform: "platform",
      customerName: "customerName",
      username: "username",
      phone: "phone",
      address: "address",
      product: "product",
      quantity: "quantity",
      productTotal: "productTotal",
      deliveryArea: "deliveryArea",
      advancePaid: "advancePaid",
      bkashDigits: "bkashDigits",
    };
    let filled = 0,
      skipped = 0;
    for (const [name, id] of Object.entries(ids)) {
      const value = result.fields?.[name];
      if (value === null || value === undefined || value === "") continue;
      const input = $(id),
        isUntouchedDefault =
          !touchedFields.has(id) &&
          ((id === "quantity" && input.value === "1") ||
            (id === "orderDate" && input.value === today()) ||
            (id === "advancePaid" && input.value === "0"));
      if (input.value.trim() && !isUntouchedDefault) {
        skipped++;
        continue;
      }
      input.value = String(value);
      filled++;
    }
    updatePreview();
    status.textContent = filled
      ? `Filled ${filled} empty field${filled === 1 ? "" : "s"}. ${skipped ? `${skipped} existing field${skipped === 1 ? " was" : "s were"} left unchanged. ` : ""}Review every value, especially delivery area inferred from the address; nothing has been saved.`
      : "No unambiguous new details were found. Nothing was changed.";
  } catch (error) {
    status.textContent = error.message || "Extraction failed. Nothing was changed.";
  } finally {
    button.disabled = false;
  }
}
async function init() {
  if (SUPABASE_URL.includes("YOUR_PROJECT_ID") || SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE")) {
    $("authMessage").textContent = "Setup needed: add your Supabase project URL and publishable key to config.js.";
    $("signInBtn").disabled = true;
    $("signUpBtn").disabled = true;
    return;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data } = await sb.auth.getSession();
  enterApp(data.session);
  sb.auth.onAuthStateChange((_event, session) => enterApp(session));
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("authMessage").textContent = "Signing in…";
    const { error } = await sb.auth.signInWithPassword({ email: $("authEmail").value.trim(), password: $("authPassword").value });
    $("authMessage").textContent = error ? error.message : "";
  });
  $("signUpBtn").addEventListener("click", async () => {
    const email = $("authEmail").value.trim(),
      password = $("authPassword").value;
    if (!email || password.length < 8) {
      $("authMessage").textContent = "Enter your email and a password of at least 8 characters.";
      return;
    }
    $("authMessage").textContent = "Creating account…";
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    $("authMessage").textContent = error
      ? error.message
      : data.session
        ? "Account created; you are signed in."
        : "Check your email to confirm the account, then sign in.";
  });
  $("signOutBtn").addEventListener("click", () => sb.auth.signOut());
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.goto)));
  $("monthFilter").addEventListener("change", () => {
    activeMonth = $("monthFilter").value || monthNow();
    render();
  });
  $("orderForm").addEventListener("submit", saveOrder);
  $("orderForm").addEventListener("input", (e) => {
    if (e.target.id) touchedFields.add(e.target.id);
    if (e.target.id === "phone" || e.target.id === "username") updateDuplicateWarning();
  });
  $("orderForm").addEventListener("change", (e) => {
    if (e.target.id) touchedFields.add(e.target.id);
    if (e.target.id === "phone" || e.target.id === "username") updateDuplicateWarning();
  });
  $("extractMessageBtn").addEventListener("click", extractMessage);
  $("messagePaste").addEventListener("paste", () => setTimeout(extractMessage, 0));
  $("cancelEdit").addEventListener("click", clearForm);
  $("statusFilter").addEventListener("change", render);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
  $("orderSearch").addEventListener("input", render);
  $("customerSearch").addEventListener("input", () => {
    selectedCustomerKey = "";
    renderCustomers();
  });
  $("customerRows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-customer-history]");
    if (b) {
      selectedCustomerKey = b.dataset.customerHistory;
      renderCustomerHistory();
    }
  });
  $("duplicateHistoryBtn").addEventListener("click", openDuplicateHistory);
  ["productTotal", "advancePaid", "deliveryArea"].forEach((id) => $(id).addEventListener("input", updatePreview));
  $("orderRows").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"),
      de = e.target.closest("[data-delete]");
    if (ed) edit(ed.dataset.edit);
    if (de) deleteOrder(de.dataset.delete);
  });
  $("backupBtn").addEventListener("click", backup);
  $("restoreBtn").addEventListener("click", restore);
  $("ordersCsvBtn").addEventListener("click", orderCsv);
  $("summaryCsvBtn").addEventListener("click", summaryCsv);
}
init().catch((e) => {
  console.error(e);
  $("authMessage").textContent = "Could not connect to the order service. Check config.js.";
});
