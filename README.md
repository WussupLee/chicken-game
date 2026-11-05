# Chicken Game

A browser arena shooter for two to four chickens, including computer opponents for practice. One person hosts a room and shares its six-character code or URL. Each human plays in one browser session with a keyboard or gamepad.

## Run locally

The project and its dependencies live on `L:\Chicken Game`. From PowerShell in that folder:

```powershell
npm install
npm run build
npm start
```

Open <http://localhost:3000>. If `npm` is not installed on this computer, the portable copy already downloaded for this workspace can be used:

```powershell
node .tools/npm/package/bin/npm-cli.js install --cache 'L:\Chicken Game\.npm-cache'
node .tools/npm/package/bin/npm-cli.js run build
node .tools/npm/package/bin/npm-cli.js start
```

For live client editing, run `npm run server` and `npm run dev` in separate terminals, then open <http://localhost:5173>. The Vite proxy sends room traffic to the server on port 3000.

## Play

- **Practice vs. bots** creates a private room with three computer opponents. The host can remove bots in the ready room.
- **Host a room** creates a private room. Share the link or code; add bots to any open slots.
- **Join a room** accepts a six-character code. The room host starts the match when at least two participants are present.
- **Controls:** A/D move, W aim up, W+A/D aim diagonally, S crouch or start a moving slide, Space jump or flap, J grab or throw, K fire or swing, L ragdoll, E cluck. A slide continues briefly when S is released, so you can aim while sliding. Hold toward a wall while falling to slide down it; Jump springs away. Hold toward an exposed ledge to hang; Jump climbs and S alone releases the ledge. S+Space drops through a one-way platform; S alone crouches without dropping and allows crouched fire. Fire picks up a nearby item when unarmed, fires a loaded gun, swings a sword, or charges a throw for an empty gun or held body. Press Fire again during a sword swing to advance through its three combo stages; holding Fire does not advance. Tap Fire once to pull a grenade pin, then hold and release Fire to drop it or throw it in any held D-pad direction. Grab/Throw also picks up nearby items and can throw any carried weapon regardless of ammo. Each pad refills 12 seconds after its weapon is taken. Gamepad uses the stick or D-pad, A jump, B fire, X grab or throw, L cluck, and R ragdoll. The handheld layout has all eight D-pad directions and puts Grab/Throw above A and B. After death, A cycles spectator cameras.
- The score is shown every ten rounds. The first player or bot with ten wins and an outright lead takes the match at an intermission.

## Play together on a local network

Current LAN test link: **http://192.168.1.161:3000/**. Open this on a phone or another PC connected to the same Wi-Fi while the host server is running. If the host's local IP changes, run `Invoke-RestMethod http://localhost:3000/api/network` on the host to get the new link. Save the address as a browser bookmark named **Chicken Game – Local Test**.

1. On the host computer, run `npm run build` and `npm start` from `L:\Chicken Game`, then open <http://localhost:3000> and choose **Host a room**.
2. The ready room shows a LAN invite such as `http://192.168.1.161:3000/?room=ABC123`. Send that link to friends on the same Wi-Fi or wired network, or tell them the address and six-character code separately.
3. Each friend opens the host's address in their own browser. The link joins the room directly; otherwise choose **Join a room** and enter the code. The host can fill remaining slots with bots, then select **Start match**.

Keep the host computer and server running during play. If another device cannot open the address, confirm that both devices are on the same network and that Windows Firewall permits Node.js to receive connections on TCP port 3000 for the private network. A room code identifies a room on this host; it does not connect across the internet without a public server or a VPN.

## Home Screen and full-screen play

The menu has **Add to Home Screen** and **Full screen** buttons. A Home Screen launch opens the handheld layout edge to edge, with controls positioned around the safe areas of the phone screen. In landscape, the D-pad and action buttons move beside the arena. On iPhone, open the link in Safari, choose **Share → Add to Home Screen**, then launch the new icon. On Android, use the install prompt or browser menu after the game is served over HTTPS.

The current `http://192.168.1.161:3000/` LAN link is useful for testing, but Android requires HTTPS for installable web apps. **Full screen** works as an immediate browser-based option where the Fullscreen API is available. The game still needs a connection to the host computer for rooms and matches; the Home Screen icon does not make it playable offline.

