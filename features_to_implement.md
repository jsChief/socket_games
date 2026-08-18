# Suggested Features for Tic-Tac-Toe Game

This document outlines potential features to enhance the Tic-Tac-Toe game.

## 1. Enhanced User Experience & Engagement

*   **Visual Cues & Animations:**
    *   **Turn Indicator:** Clearly indicate whose turn it is (e.g., highlighting the current player's name/symbol, distinct border).
    *   **Move Animations:** Add subtle animations when 'X' or 'O' marks are placed.
    *   **Win/Draw Animation:** Implement more celebratory animations for wins and clear visual cues for draws.

> **Status:** DONE. The Tic-Tac-Toe screen now shows a turn indicator as two
> player cards (you + opponent) with the active player highlighted (ring +
> pulse + color), a pop animation on every placed mark, a glowing highlight on
> the winning line, and a full-screen animated win/lose/draw banner. Game info
> (turn, result, invalid moves) is shown on the game screen instead of being
> posted into the chat feed (see `tictactoe-view.js` + `main.js`).
>
> The **Find My Pizza** screen got the same treatment (`pizza-view.js`): player
> cards with a highlighted turn indicator during battle, pop/hit/miss cell
> animations, a full-screen animated win/lose banner, and a rematch banner when
> the opponent asks to play again.
*   **Sound Effects:**
    *   **On Move:** A distinct sound when a mark is placed.
    *   **Win/Loss/Draw:** Different sounds for game outcomes.
    *   **New Player Join:** A subtle sound when an opponent connects.

> **Status:** DONE. A sound plays on every placed Tic-Tac-Toe mark (own move +
> opponent move), wins/losses/draws each use their own sound, and a subtle join
> sound plays when an opponent connects. New dedicated files (`move.mp3`,
> `join.mp3`, `draw_notify.mp3`) are wired up in `index.html` + `main.js` and
> automatically fall back to existing sounds until you drop those files into
> `public/assets/`.
*   **Improved Chat Features:**
    *   **Emojis:** Allow players to send emojis in the chat.
    *   **Quick Chat:** Implement a set of pre-defined, one-click messages (e.g., "Good game!", "Your turn!").

> **Status:** DONE. The chat has a one-click emoji reaction bar (👍❤️😂😮😢🔥👏🎉)
> and a "💬 Quick Chat" toggle with preset one-click messages ("Your turn!",
> "Good game!", "Rematch?", ...) that are sent like normal chat messages — see
> `chat-view.js`.

## 2. Game Mechanics & Flow

*   **Rematch Option:** After a game ends (win/loss/draw), offer both players a "Rematch" button. If both accept, a new game starts.
*   **Player Queue/Lobby:**
    *   Implement a lobby system for more than two connected players.
    *   Allow players to challenge others directly.
    *   Queue new players if a game is in progress.
*   **Timer Per Turn:** Add a countdown timer for each player's move. If time runs out, the player could forfeit or their turn could be skipped.
*   **Game Reset Confirmation:** Ensure both players confirm before the game resets, especially during an active game.

> **Status (Rematch + Reset Confirmation):** DONE. The Tic-Tac-Toe screen has a
> "↻ New Game" button (no more `/reset` chat command). It sends a reset request to
> the opponent, who sees an Accept / Decline dialog on the game screen. Both
> accepting players get a fresh board. Requests/accepts are scoped per-room and
> are cleared automatically if a player leaves (see `tictactoe-view.js`,
> `main.js` and the `request-game-reset` / `accept-game-reset` /
> `decline-game-reset` handlers in `server.js`).

## 3. Persistence & User Management

*   **Player Profiles with Stats:**
    *   Store and display win/loss/draw records associated with each `persistentUserId`.
*   **Leaderboard:** Create a simple leaderboard showing top players based on stats.
*   **More Robust User Authentication:** (Future consideration for advanced versions) Integrate a full user authentication system (e.g., username/password, social logins).

## 4. Spectator Mode & Social Features

*   **Spectator Mode:** Allow additional connected users to watch ongoing games without interaction.
*   **Public Game List:** Display a list of ongoing games that spectators can choose to watch.

## 5. Customization

*   **Theme Selection:** Allow players to choose different visual themes for the game board and UI.

## 6. Game Rooms (implemented ✅)

Currently the whole app is a single 2-player table: two players join, pick a game, and play. Game rooms would let several players be online at once while playing in separate, independent games.

*   **Room creation & joining:**
    *   A player creates a room → gets a short join code (e.g., 4-6 chars) and/or a URL like `#/room/ABCD`.
    *   Friends join by entering the code or opening the link. Rooms are private by default.
    *   Room list tab in the lobby (public rooms) + "create room" / "join with code" buttons.

> **Status:** DONE. Players create a 4-char private room from the lobby and friends
> join via the code (see `room-view` + lobby controls). A public room list / tab and
> `#/room/CODE` share links are future enhancements.
*   **Room lifecycle:**
    *   Rooms exist server-side (in-memory `rooms` map); owner can close the room.
    *   Empty rooms auto-expire after a timeout.
    *   Server restart clears rooms (they're ephemeral).
*   **Per-room game state:**
    *   Each room gets its own `table`, `gameOn`, `currentPlayer`, `pizza` state, and 2 `players` — currently these are all global (single shared board).
    *   All game socket events (`btn-pos`, `select-game`, `leave-game`, pizza events, reset, rematch) need to be scoped to the sender's room.
*   **Refactor impact:**
    *   Extract the current single-game logic into a `Room` object/class so each room has its own copy.
    *   `players` array stays global (all connected users), but each room references its two seated players.
    *   Chat is already global — decide if it should be room-scoped or stay global.
*   **Seating & joining:**
    *   Rooms are limited to 2 seated players (+ optional spectators later).
    *   Host decides game (or both pick). Guest's room shows the same lobby/select flow, scoped to that room.
    *   Reconnection: reconnect to your room via the token/`persistentUserId` — restore which room you were in.
*   **Nice-to-haves (later):**
    *   Spectators in a room (watching the live board).
    *   Room settings (e.g., which games enabled, turn timer).
    *   Invite links that auto-register/login the invited friend.

* forgot password
Admin-issued reset code (best for a friend group). Player clicks "forgot password" → server shows "ask an admin for a reset code" → you run a command that prints a short-lived one-time code → player enters code + new password in the dialog → server resets. The out-of-band channel is you telling them the code in person/WhatsApp.

## 7. Reversi (Othello) ✅

A full two-player Reversi game, selectable from the room game cards.

> **Status:** DONE. Game logic lives in `lib/reversi.js` (board is a 64-cell
> array, symbols `b`/`w`, black moves first, `flipsForMove` flank validation,
> pass when a player has no legal moves, win/lose/draw + stats). The server wires
> it like the other games (`reversi-start` / `reversi-state` /
> `reversi-game-over` / `reversi-move` / `reversi-rematch` /
> `reversi-rematch-request` / `reversi-info`), scoped per room with reconnect
> resync. The `reversi-view` component shows player cards with a turn indicator,
> a green board with legal-move dots, pop + flip animations, a win/lose/draw
> overlay with counts, and a rematch banner. E2E coverage: reversi starts in its
> own room, an opening move flips the expected cell and passes the turn, and
> reversi events never leak across rooms.

## 8. AI Bot (play against the computer) 🤖

Practice any game solo by adding an AI as the second player in a room.

> **Status:** DONE. From the room screen, a player can click "Add AI opponent";
> the server spawns a real `socket.io-client` connection (`lib/bot.js`) that
> joins the room as "AI Bot" and mirrors whatever game you pick, so games start
> instantly. It plays all three games over the same socket protocol a human
> uses: perfect minimax for Tic-Tac-Toe, a flanks + corners greedy for Reversi,
> and hide-and-hunt placement for Find My Pizza. It auto-accepts resets and
> rematches, reacts with a short delay so moves are visible, cleans itself up
> when the human leaves, and can be removed via "Remove AI". Served only to its
> own room (per-room `persistentUserId`, excluded from the online players list)
> and covered by e2e tests for all three games.

## 9. Spectator Mode (watch a live room) 👁

When both seats of a room are full, players who join by code watch the game live instead of getting a "room is full" error.

> **Status:** DONE. Joining a full room now puts you in spectator mode. The
> server keeps a `room.spectators` list (`lib/rooms.js`) and emits a separate
> `spectate-<game>` event stream for watchers (`spectate-tictactoe`,
> `spectate-reversi`, `spectate-pizza`), so spectators never receive private
> player events (`set-turn`, `click-btn`, `player2`, ...). Each game module
> exposes a `spectateTo(socket, room)` snapshot so joining mid-game instantly
> shows the current board + whose turn it is. Pizza keeps the hidden slice
> placements secret — only probes (hits/misses) are revealed, so you can't spoil
> the outcome. The new `spectator-view` component shows both player cards with a
> live turn highlight, the live board (winning Tic-Tac-Toe line included), and a
> "Take a seat" button; when a seated player leaves, your seat fills the room.
> Reconnecting spectators are restored to the spectator screen. Supported by e2e
> coverage (join a full room → live board on join → moves broadcast live → no
> private events leak to spectators / no spectate events leak to players →
> taking a freed seat). A public game list (#4) is still a future enhancement.