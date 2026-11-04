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
- **Controls:** A/D move, S crouch or slide, Space jump and press again to flap, J grab or throw, K fire, L ragdoll, E cluck. Tap Fire once to pull a grenade pin and again to throw it before the fuse expires. Rebind keyboard keys from Controls. Gamepad uses the stick or D-pad, A jump, X fire, Y grab, B cluck, and either shoulder button for ragdoll. The handheld interface has a D-pad and action buttons below the screen; slide a finger between buttons without lifting to change inputs. In portrait, the larger arena view follows your chicken; B/Fire sits left of A/Jump, with Grab low, Flop high, and Cluck at the far upper right.
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

Character sprites are from [vmiinv's Chicken pack](https://vmiinv.itch.io/chickenpack-asset). The included `client/public/assets/chicken/LICENSE.txt` allows use and modification in a game, but prohibits resale or distribution of the sprites as standalone assets. Other arena and hat graphics are drawn by the game code.

Pistol and submachine gun sprites are from [Arcade Island's GUNS Asset Pack V1](https://arcadeisland.itch.io/guns-asset-pack-v1): Glock P80 and MP5A3. The supplied V1.01 folder has no shotgun, so the MP5A3 is used as the second firearm. The asset page permits game use and modification, and asks that assets not be resold individually or presented as original work. Grenade art is drawn by the game. Attribution and usage terms are in `client/public/assets/weapons/ATTRIBUTION.txt`.

## Current limits

The active rotation has three multi-tier arenas with six weapon pads each and breakable crates, doors, and walls. It also has three weapons (pistol, submachine gun, grenade), eight hats, private four-participant rooms, and one bot skill level. It is a playable first release, not a frame-perfect reproduction of Duck Game. It does not include public matchmaking, persistence, live spectator slots, a level editor, or the complete Duck Game content catalog.
