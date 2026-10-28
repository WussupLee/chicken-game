# Duck Game reference notes

This file records the public references used for Chicken Game and the places where implementation is an approximation. It is not a claim of frame-perfect parity.

| Reference behavior | Evidence | Chicken Game |
| --- | --- | --- |
| Fast, one-hit arena combat with many weapons and short rounds | [Official Steam listing](https://store.steampowered.com/app/312530/Duck_Game/) | One-hit elimination, ten weapon types, 45-second round cap |
| Move, jump, crouch/slide, strafe, grab, fire, quack, ragdoll | [Community controls reference](https://duckgame.fandom.com/wiki/Controls) | Separate keyboard/gamepad actions; jump press again to flap; cluck replaces quack |
| Defeated ducks can be picked up in ragdoll mode | [Steam beginner guide](https://steamcommunity.com/sharedfiles/filedetails/?id=535552185) | Defeated chickens can be carried and thrown |
| Default required wins and score intermission are ten rounds; tied leads require further play | [Community multiplayer reference](https://duckgame.fandom.com/wiki/Multiplayer), [intermission reference](https://duckgame.fandom.com/wiki/Intermission) | Score intermission every ten rounds; ten wins with an outright lead ends match |
| Hats are chosen in the lobby | [Community hats reference](https://duckgame.fandom.com/wiki/Hats) | Eight cosmetic hats selected in a ready room |
| Chicken character sprites have idle, walk, attack, die, jump, and fly sheets | [vmiinv asset page](https://vmiinv.itch.io/chickenpack-asset) | Local PNG sheets used in Phaser; additional states use squash and overlays |
| Pistol and submachine gun sprites | [Arcade Island GUNS Asset Pack V1](https://arcadeisland.itch.io/guns-asset-pack-v1), [V1.01 update](https://arcadeisland.itch.io/guns-asset-pack-v1/devlog/799479/update-v101-5-guns) | Glock P80 and MP5A3 sprites are included and used. The supplied folder does not contain a shotgun. Pack permits game use and modification; do not resell assets individually or present them as original work. Credit: Arcade Island. Original grenade icon is drawn in code. |

## Known differences

- The arenas, menu artwork, weapon balance, announcer writing, and sound cues are original rather than copies of Duck Game assets.
- The current ready room and results presentation follow the same broad flow but have not been validated screen by screen against a full gameplay recording.
- Physics values are tuned for playable browser combat, not measured from Duck Game source code or a frame-by-frame capture.
- The ten arenas and three weapons are a curated first release. Duck Game lists more than 100 levels and more than 50 weapons in its official store description.

## Weapon asset credit and terms

Arcade Island, “GUNS Asset Pack V1” and “Update V1.01 (+5 Guns),” itch.io. The creator's page permits use and modification in games and commercial projects, and prohibits reselling the images as standalone assets or presenting them as your own. This project uses the Glock P80 and MP5A3 individual sprites from the supplied V1.01 folder. No shotgun sprite was present in that folder; the game uses the MP5A3 as its second firearm. Grenade artwork is original.
