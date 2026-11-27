# Wendy Quest Screen Reader V1.0

## Purpose

Adds screen reader access to **WendyQuest: Legend of the Four Corner Stones** on Windows.

- Spoken menus, dialogue, items, equipment, shops and save feedback.
- Battle announcements, target information, visible vitals and text review.
- Destination browsing, directions, bookmarks and supported cross-map and vehicle routes.
- Optional autowalk and automatic reading of route instructions.
- Adjustable spatial navigation sounds, footsteps and nearby-object cues.
- Optional visual descriptions using recorded speech or NVDA.
- Optional battle timing assistance, automatic timing and guidance for supported puzzles.
- Keyboard and controller support, remappable controls and saved preferences.

## Known Issues

Some scenes and routes still need gameplay confirmation. An intermittent loss of game input during autowalk remains under investigation. Report missing speech, incorrect directions or unresponsive input with a short description and **WendyQuestAccess-field.log** from the game folder.

The installer is unsigned. Windows may display an unknown-publisher warning. It checks the supported game files before making changes; it never launches the game.

## Install

Requires 64-bit Windows 10 or 11, .NET Framework 4.8 and the English Steam game: App 3339970, build 26578620. Separate Python, Node.js or mod-loader installations are not required. The standard installer needs internet access for installation and updates. The manual ZIP works offline after downloading.

### Standard installer

