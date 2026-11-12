# WendyQuest project memory

Reviewed November 11, 2026. Scope: feasibility and offline investigation. No mod is implemented, installed, or gameplay confirmed.

- [Feasibility, recommendation and work estimates](docs/feasibility.md)
- [Exact installed build, loader, lifecycle, input and offline evidence](docs/engine-evidence.md)
- [Puzzle and secret access audit](docs/puzzles-and-secrets.md) (contains mechanic and location spoilers)
- [Single scope ledger, feature register and completion gates](docs/feature-checkpoint.md)

Steam App 3339970, installed build 26578620, `D:/Games/SteamLibrary/steamapps/common/Wendy Quest`. Readable RPG Maker MZ 1.8.0 data and stock JavaScript in a loose `package.nw`; game-specific plugins use string-table obfuscation. Prefer a last-entry MZ plugin and a separate speech/audio service. Windows x64 NW.js reports 0.48.4 on the launcher and primary runtime. `VERSION.dll` is a static proxy candidate only, with no verified route into the game's renderer. Salt Caverns' crystal sequence and the optional secret cave's stealth rooms have confirmed complex mechanics. Follow the audit for the Cauldron classification and remaining reachability questions.

Git checkpoint destination: [private WendyQuestAccess repository](https://github.com/bladestorm360/WendyQuestAccess), `origin/main`. The authenticated account `bladestorm360` owns it and has ADMIN access; GitHub reported PRIVATE visibility. This repository is for original mod planning and implementation records. No public repository or release is authorized.
