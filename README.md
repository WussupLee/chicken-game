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
- **Controls:** A/D move, S crouch or slide, Space jump and press again to flap, J grab or throw, K fire, L ragdoll, Shift strafe, E cluck. Rebind keyboard keys from Controls. Gamepad uses the stick or D-pad, A jump, X fire, Y grab, B cluck, and shoulder buttons for strafe and ragdoll. Touch devices show an on-screen movement pad and action buttons during matches.
- The score is shown every ten rounds. The first player or bot with ten wins and an outright lead takes the match at an intermission.

## Play together on a local network

1. On the host computer, run `npm run build` and `npm start` from `L:\Chicken Game`, then open <http://localhost:3000> and choose **Host a room**.
2. The ready room shows a LAN invite such as `http://192.168.1.161:3000/?room=ABC123`. Send that link to friends on the same Wi-Fi or wired network, or tell them the address and six-character code separately.
3. Each friend opens the host's address in their own browser. The link joins the room directly; otherwise choose **Join a room** and enter the code. The host can fill remaining slots with bots, then select **Start match**.

Keep the host computer and server running during play. If another device cannot open the address, confirm that both devices are on the same network and that Windows Firewall permits Node.js to receive connections on TCP port 3000 for the private network. A room code identifies a room on this host; it does not connect across the internet without a public server or a VPN.

## Hosting

`railway.json` is available for later public hosting. For now, rooms and scores live in the local server's memory; restarting it clears them.

## Art

Character sprites are from [vmiinv's Chicken pack](https://vmiinv.itch.io/chickenpack-asset). The included `client/public/assets/chicken/LICENSE.txt` allows use and modification in a game, but prohibits resale or distribution of the sprites as standalone assets. Other arena and hat graphics are drawn by the game code.

Pistol and submachine gun sprites are from [Arcade Island's GUNS Asset Pack V1](https://arcadeisland.itch.io/guns-asset-pack-v1): Glock P80 and MP5A3. The supplied V1.01 folder has no shotgun, so the MP5A3 is used as the second firearm. The asset page permits game use and modification, and asks that assets not be resold individually or presented as original work. Grenade art is drawn by the game. Attribution and usage terms are in `client/public/assets/weapons/ATTRIBUTION.txt`.

## Current limits

The game has ten arenas, three weapons (pistol, submachine gun, grenade), eight hats, private four-participant rooms, and one bot skill level. It is a playable first release, not a frame-perfect reproduction of Duck Game. It does not include public matchmaking, persistence, live spectator slots, a level editor, or the complete Duck Game content catalog.
