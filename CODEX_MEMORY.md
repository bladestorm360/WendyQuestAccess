# WendyQuest project memory

Reviewed November 11, 2026. Full mod implementation is active. The title, file selector, retry, Options, visible map banner and map dialogue have build-matched native producer fixtures. Deployment and gameplay confirmation remain open.

- [Feasibility, recommendation and work estimates](docs/feasibility.md)
- [Exact installed build, loader, lifecycle, input and offline evidence](docs/engine-evidence.md)
- [Puzzle and secret access audit](docs/puzzles-and-secrets.md) (contains mechanic and location spoilers)
- [Single scope ledger, feature register and completion gates](docs/feature-checkpoint.md)
- [Mod architecture, current code and verification](docs/implementation.md)
- [Field routing, collision and native fixture evidence](docs/navigation.md)

Steam App 3339970, installed build 26578620, `D:/Games/SteamLibrary/steamapps/common/Wendy Quest`. Readable RPG Maker MZ 1.8.0 data and stock JavaScript in a loose `package.nw`; game-specific plugins use string-table obfuscation. Prefer a last-entry MZ plugin and a separate speech/audio service. Windows x64 NW.js reports 0.48.4 on the launcher and primary runtime. `VERSION.dll` is a static proxy candidate only, with no verified route into the game's renderer. Salt Caverns' crystal sequence and the optional secret cave's stealth rooms have confirmed complex mechanics. Follow the audit for the Cauldron classification and remaining reachability questions.

Git checkpoint destination: [private WendyQuestAccess repository](https://github.com/bladestorm360/WendyQuestAccess), `origin/main`. The authenticated account `bladestorm360` owns it and has ADMIN access; GitHub reported PRIVATE visibility. This repository is for original mod planning and implementation records. No public repository or release is authorized.

November 11 checkpoint: remote `refs/heads/main` was verified at feasibility commit `cf987839896841a4f0e9a1c6ca7aae138e11f877`. The six documents passed link, estimate and installed-file hash checks. Stock loader, tile and event-page fixtures passed within their stated limits; no implementation or gameplay confirmation.

November 11 implementation checkpoint: remote `refs/heads/main` was verified at `10fe45072af7067e980494a862611cdc0e04b4a4`. The bounded Windows build, exact registration candidates, matching NW worker bridge, extracted title acceptance and silent PRISM initialization passed offline. The transport fault fixture and file-menu lifecycle notes extend this checkpoint. Continue at [implementation and verification](docs/implementation.md). The Steam install remains unmodified during this incomplete checkpoint.

The current-page repeat checkpoint was verified on private `refs/heads/main` at `6f8a4ea2372611f9da2f124abeb844d379238875`, the native input evidence at `b2814e2f31b3fe54b37234cad13082079fa171fc`, keyboard settings at `384070212ab7561dfe8ab799957fff8dbd5f1d03`, [controller mode and settings](docs/implementation.md#controller-mode-and-settings) at `ad363e6b4a8b12e4e22de7f7b89f080e094472e6`, the route bake at `e6fcb653668f5fd3eb0d792298ddd426d6a7260f`, and [spoken field routing](docs/navigation.md) at `95506749c27e1667b4e795873f1ac64ffae58a70`. The next navigation checkpoint connects categories, saved layouts, remappable controller field actions and in-field settings. Continue with native puzzle progress and hazard producers, reachability filtering and vehicle transitions. Steam deployment remains pending.

Private `refs/heads/main` contained `f888790bb4af6b392e393637245107817e163108` for category and remappable field controls. [Salt Caverns guidance](docs/puzzles-and-secrets.md#salt-caverns-guide) follows it. Continue with the secret cave's native encounter and checkpoint producers. The guide's observed-state scope, test procedures and remaining gameplay scenarios are in the puzzle audit.

The private remote was verified at `2b6396919f84c1631dc0667f0a0f32631a8f90dc` for the transport fault fixture, `84f6dd9e0f5fad0d8f3f6f30b4eecefcbf08b34b` for the file selector, `9ca909d9a5fe317658692f14f172655266b35924` for retry and Options, `ded04adeecdd0516e71385e545d491ea5b10ba8c` for fullscreen, `a379767bdb6cb2b96c89be8ab00479306fb30287` for helper admission, `cacff56669a5c7e2d0f1374b5c80a71baeec9ab4` for native map entry, `8b050309a3fd39e8f6c15ef778d5ee48e8354959` for map banners, `16976c5655ac694ef4c0a84ba60781b54695fbfb` for map dialogue and choices, and `72738a536aaf82955da33c916a2d9ae9c30f9a76` for number entry, automatic-close text and troop messages. [Plain R](docs/implementation.md#repeat-the-displayed-page) now reads the displayed page in the keyboard and NW.js fixtures. The [provider gap](docs/implementation.md#speech-service), combat action producers and full navigation admission remain open.
