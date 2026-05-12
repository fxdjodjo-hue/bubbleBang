# Bubble Bang MVP

A small HTML5 Canvas arcade prototype with original placeholder visuals, single-player mode, and a basic authoritative Socket.IO co-op mode.

## Run

Single-player only:

- Open `index.html` in a browser.

Multiplayer:

```bash
npm install
npm run dev
```

Then open `http://localhost:3001` in two browser tabs.

Controls:

- Move: `A` / `D` or left / right arrow keys
- Shoot: `Space`
- Pause: `Esc` or `P`
- Mobile: on-screen move, fire, and pause buttons

## Multiplayer Test

1. Open `http://localhost:3001` in tab one.
2. Choose `Multiplayer`, enter a nickname, and select `Create Room`.
3. Open `http://localhost:3001` in tab two.
4. Choose `Multiplayer`, enter the room code, and select `Join Room`.
5. After the countdown, both players should move and shoot in the same shared arena.

## Files

- `index.html` - single-page game shell and DOM HUD
- `styles.css` - responsive layout, overlay panels, touch controls
- `main.js` - single-player loop, multiplayer client, input, rendering
- `server/index.js` - Express and Socket.IO entrypoint
- `server/RoomManager.js` - room creation, joining, cleanup, socket routing
- `server/GameRoom.js` - authoritative multiplayer simulation
- `server/entities/*` - server-side player, ball, and projectile entities
- `server/levels.js` - shared level data for the server simulation
- `server/collision.js` - authoritative collision helpers
- `package.json` - Node scripts and dependencies

## Next Steps

- Add simple WebAudio effects using the existing `playSoundCue` hook.
- Add authored sprite art and animations for the player and bubbles.
- Tune level layouts and introduce more obstacle patterns.
- Add local high score persistence.
- Add a debug toggle for collision boxes and level balancing.
- Add reconnect support and host migration.
- Add light client interpolation for remote players.
