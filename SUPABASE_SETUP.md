# Flashy cloud setup

This branch introduces the Supabase client and configuration. **The existing local-only app is not yet cloud-synced**; the authentication and migration UI will follow after review.

1. Confirm the Flashy tables and row-level security policies were created in Supabase.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run build`, then `npm run dev`.
5. Before migrating existing cards, export a JSON backup from the original app.

The publishable key is public by design. Never put a database password, secret key, or service-role key in frontend environment variables. Keep RLS enabled.
