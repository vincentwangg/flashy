# My Flashcards — mastery edition

Mobile-friendly React + TypeScript flashcards. No scheduled reviews. Again resets mastery points to zero, Got it adds one, Easy adds two. At four points a card is mastered and removed from normal practice. Use **Practice mastered words** to revisit mastered cards without automatically unmastering them.

## Run locally
1. Install Node.js (current LTS).
2. Open a terminal in this folder.
3. Run `npm install` then `npm run dev`.
4. Open the URL shown by Vite (usually http://localhost:5173).

## Build and publish
Run `npm run build`. For Cloudflare Pages, connect your GitHub repository, set build command to `npm run build` and output directory to `dist`. Cloudflare will assign a `*.pages.dev` URL; a custom domain is optional.

## Backups and limits
Export JSON to back up cards and mastery progress. Import JSON merges by ID. Data is stored **only in this browser** until cloud sync is added. Do not rely on browser storage as your only backup.

## Next step: cloud sync
Add Supabase Auth and a database table scoped to the authenticated user, with Row Level Security enabled. Never put a Supabase service-role key in frontend code or GitHub. Test policies before deployment. Handle conflicts when editing from multiple devices.

## Deck workflow

Create decks in the separate **Create a deck** section. When you select a deck in Study, it is also selected by default in **Add a card**; you can change the deck from the dropdown. Empty decks persist in local storage on this device. Existing cards are retained using the same storage key as the previous mastery version.
