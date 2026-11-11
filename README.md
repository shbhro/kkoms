# Kawaiii Kart preorder tracker

A responsive order ledger for desktop and phone. Orders are stored in Supabase and shared across devices signed in to the same account. The app includes monthly summaries, 50% advance calculation on product total, delivery fees of BDT 80 inside Dhaka and BDT 130 outside Dhaka, paid-advance tracking, CSV export, and JSON backup/restore.

## Security

`config.js` contains only the Supabase project URL and publishable browser key. The `orders` table uses row-level security and is accessible only to authenticated users for their own account. Never add a Supabase secret or `service_role` key to this repository or browser code.

## First use

1. Open the deployed Vercel site and sign in. Sign-ups are closed by a database trigger (`block_new_signups` on `auth.users`); to add a user, create it in the Supabase dashboard after running `drop trigger block_new_signups on auth.users;`, then re-create the trigger from `schema.sql`.
2. Sign in on every device using that same account to see the same order list.
3. Changes sync instantly when Realtime is enabled (run the last block of `schema.sql` once); otherwise the site polls every five seconds. If an order was edited on another device, your typed edits are kept and you choose whether to overwrite.
4. Download JSON backups regularly from **Backup & export**.

The site is mobile-friendly and dark-mode only. No example customer data is included.


## Optional message extraction (Groq)

The Orders page can extract directly stated fields from a pasted customer message. Extraction runs automatically when you paste a message into the box (or when you click **Extract fields**) and requires a signed-in session. Existing non-empty fields are left unchanged, unclear details are returned blank, and the order is never saved automatically. New order forms default to today’s local date and quantity 1. Extraction may replace those untouched defaults when the message clearly states a date or quantity. A clear delivery address may be used to select inside or outside Dhaka; ambiguous addresses remain unselected. When fields are filled, the paste box is cleared. If the message states a payment (for example `paid: 500`) on an Inquiry or Awaiting-advance order, the status becomes Advance paid; verify the payment yourself. Review all extracted values before saving. The pasted text is sent to Groq for inference and is not stored by this app or added to order notes.

To enable it, add `GROQ_API_KEY` as a **Production** environment variable in Vercel, then redeploy. Keep the key out of `config.js`, the browser, and GitHub. Without the key, all other tracker functions continue to work. Groq model output can be wrong; verify customer details and payment claims against the conversation and independent payment evidence.


## Customer history and duplicate warnings

The **Customers** page shows an all-time directory built from saved orders, independent of the selected month. It groups possible customer histories only by matching normalized phone number or username; names are displayed but never used to match. The order form warns when a phone or username matches an earlier order and provides a shortcut to review that history. Matches are suggestions, not proof that two orders belong to the same person, so check the history before proceeding.


## Deleting, filters and backups

Delete is a soft delete with an **Undo** button; deleted orders are hidden but kept in backups. The orders list has a status filter, including **Needs advance** and **Balance due**. Saving an Inquiry or Awaiting-advance order whose paid advance covers 50% of the product total sets its status to Advance paid. When you open the app and your last backup is over seven days old, a JSON backup downloads automatically.

## Development

`logic.mjs` holds the pure rules (totals, customer matching, CSV safety). Run `npm test` (Node 20+) to test them.
