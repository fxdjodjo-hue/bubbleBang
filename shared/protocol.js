(function (root, factory) {
  "use strict";

  const protocol = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = protocol;
  }
  root.BubbleBangProtocol = protocol;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTOCOL_VERSION = 2;

  const EVENTS = {
    CREATE_ROOM: "create_room",
    JOIN_ROOM: "join_room",
    LEAVE_ROOM: "leave_room",
    RESTART_ROOM: "restart_room",
    PLAYER_INPUT: "player_input",
    LATENCY_PROBE: "latency_probe",
    ROOM_CREATED: "room_created",
    ROOM_JOINED: "room_joined",
    ROOM_ERROR: "room_error",
    WAITING_FOR_PLAYER: "waiting_for_player",
    COUNTDOWN: "countdown",
    SNAPSHOT: "snapshot",
    PLAYER_DISCONNECTED: "player_disconnected",
    GAME_OVER: "game_over",
    LEVEL_COMPLETE: "level_complete",
  };

  function sanitizeNickname(nickname) {
    const cleaned = String(nickname || "Player")
      .replace(/[^\w .-]/g, "")
      .trim()
      .slice(0, 16);
    return cleaned || "Player";
  }

  function sanitizeRoomCode(roomCode) {
    return String(roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  function sanitizeInput(input) {
    const seq = Math.max(0, Math.floor(Number(input && input.seq) || 0));
    return {
      v: PROTOCOL_VERSION,
      left: Boolean(input && input.left),
      right: Boolean(input && input.right),
      shoot: Boolean(input && input.shoot),
      shootPressed: Boolean(input && input.shootPressed),
      seq,
    };
  }

  return {
    PROTOCOL_VERSION,
    EVENTS,
    sanitizeNickname,
    sanitizeRoomCode,
    sanitizeInput,
  };
});
