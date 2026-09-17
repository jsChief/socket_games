# Player Registration & Login — Implemented

Simple username + password auth for the games, for a small circle of friends.

## What was built

- **Auth screen** (`public/components/auth-view.js`): a landing view with Log in / Register tabs.
- **Server-side accounts** (`server.js`):
  - Passwords hashed with Node's built-in `crypto.scrypt` + random salt (never stored in plaintext).
  - Accounts + "remember me" tokens persisted to `accounts.json`.
  - `register` / `login` socket events with validation (username 2–20 chars, unique, case-insensitive; password ≥ 4 chars).
  - On success the server returns a session `token` and connects the player via the shared `connectPlayer()` path.
  - `auth-connect`: the client sends its stored token on connect for auto-login; invalid/missing token → `auth-required`.
  - `set-name` still exists as a legacy fallback (`/name`), but registered players get their username as the canonical name.
- **Client** (`public/main.js`, `public/index.html`):
  - The app starts on the auth view; a valid token skips straight to the lobby.
  - Token + username cached in `localStorage` (`authToken`, `authUsername`).

## Flow

1. Page loads → socket connects → client emits `auth-connect` with the stored token.
2. Server validates the token:
   - Valid → `auth-success` → client restores lobby/game view.
   - Invalid/none → `auth-required` → client shows the auth form.
3. User logs in or registers → server emits `auth-success` (with token) → same as above.

## Not done (fine for a friend group, revisit if needed)

- Rate limiting / brute-force lockout on login.
- HTTPS for LAN play (use the ngrok HTTPS tunnel for internet play).
- Profanity filtering / character restrictions on usernames.
- Guest mode, OAuth, or a real database.
