# Wendy Quest Access

An accessibility mod for **WendyQuest: Legend of the Four Corner Stones** on Windows. It provides spoken menus and dialogue, destination browsing, directions, optional autowalk, spatial navigation sounds, battle timing assistance and optional voiced animation descriptions.

This repository and the current preparation build remain private. Public release is pending.

## Installation

Requires 64-bit Windows 10 or 11, .NET Framework 4.8, and the English Steam game, App 3339970, **build 26578620**. The installer checks the actual files and stops on an unsupported build. No separate Node.js or Python installation is needed.

1. Extract the entire release ZIP to a folder outside the game.
2. Save and close Wendy Quest. Let Steam finish any updates.
3. Run **WendyQuestAccessSetup.exe**. Review the detected game folder, or use Browse to select the folder containing WendyQuest.exe.
4. Select **Install or update**, then Continue. Wait for Installation complete.
5. Start the game normally through Steam with your screen reader running. Press **F8** for mod settings and Help.

The installer generates navigation data from your own game files. It preserves saves and preferences, and retains the original scripts for removal. Keep the installer ZIP for updates or repair. If the selected game folder requires administrator access, run the installer as administrator only when needed.

For an update or repair, close the game and run the newer installer using Install or update. **Verify installed files** checks an existing installation. **Remove mod** restores the original scripts and removes the mod's files while retaining saves and preferences. Changed or unrecognized files are preserved; an interrupted update is recovered on the next run. Do not delete the game's `.wendyquest-access-recovery` folder while the mod is installed. Steam verification may replace patched scripts; reinstall the mod afterward.

## First steps

Use the game's normal controls: arrows or WASD to move, Enter or Space to confirm/interact, and Escape to back out. There is no confirmed keyboard dash; navigation guidance uses normal walking speed.

The default navigation layout is **Letters**, leaving the right hand free for movement. Select **Brackets** in F8 settings if preferred. Keyboard bindings and controller bindings can be changed separately. Help in F8 lists the current controls.

| Action | Letters layout | Brackets layout |
| --- | --- | --- |
| Previous / next destination | J / L | [ / ] |
| Previous / next category | Shift+J / Shift+L | Shift+[ / Shift+] |
| Read selected destination | K | P |
| Request directions, or start autowalk | P | Backslash |
| Change destination filter | Shift+P | Shift+Backslash |

Common shortcuts:

| Key | Action |
| --- | --- |
| F8 | Mod settings, Help and keyboard/controller bindings |
| R | Repeat current dialogue or battle feedback |
| I | Details for the current screen or selection; see below |
| Shift+I | Fighter or companion appearance in battle |
| H | Current visible HP, FP and other displayed meters |
| G | Gold in pause/shop screens |
| M / Shift+M | Current map name / visual description |
| Ctrl+Backslash | Toggle autowalk; initially off |
| Shift+B | Toggle route beacon |
| Shift+H | Toggle wall tones |
| Shift+V | Stop navigation |
| Shift+G / Ctrl+G | Start or review / stop puzzle guidance |
| Shift+Up / Shift+Down | Previous / next review line where available |
| Shift+Left / Shift+Right | First / last review line where available |

## What I reads

I follows the current context. It reads:

- The field's displayed quest title, objective and progress.
- The current dialogue speaker's appearance, or a displayed acquisition icon.
- The selected inventory, equipment, battle item or shop item's description; comparisons and quantity/price information where displayed.
- Battle target appearance, visible HP percentage and conditions; Special help or the required unlock level. A Special without help says No description available.
- The displayed atlas, cavern map, ruins map or map-board directions, including relevant visible position/quest markers.
- The latest manual-save result on the pause Save screen, coupon instructions/codes, and supported prologue/ending cards.

## Navigation and puzzles

Routes use another area only when a verified connection leads onward to your destination. Entrances are never treated as shortcuts across their tiles. This applies to all destination categories and saved points.

Choose a category, then a destination. Categories include NPCs, merchants, objects, treasure, exits, events, checkpoints, vehicles, quests and bookmarks. Each category starts with its nearest destination. Its order stays fixed while you browse or follow a route; switching categories sorts again. Quest markers belong to Quests.

The filter switches between all current-map destinations and reachable destinations. Directions explain known blockers and guide you to required conversations, crystals or exits. Spoiler mode is initially off. Events gain contextual names after you encounter them in that playthrough; spoiler mode names them immediately. Save normally to retain that history. Older saves learn repeating scenes when encountered again. Save locations or selected destinations under F8, Navigation, Bookmarks. Bookmarks persist between sessions and can route across supported maps and unlocked vehicles.