1. Save and close Wendy Quest. Let Steam finish any update.
2. Download [WendyQuestAccessSetup.exe](https://github.com/bladestorm360/WendyQuestAccess/releases/latest/download/WendyQuestAccessSetup.exe).
3. Run the installer. Check the detected game folder, or select **Browse** to choose the folder containing WendyQuest.exe.
4. Choose **Install or update**, then **Continue**. It checks GitHub for the latest release and downloads the verified package only if installation, an update or repair is needed. A verified current installation downloads no package.
5. Wait for completion. Start NVDA, then start the game normally through Steam.
6. **Play with NVDA in focus mode. Press NVDA+Space bar to switch modes; NVDA should announce Focus mode.** This lets the mod receive its letter shortcuts.

Keep the installer for future updates. Updates preserve saves, bookmarks and preferences. The downloaded package includes this ReadMe; the installer's **ReadMe** button opens the installed guide when available. The full guide is also displayed on the [repository home page](https://github.com/bladestorm360/WendyQuestAccess).

**Verify installed files** checks the local installation without downloading an update. **Remove mod** restores the original scripts and removes the mod while retaining saves and preferences. Both actions work offline. Interrupted changes are recovered on the next run. Unrecognized or externally changed files are preserved instead of overwritten. If access is denied for a protected game folder, rerun the installer as administrator.

Keep the game's .wendyquest-access-recovery folder while the mod is installed. Steam file verification can replace patched scripts; rerun the installer afterward if needed.

### Manual or offline installation

1. Download [WendyQuestAccess-1.0.0-manual.zip](https://github.com/bladestorm360/WendyQuestAccess/releases/download/v1.0.0/WendyQuestAccess-1.0.0-manual.zip).
2. Use **Extract All** to unpack it into a folder outside the game folder. Keep all extracted files together, including the payload ZIP.
3. Save and close Wendy Quest. Run **Install.cmd** from the extracted folder.
4. At the prompt, enter the full folder containing **WendyQuest.exe**, then press Enter. Steam's **Browse local files** can locate it. Keep the command window open until installation completes.
5. Start NVDA and launch the game normally through Steam. Use **NVDA+Space bar** to select focus mode.

The included command files verify the game, apply required patches, generate navigation data locally and preserve recovery files. No connection is needed during these operations. This installs the version bundled in the ZIP; download a newer manual ZIP and repeat these steps to update. Saves and preferences are retained.

Keep the extracted folder for **Verify.cmd** to check installed files or **Remove.cmd** to restore the original scripts. Both ask for the same game folder and work offline. If access is denied, run the command file as administrator. Keep the game's .wendyquest-access-recovery folder until the mod is removed.

## Keys

The game window must have focus, and NVDA must be in focus mode. These are the default bindings. F8, Help lists the current controls, including any changes you have made.

### Remapping mod controls

Open **F8**, then **Keyboard bindings** or **Controller bindings**. Select a command and enter its new binding. Navigation bindings have separate entries for each layout. **Escape** cancels capture; **Delete** unassigns a command where allowed. Conflicting or native game bindings are rejected. Reset options restore defaults. Controller mod mode is separate from normal game controls; there is no keyboard mod mode.

### Game

- **Arrows or W/A/S/D:** move or change the native selection.
- **Enter or Space:** confirm or interact.
- **Escape:** cancel or open the game menu, depending on the current screen.

### Mod reading and review

- **F8:** open mod settings; close them when already open.
- **R:** repeat the current dialogue or recent battle feedback.
- **I:** read details for the current selection or screen. On the field, read the visible quest tracker; during dialogue, describe the speaker or displayed item icon. Supported maps and information panels also use this key.
- **Shift+I:** describe the active fighter or companion in battle.
- **H:** read current visible vitals and meters in supported field, menu and battle screens.
- **G:** read displayed gold in pause and shop screens.
- **Shift+Up / Shift+Down:** previous / next review line where review is available.
- **Shift+Left / Shift+Right:** first / last review line.

### Mod navigation

Choose **Letters** or **Brackets and backslash** under F8, Navigation. Letters is the default; only the selected layout is active.

| Action | Letters | Brackets and backslash |
| --- | --- | --- |
| Previous destination | J | [ |
| Next destination | L | ] |
| Previous category | Shift+J | Shift+[ |
| Next category | Shift+L | Shift+] |
| Read selected destination | K | P |
| Request directions; start walking when autowalk is enabled | P | Backslash |
| Change destination filter | Shift+P | Shift+Backslash |

- **M:** read the current map name.
- **Shift+M:** describe the current map.
- **Ctrl+Backslash:** toggle autowalk.
- **Shift+B:** toggle the navigation beacon.
- **Shift+H:** toggle wall tones.
- **Shift+V:** stop active navigation.
- **Shift+G:** start or review supported puzzle guidance.
- **Ctrl+G:** stop puzzle guidance.

Autowalk is off initially. Manual movement stops it. Bookmarks and route readout options are under F8, Navigation. Full route readout and Automatically speak next leg of route start off; directions are otherwise read in short chunks. These options are independent of autowalk.

### Mod settings and audio

- **Up/Down or Left/Right:** move between settings controls.
- **Tab / Shift+Tab:** next / previous control.
- **Enter or Space:** activate a button or toggle.
- **Escape:** return to the parent menu, or close from the main menu.
- **F8:** close settings directly.

Speech, navigation, battle assistance, sound previews and individual audio levels are adjustable in F8. Some settings appear only where relevant. HRTF spatial audio and stereo playback are supported. Speech and mod sounds have independent switches.

Enable optional **Cutscene descriptions** under Audio. Under **Speech, Visual description voice**, choose recorded speech or NVDA. Recorded speed and volume are adjustable; NVDA uses its own voice settings. Following automatic speech queues behind descriptions. Recorded descriptions continue across visual fades and pause during loading.

Battle timing assistance starts on for new profiles. Automatic perfect timing, autowalk, visual descriptions, Autodetail, menu indexing and automatic navigation sounds start off. Updates retain existing settings.

### Game controller

Normal game controls remain available outside controller mod mode. Button names below use Xbox labels; the mod also displays PlayStation and Nintendo labels where supported.

- **Right stick left/right:** previous / next destination on the field.
- **Right stick up/down:** previous / next category on the field.
- **LT/L2:** request directions outside mod mode.
- **View/Share/Create:** press and release to enter mod mode; press again to cancel it. A mod-mode command normally leaves that mode after use.
- **Both stick clicks together:** toggle controller support for recovery.

### Mod controller

After entering mod mode:

| Context | Button | Action |
| --- | --- | --- |
| Field or supported menus/battle screens | Menu/Options | Open mod settings |
| Field | A | Read selected destination |
| Field | X | Read visible vitals |
| Field | Y | Read quest details |
| Field | D-pad up/down | Previous / next quest line |
| Field | D-pad left/right | First / last quest line |
| Field | LB | Start or review supported puzzle guidance |
| Field or dialogue | RB | Stop puzzle guidance |
| Field | LT | Toggle navigation beacon |
| Field | Right stick right | Toggle wall sounds |
| Field | Right stick left | Stop active navigation |
| Dialogue | A | Repeat the current dialogue |
| Supported menus, battle targets and information panels | A | Read details |
| Supported menus, battle and target screens | X | Read visible vitals |
| Battle | Y | Read recent battle results |
| Supported review screens | D-pad up/down | Previous / next review line |
| Supported review screens | D-pad left/right | First / last review line |

In mod settings, use **D-pad up/down** to move, **A** to activate and **B** to go back. To use controller speaker details in dialogue, remap or unassign Repeat so that Details has its own button. Binding labels adapt to the controller family. The current context and available information determine which commands are active.

## Credits

Original accessibility implementation by **bladestorm360**. Wendy Quest and its game content belong to their respective owners. Game scripts, artwork, runtime files, saves and generated map data are not distributed with the mod.

Navigation samples come from the author's FFPR Core mod. PRISM, SDL3 and OpenAL Soft are included with their required licenses, source and HRTF notices. Keep **ThirdPartyNotices.txt**, LICENSES and audio-deps notices with the installed mod.

Source and downloads: [WendyQuestAccess on GitHub](https://github.com/bladestorm360/WendyQuestAccess). Developer instructions are in [docs/release.md](docs/release.md).
