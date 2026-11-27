# Online installer ownership

The reusable .NET4.8 x64 shell follows the author's FFX stable-release contract while retaining Wendy Quest's existing local native utility and durable transaction engine. No game is launched. Setup1.0.0 and mod0.5.0 have independent versions. This document covers installer changes only; gameplay systems remain Closed.

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