Autowalk is optional. With it enabled, the directions key says Walking and moves toward the selected destination. It silently recalculates around changing actors, faces an interaction when arriving, and says Arrived. When a route needs a bridge or passage button, autowalk faces it and waits for you to press Confirm. After the button event finishes, it resumes toward the original destination. Autowalk stops before ordinary event triggers, NPC conversations, entrances, crystals and pickups. Activate them yourself. Inside the Secret Island cave only, it activates distraction crystals and patrol, chase or staircase events, then continues when native control returns. The final chase exit is automatic to keep Wendy moving out of danger. Pickups, checkpoints and other room exits still wait for your input. Close any native dialogue or reward messages normally. After a story or warning conversation, press Directions when you choose to continue. Cross-map selection is retained; press Directions again after entering another map. Shorter routes may lead through removable ice instead of taking a long detour. Other required interactions also keep their native prompts. Manual movement or Shift+V cancels navigation. Follow native dialogue and interaction prompts when they appear.

**F8 → Secret Island → Automatic interactions** starts off and preserves the cave behavior above. Turn it and Autowalk on, then press **Shift+G** for full cave solving: collect available pickups, activate checkpoints, handle crystals/events and pass between cave rooms. Confirm dialogue and reward messages yourself; movement resumes afterward. Progress comes from the save, so you can restart partway through. The solver stops after the chase ends and does not walk to the shrine. Pickups already beyond a one-way barrier remain uncollected and are reported at the end; revisit the cave for those. Manual movement, settings, focus loss or the stop command cancels solving.

Shift+G enables state-aware guidance for supported puzzles. F8 → Navigation → **Verbose puzzle guidance** defaults on: directions come first, followed by progress and explanation. Turn it off for only the next directions and required action. Salt Caverns guides the terrain-crystal routes to all four chests before the final colors, and updates after free roaming changes. Cave guidance provides the current movement leg, directional pings and wait feedback. The directions key repeats the remaining leg. Autowalk also handles supported patrol, chase and distraction-crystal sequences. Guidance follows the selected destination, including treasure; it does not skip the game's prerequisites.

Vehicle announcements identify boarding and returning on foot. The airship says Can land over an available landing area. Vehicle routes use only vehicles actually unlocked.

## Battle and audio

Enemy focus reads the name and visible HP percentage. Repeated enemy types receive their own numbers, such as Conehead 1 and Conehead 2. H reads Wendy's displayed numeric vitals where the game provides them. Attack and damage messages are queued; defeat follows damage.

Battle timing cues and cave timing cues start **on for new profiles**. Cave timing, volume and ping preview are under **F8 → Secret Island**, visible only on Secret Island and its cave maps. Updates retain your choices. Battle cues support normal, spicy, frosty and Frozen ice-breaking states. Optional **automatic perfect timing**, under F8, Battle, starts off. Begin an attack normally; this option then confirms the meter in its valid range. Native battle conditions still apply.

F8, Audio groups adjustable navigation sounds and volumes. **Sound previews** has its own submenu. Speech and sounds have independent master switches. HRTF provides spatial playback; stereo playback uses left/right placement and a lower rear cue. Wall tones, bumps, footsteps, beacons and the entity soundscape can be adjusted independently.

Optional **Cutscene descriptions** in Audio describe supported visible animations, including reactions, idle actions, Momentum crystals, screen glitches and the supported special skills. They start off. Under **Speech → Visual description voice**, choose **recorded** (the default) or **NVDA**. Recorded speed and volume are under Audio; NVDA uses your screen reader’s voice settings. Following automatic text queues behind NVDA descriptions. Recorded descriptions continue across fades and pause at their current position during loading. Updates preserve your choices.

## Controller

Normal controller movement remains native. The right stick browses destinations/categories; LT/L2 requests directions. **View/Share** toggles mod mode. In field mod mode, A reads the destination, Y reads the quest, X reads vitals and Menu opens settings; LB starts/reviews puzzle guidance and RB stops it. In dialogue/battle mod mode, A reads Details and the D-pad reviews text. View/Share leaves mod mode. Press both stick buttons together to toggle controller support if recovery is needed. Settings use the D-pad or left stick, A to confirm and B to go back. Labels adapt to supported controller types; see F8, Help for the full current mapping.

## Troubleshooting and credits

If speech stops, check F8 speech settings and your screen reader. If sounds stop, check the sound master, individual volumes and output device. Use the installer's Verify option for missing files. Report the map, selected destination, action and exact spoken result with WendyQuestAccess-field.log from the game folder; do not share saves unless requested.

The mod's settings and bookmarks live in its local user profile and are retained by updates/removal. The installer never launches the game. The mod preserves the native achievement, save and story logic.

Original accessibility implementation by bladestorm360. Wendy Quest and its artwork, text and runtime belong to their respective owners and are not included. Navigation samples are reused from the author's FFPR Core mod. PRISM, SDL3, OpenAL Soft and their required notices ship with the mod; see ThirdPartyNotices.txt and the installed LICENSES/audio-deps folders. The OpenAL Soft source and HRTF dataset attribution are included there.

Developer build, verification and release instructions: [release procedure](docs/release.md). Feature and engine evidence is indexed in [project memory](CODEX_MEMORY.md).
