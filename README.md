# Kawaiii Kart preorder tracker

A responsive order ledger for desktop and phone. Orders are stored in Supabase and shared across devices signed in to the same account. The app includes monthly summaries, 50% advance calculation on product total, delivery fees of BDT 80 inside Dhaka and BDT 130 outside Dhaka, paid-advance tracking, CSV export, and JSON backup/restore.

## Security

`config.js` contains only the Supabase project URL and publishable browser key. The `orders` table uses row-level security and is accessible only to authenticated users for their own account. Never add a Supabase secret or `service_role` key to this repository or browser code.

## First use

1. Open the deployed Vercel site and create an account with your email and a strong password. Confirm your email if Supabase asks.
2. Sign in on every device using that same account to see the same order list.
3. The site refreshes data every five seconds and warns about simultaneous edits to the same order.
4. Download JSON backups regularly from **Backup & export**.

The site is mobile-friendly and uses dark mode by default. No example customer data is included.
