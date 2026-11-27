# Online installer ownership

The reusable .NET4.8 x64 shell follows the author's FFX stable-release contract while retaining Wendy Quest's existing local native utility and durable transaction engine. No game is launched. Setup1.0.0 and the mod version are tracked independently; the corrected current mod version is1.0.0. This document covers installer changes only; gameplay systems remain Closed.

## Acquisition and current-install decision

installer/GitHubUpdates.cs requests the public repository's latest stable metadata without credentials. It accepts only the exact versioned payload asset at the expected owner/repository/tag, uploaded state,64MB size ceiling and GitHub SHA-256 digest. HTTPS/TLS1.2, no cookies, a35-second overall deadline,10-second operation deadlines,1MB metadata cap and two narrowly allowed GitHub asset redirects bound acquisition. HTTP errors leave installation intact. The installer does not fetch a separate README when current.

installer/InstalledRelease.cs checks the root WendyQuestAccess-release.json receipt, equal stable version/archive digest, unchanged raw recovery-plan digest and every declared original/native/payload/geometry hash. A newer installed version refuses downgrade. Any pending transaction bypasses the fast path so the normal recovery engine can run. Healthy current state returns before creating a work folder or calling Fetch. This prevents downloading unchanged payloads, rather than just downloading and discarding them. File reads and network work run in the GUI's BackgroundWorker, with focusable named progress/status fields.

The receipt records schema, mod version, source revision, archive SHA and actual installed plan SHA. It lives outside the native recovery directory and outside its own payload inventory, avoiding recursive hashes and preserving the canonical Python recovery schema. A later developer deploy changes the plan and invalidates an old current receipt. Settings/saves are never used as version records.

## Package and offline controls

installer/ReleasePackage.cs verifies the whole archive first, then its exact file inventory and inner hashes. Count128, individual32MB, total64MB, manifest256KB and path240-character bounds apply before extraction. Case-colliding duplicates, absolute/traversal/backslash/device paths, ambiguous entries and unexpected destinations fail. Only authored tools and the plugin/service payload are accepted. Runtime pins and original stock fingerprints must match the setup's compatibility baseline; minimumSetup must permit the current setup. Future compatible releases may alter owned files while retaining this original-game contract.

The downloaded ReadMe.txt is derived from the repository README at the release source revision. It and notices are managed payload files. The ReadMe button uses the installed guide or the small embedded fallback when nothing is installed. Offline Verify/Remove extract only the embedded engine and native utility; no metadata lookup, payload fetch or online runtime dependency is involved.

The utility executes only authored engine/baker code against hash-pinned, read-leased game Node DLLs and a copied snapshot in a fresh GUID work directory. NODE_OPTIONS/NODE_PATH are removed. It never loads game scripts as executable code or starts WendyQuest.exe. Native game detection, Steam build checks, launcher exclusivity, reparse protection and utility resource budgets remain in installer/Setup.cs and native-runtime-host.cpp.

## Mutation and recovery

installer/engine.cjs validates original inputs and existing ownership before generating geometry or patch output. Canonical original scripts remain backed up locally. Unknown/changed files are preserved. A staged, flushed journal and verified backups precede mutation; plugin registration stays inactive until all files are written and verified. The installed-release receipt joins that same transaction. Both ordinary failure and a later run after abrupt process exit restore the prior state, including that receipt. Uninstall restores originals and removes only recognized files/receipt, retaining saves/preferences. No timed termination interrupts mutation. Only the shell's own freshly generated GUID work directory is recursively cleaned.

## Verification and extension

tests/online-installer.cs tests real parsing, archive validation and current-file integrity with synthetic authored bytes. tests/online-installer-harness.cs injects only a fixture release source, compiling into a separate test executable; production has no arbitrary URL/package bypass. The real shell/leases/extraction/helper/engine are exercised on an external local mirror by tests/public-installer.test.py. The final standalone executable supplies offline verify/remove/accessibility and damaged-control rejection checks. Actual public endpoint installation is a separate final release check.

To extend the updater, retain the no-fetch fast path, exact repository/asset trust boundary, offline controls and same-transaction receipt. Update minimumSetup only when a verified contract requires a newer shell. Never add original game bodies or locally generated map geometry to an archive. Record matching-source checks and gameplay limits in the ordered release checkpoint; physical game responsiveness is not inferred from fixture timing.

## Platform references

Checked November27: [GitHub release asset metadata, SHA-256 and public downloads](https://docs.github.com/en/rest/releases/assets) and [Microsoft signing and reputation limits](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options). The receipt/archive checks provide integrity; they do not claim a trusted publisher signature or universal scanner acceptance.

November27 completion: public tag a143156/v0.5.0 and setup1.0.0 pass the full synthetic, native mirror, actual anonymous endpoint and local install/current/verify checks. The optional progress-file observer tolerates a concurrent write collision; it never abandons the child transaction for missing status text. See the [public release record](release.md#v05-verified-public-release) and [deployment evidence](deployment.md#november27-public-github-installer-release).

The owner corrected the public label to V1.0 without changing installer logic. The refreshed setup and the prior reusable setup both recognize the actual installed1.0.0 as current with no package fetch or managed-file writes. The superseded0.5 asset set/private ZIP are removed; [current release](release.md#v10-corrected-public-release).


## Manual/offline supplement

The V1.0 manual supplement ships an immutable copy of the original published payload ZIP, a console host and Install/Verify/Remove command files with the current canonical guide/notices/checksums. Users extract outside the game folder and enter its path; no separate runtime/tool installation or network is needed. installer/Manual.cs injects BundledRelease into the exact existing Setup.Run validation, closed-game/runtime leases, archive validation and durable journal. The console translates acquisition-only progress wording; online installer behavior stays unchanged. Ctrl+C requests wait for completion rather than abandoning a live mutation. No game is launched.

The console embeds the original release compatibility manifest, two-file offline controls and a supplement descriptor pinning exact archive name/size/SHA. The adjacent payload is bounded/read-leased and verified before extraction. A missing/tampered archive fails before mutation; healthy current state and offline Verify/Remove need no archive read. Its installed receipt uses the original public payload identity, so existing online installers recognize manual installations and vice versa. The supplement itself records its separate build-source commit. Manual installation applies the bundled version, never queries GitHub, and refuses a downgrade.

The command files resolve their executable relative to their own folder, preserve the result code and accept an optional quoted game-folder argument or interactive prompt. They keep status available for a screen reader after completion. tests/manual-installer.test.py uses real stock input, command files, Unicode/ampersand paths, private sentinels and actual helper/engine; no test game execution. Existing engine rollback/runtime evidence is reused by exact hash. tools/package-manual.py builds only the console/supplement from a pinned published archive through the enforced runner; future online builds explicitly select Setup's entry point because both console and GUI sources share the assembly.

The frozen original setup/payload remain unchanged. Adding a manual supplement and refreshing standalone release ReadMe/checksums are owner-authorized documentation/distribution changes. The manual ZIP and repository/release guide contain current manual instructions; the original automatic payload retains its matching original bundled guide. Update guidance uses a newly extracted manual package for each release.
