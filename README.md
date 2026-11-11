# Breakroom

A roguelike brick breaker in the dark. You are chained to a paddle in a basement: clear the wall before the ceiling comes down. By Samderverse.

## Play
- Drag to move the paddle (relative drag on touch, so your thumb never covers it). Tap to launch.
- Desktop: mouse, or arrow keys / A and D. Space to launch, M for a match, P or Esc to pause.
- Dropping the ball pops a bulb. Three bulbs, and each one lights a stretch of the floor.
- The wall drops a row on a timer. If it reaches the red line, the tape ends.
- Three floors of three rounds; the last round of each floor is a boss. Between rounds the Host offers three deals.

## Files
- `index.html`: screens, overlay and styles
- `js/config.js`: floors, layouts, bosses, deals and the Host's lines (all the tuning is here)
- `js/game.js`: rules and physics, no DOM (can be simulated in Node)
- `js/render.js`: draws the room at 240 x 427 and lights it
- `js/postfx.js`: the VHS/CRT WebGL pass, with a 2D fallback
- `js/audio.js`: music, ambience and effects channels; the sound for each game moment is in `play()`
- `js/main.js`: screens, input and the main loop

### Brick legend (layouts in `config.js`)
`#` breeze block · `=` steel plate (2 hits) · `o` wired glass (lights the room) · `X` pipe (unbreakable) · `t` block with a tape inside · `.` empty

## Audio
- `audio/theme.mp3`: Potential Theme, levelled, faded tail trimmed
- `audio/ambience.mp3`: 96 s of Dread Ambience, crossfaded into a seamless loop and raised
- `audio/sfx/drip-1..4.mp3`: single drips cut from Water Drip Echo in Room, played at random around the room
- `audio/sfx/thud-a/b, chain, clunk, tape-click/tick, glass, glitch`: Tilt's clips, pitched down, low-passed, with a small room echo

## Credits
Add the sources for the theme, ambience and drips in `js/main.js` (`CREDITS`) and here.
Clips adapted from Tilt: sonidosKMD (thuds, chain, clunk, tape buttons), Epic Sound Effects (glass), Edwardo Ching (glitch).
Fonts: Anton, Special Elite, VT323 (Google Fonts).

## Testing helpers
`window.__breakroom` in the console: `.g` is the current round, `.run` the run, `.jump(floor, round)` skips ahead (0-based), `.deal()` opens the deal screen.