## Hosting

`railway.json` is available for later public hosting. For now, rooms and scores live in the local server's memory; restarting it clears them.

## Art

### Pixel Art Studio

Open **Pixel Art Studio** from the game's home menu, or go to <http://localhost:3000/studio.html> on the host PC. Use `localhost`, because saving is intentionally restricted to this computer. The studio reads the same PNG files that the game loads. Choose a character animation and aim variant, click an individual frame, paint or erase pixels, use the picker or fill tool, and press **Play** to preview. The frame strip shows every frame. The Hand tool and X/Y fields edit that frame's weapon placement for forward, upward, or diagonal aim.

Use **Import PNG / sheet** or paste an image with Ctrl+V. A single image must match the selected frame size; a full animation must match the full strip size. The editor rejects implicit resizing so pixels stay on the same grid. **Export frame** downloads one PNG, and **Export sheet** downloads a game-ready horizontal PNG strip. **Save to game** writes the sheet, animation FPS, and anchors to the project; refresh the game tab to load changes. When you edit a character's base sheet, shared pixels update in its aim variants; pixels you edited specifically in a variant stay as they are. Undo and Ctrl+Z work while editing.

The catalog includes the active character animations and their aim variants, reference-only dash, hurt, death, and design sheets, the map's 16 × 16 platform/cover tiles, and all four weapons. The game draws map cover and platforms from those editable tiles. The 128 × 128 character cell is an alignment canvas; the visible chicken uses a smaller pixel footprint inside it. Keep edges on whole pixels and use nearest-neighbor scaling. The **Import new sprite** form adds an asset to the project's library; to make a new type appear in gameplay, also assign its asset ID in `client/main.ts` and any needed simulation behavior in `shared/game.ts`.

Saved character edits are copied into `art/template-edits/hero`, so regeneration retains them; other built-in art uses `art/overrides`. If you edit art in Aseprite or LibreSprite, export PNG sheets with the same frame dimensions and import them here; use the studio for final alignment and game-specific anchors. Run `npm run build` before launching the production server if source code changed. Saved PNG art is also copied into the current `dist` folder for the running local game.

The hero uses animation pixels from **Ozzbit Games' Male Hero Pro** pack, replacing its head with a white chicken head, red comb, and orange beak. The colored torso, legs, and two arms stay distinct. The visible figure is about 30 × 50 pixels within each 128 × 128 frame; the collision box remains at its original gameplay size. The supplied Pro license allows modification and game use; its license and original sheets remain locally under `art/source/template-pro`. This paid source folder is excluded from the public repository. To regenerate, place the licensed Pro pack's `individual_sheets` there and run `npm run art:build` on Windows. Generated game-ready sheets, the shared animation manifest, and hand anchors are in `client/public/assets/hero`. The older `scripts/build-hero-art.ps1` is retired. Run `scripts/review-template-hero.ps1` for per-frame art checks and enlarged contact sheets.

Pistol and submachine gun sprites are from [Arcade Island's GUNS Asset Pack V1](https://arcadeisland.itch.io/guns-asset-pack-v1): Glock P80 and MP5A3. The supplied V1.01 folder has no shotgun, so the MP5A3 is used as the second firearm. The asset page permits game use and modification, and asks that assets not be resold individually or presented as original work. Grenade art is drawn by the game. Attribution and usage terms are in `client/public/assets/weapons/ATTRIBUTION.txt`.

## Current limits

The active rotation has three multi-tier arenas with six weapon pads each and breakable crates, doors, and walls. Their forest, industrial, and space compositions are loosely based on [forest](https://www.pcgamer.com/party-shooter-duck-game-has-a-big-update-adding-an-8-player-mode/), [industrial](https://images.akamai.steamusercontent.com/ugc/199680985357667472/A7D454A44E2EF8FA0035267C71C2475C326D6AFC/), and [space](https://www.mobygames.com/game/83382/duck-game/promo/group-37144/image-341262/) Duck Game screenshots; the layouts and scenery are original drawings. The game has four weapons (pistol, submachine gun, grenade, sword), private four-participant rooms, and one bot skill level. It is a playable first release, not a frame-perfect reproduction of Duck Game. It does not include public matchmaking, persistence, live spectator slots, a level editor, or the complete Duck Game content catalog.
