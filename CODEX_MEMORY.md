# WendyQuest project memory

Reviewed November 11, 2026. Full mod implementation is active. The title and file selector now have build-matched native producer fixtures. Deployment and gameplay confirmation remain open.

- [Feasibility, recommendation and work estimates](docs/feasibility.md)
- [Exact installed build, loader, lifecycle, input and offline evidence](docs/engine-evidence.md)
- [Puzzle and secret access audit](docs/puzzles-and-secrets.md) (contains mechanic and location spoilers)
- [Single scope ledger, feature register and completion gates](docs/feature-checkpoint.md)
- [Mod architecture, current code and verification](docs/implementation.md)

Steam App 3339970, installed build 26578620, `D:/Games/SteamLibrary/steamapps/common/Wendy Quest`. Readable RPG Maker MZ 1.8.0 data and stock JavaScript in a loose `package.nw`; game-specific plugins use string-table obfuscation. Prefer a last-entry MZ plugin and a separate speech/audio service. Windows x64 NW.js reports 0.48.4 on the launcher and primary runtime. `VERSION.dll` is a static proxy candidate only, with no verified route into the game's renderer. Salt Caverns' crystal sequence and the optional secret cave's stealth rooms have confirmed complex mechanics. Follow the audit for the Cauldron classification and remaining reachability questions.

Git checkpoint destination: [private WendyQuestAccess repository](https://github.com/bladestorm360/WendyQuestAccess), `origin/main`. The authenticated account `bladestorm360` owns it and has ADMIN access; GitHub reported PRIVATE visibility. This repository is for original mod planning and implementation records. No public repository or release is authorized.

November 11 checkpoint: remote `refs/heads/main` was verified at feasibility commit `cf987839896841a4f0e9a1c6ca7aae138e11f877`. The six documents passed link, estimate and installed-file hash checks. Stock loader, tile and event-page fixtures passed within their stated limits; no implementation or gameplay confirmation.

November 11 implementation checkpoint: remote `refs/heads/main` was verified at `10fe45072af7067e980494a862611cdc0e04b4a4`. The bounded Windows build, exact registration candidates, matching NW worker bridge, extracted title acceptance and silent PRISM initialization passed offline. The transport fault fixture and file-menu lifecycle notes extend this checkpoint. Continue at [implementation and verification](docs/implementation.md). The Steam install remains unmodified during this incomplete checkpoint.

The private remote was also verified at `2b6396919f84c1631dc0667f0a0f32631a8f90dc` for the transport fault fixture. The following file-selector work covers both readiness orders, visible slot and detail data, load failure and native deletion with stand-in storage. Continue with the retry draw path, native Options and external speech quiescence in the same active checkpoint.
