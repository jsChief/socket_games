// Room lifecycle + shared room helpers.
//
// `rooms` maps a short join code to a Room object. Each room owns its own
// tic-tac-toe + pizza state (constructed by server.js via makeRoom) and a
// 2-slot player array (seats 0 and 1) referencing the global players.
//
// Deps: { io, players } where `players` is the server's global player array.

var ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var ROOM_EXPIRY_MS = 15 * 60 * 1000; // empty rooms auto-expire after 15 min

module.exports = function createRooms(deps) {
  const { io, players } = deps;
  const rooms = {};

  // Generate a short, hard-to-guess room join code (4 chars, no 0/O/1/I).
  function generateRoomCode() {
    let code;
    do {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
    } while (rooms[code]);
    return code;
  }

  // The room a socket's player is currently seated in (or null).
  function getRoomForSocket(socket) {
    const player = players.find((p) => p.id === socket.id);
    if (!player || !player.roomCode) return null;
    return rooms[player.roomCode] || null;
  }

  // Seat index (0 or 1) of a socket's player within a room, or -1.
  function roomIndexOf(room, socketId) {
    for (let i = 0; i < room.players.length; i++) {
      if (room.players[i] && room.players[i].id === socketId) return i;
    }
    return -1;
  }

  function findFreeSeat(room) {
    for (let i = 0; i < room.players.length; i++) {
      if (!room.players[i]) return i;
    }
    return -1;
  }

  // Emit a socket event to every seated player in a room.
  function toRoom(room, event, payload) {
    for (const p of room.players) {
      if (p && p.id) io.to(p.id).emit(event, payload);
    }
  }

  // True if a room still exists and both seats are filled. Guards the delayed
  // turn timers, which may fire after a player left or the room was closed.
  function roomReady(room) {
    return rooms[room.code] === room && !!room.players[0] && !!room.players[1];
  }

  // Serializable snapshot of a room for the room-view.
  function getRoomView(room) {
    return {
      code: room.code,
      players: room.players
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          name: p.name,
          symbol: p.symbol,
          game: p.game,
          online: !!p.online,
        })),
      openSeats: 2 - room.players.filter(Boolean).length,
    };
  }

  // Delete empty rooms a while after they become empty.
  function scheduleRoomExpiry(room) {
    setTimeout(() => {
      if (rooms[room.code] && !room.players.some(Boolean)) {
        delete rooms[room.code];
        console.log("Room " + room.code + " expired (empty).");
      }
    }, ROOM_EXPIRY_MS);
  }

  return {
    rooms,
    generateRoomCode,
    getRoomForSocket,
    roomIndexOf,
    findFreeSeat,
    toRoom,
    roomReady,
    getRoomView,
    scheduleRoomExpiry,
  };
};