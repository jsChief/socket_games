# Suggested Features for Tic-Tac-Toe Game

This document outlines potential features to enhance the Tic-Tac-Toe game.

## 1. Enhanced User Experience & Engagement

*   **Visual Cues & Animations:**
    *   **Turn Indicator:** Clearly indicate whose turn it is (e.g., highlighting the current player's name/symbol, distinct border).
    *   **Move Animations:** Add subtle animations when 'X' or 'O' marks are placed.
    *   **Win/Draw Animation:** Implement more celebratory animations for wins and clear visual cues for draws.
*   **Sound Effects:**
    *   **On Move:** A distinct sound when a mark is placed.
    *   **Win/Loss/Draw:** Different sounds for game outcomes.
    *   **New Player Join:** A subtle sound when an opponent connects.
*   **Improved Chat Features:**
    *   **Emojis:** Allow players to send emojis in the chat.
    *   **Quick Chat:** Implement a set of pre-defined, one-click messages (e.g., "Good game!", "Your turn!").

## 2. Game Mechanics & Flow

*   **Rematch Option:** After a game ends (win/loss/draw), offer both players a "Rematch" button. If both accept, a new game starts.
*   **Player Queue/Lobby:**
    *   Implement a lobby system for more than two connected players.
    *   Allow players to challenge others directly.
    *   Queue new players if a game is in progress.
*   **Timer Per Turn:** Add a countdown timer for each player's move. If time runs out, the player could forfeit or their turn could be skipped.
*   **Game Reset Confirmation:** Ensure both players confirm before the game resets, especially during an active game.

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