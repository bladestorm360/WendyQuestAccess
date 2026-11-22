# Release procedure

This procedure prepares a local release for review. Publishing, uploading artifacts, creating a release tag and changing repository visibility remain separate owner-authorized actions. The repository stays private during the current preparation. Use the owner's selected version; this rehearsal uses **0.0.0-dev**, not a public release number. For a test build, use the suffix **-test-build**, never beta.

The workflow follows Blackmoon Prophecy's canonical README/plain-text guide and accessible standalone installer, and FFPR's frozen source/dependency, exact artifact, scanner and recovery checks. Their project-specific publication and storage rules do not replace Wendy Quest's own permissions or build policy.

## 1. Freeze source and inputs

- Confirm the actual C: checkout, main branch, user-controlled origin and private visibility. Update README.md, affected feature documents and the single feature checkpoint. Commit and push all repository-eligible changes; verify origin/main contains that commit.
- Use the supported English Windows x64 Steam build26578620, App3339970. Retain the canonical original scripts in the installed recovery folder. Keep game scripts, maps, extracted analysis, saves and generated geometry outside Git and the release ZIP.
- Validate dependency hashes through tools/registration.py and tools/build.py. PRISM0.18.3, SDL3.4.4, OpenAL Soft1.25.2, the matching NW0.48.4 archive and FFPR cue hashes are pinned by the existing build. Preserve all upstream license and corresponding-source/HRTF notices.
- New releases use the canonical build.ps1 with VerifySpeechPipe and VerifyAudio. It invokes the shared bounded runner at512MB, one worker, below-normal priority. For a focused gameplay fix, reuse verified unchanged native binaries and rebuild only the bundle/changed payload under the focused-build contract; preserve its source/hash evidence. Never run a second project build tree concurrently.
- Compile installer/native-runtime-host.cpp with the same x64 compiler and static CRT, GS/SDL/CFG/ASLR/NX protections, using the recipe in installer/build-runtime.ps1. That recipe always uses tools/run-build.py. No game launch occurs.

## 2. Complete verification

Run changed producer and integration fixtures against the outside-Git canonical stock fixture. The narration changes require tests/narration.test.cjs and tests/field.test.cjs, plus tests/nw-smoke.py on the pinned standalone NW runtime. Use the shared bounded runner; keep scratch under C:/Games/Dev/WendyQuestAccess-analysis. The NW fixture uses a hidden synthetic application, silent speech/audio and its own profile. It does not launch Wendy Quest. Preserve runtime/gameplay confirmation as a separate status. The old broad dialogue fixture has a documented Salt-guide mirror gap (feature-checkpoint.md, November21); its synthetic solveRoute-only response omits the production solveSaltRoute fallback. Do not claim that whole fixture passes or reopen the closed puzzle design from that known fixture limitation. The production native/worker evidence and current focused narration/runtime checks remain distinct.

Check dependency identities, Windows x64 binaries, required licenses and source organization. The installer must reproduce all16 native transformations and all241 geometry files exactly. Its patch recipes contain original mod additions and references into the player's files, never original game bodies. The map baker contains only original mod modules; it reads the player's own data locally using the game's hash-pinned Node runtime. No external runtimes or downloads are required by players.

## 3. Build the installer ZIP

From a clean committed tree, run tools/package-release.py with --version, --stage and --output. Stage must be a fresh C: analysis directory outside Git; output should be a new versioned ZIP under the ignored dist folder. Example names are WendyQuestAccess-1.0.0.zip and an analysis staging folder ending in release-1.0.0. The tool does not overwrite an existing release, tag, push or publish. The --development switch permits a dirty-tree rehearsal only with a -dev version; those artifacts are not publishable.

The builder generates ReadMe.txt from README.md, checks ASCII compatibility, freezes the source commit, fingerprints the game/runtime/map inputs, writes source-free copy/literal recipes and embeds the package in WendyQuestAccessSetup.exe. Its .NET Framework4.8 x64 compilation uses the bounded runner. The ZIP contains exactly:

- WendyQuestAccessSetup.exe
- ReadMe.txt
- ThirdPartyNotices.txt
- SHA256SUMS.txt

The archive contains no game runtime DLLs, scripts, artwork, map JSON, derived geometry, saves or private logs. The generated release.json and receipt.json in local staging record the version, source commit, expected identities, file counts and archive hash. The executable also carries version/source metadata.

## 4. Rehearse the exact installer

Run tests/public-installer.test.py with the final staging folder and a fresh outside-Git mirror folder under the bounded runner. It uses copies of mutable scripts and hard links for immutable local inputs to avoid duplicate large runtime files. No game is started. Acceptance includes:

- Keyboard-accessible named controls and focusable instructions/status.
- Fresh install and exact file verification; missing-file repair.
- Upgrade from the current installed predecessor and removal back to stock.
- Save/preferences preservation, Unicode/spaced paths and temporary-folder cleanup.
- Rejection/preservation of changed or unknown files.
- Recovery from an injected process termination during an actual update, followed by a successful verification; interrupted pre-mutation staging recovery.

Also verify unsupported runtime/build rejection and the closed-game lease. Do not rely only on successful process exit: compare every installed native, payload, geometry and recovery hash. Keep concise evidence and peak resource receipts. Reuse exact source-matched evidence when only documentation or version metadata changes; repeat affected checks for new implementation or unresolved failures.

## 5. Scan and sign the final bytes

Inspect signing-certificate availability. Sign and timestamp original executables with a valid owner certificate when available, then regenerate checksums and the outer ZIP. Never invent a publisher or add self-signed trust. If signing is unavailable, record NotSigned and the reputation limitation explicitly in the local release evidence; obtain the separate publication decision before distributing.

Use the trusted installed Microsoft Defender scanner on the exact final ZIP, installer executable and extracted payload. Verify all expected hashes before and after scanning. Retain scanner signature/platform/engine/definition versions, scan exit/status, detections and final SHA256 identities. Investigate detections without disabling protection or uploading private artifacts. A clean local scan does not guarantee acceptance by every scanner or Windows reputation service.

## 6. Install locally and close preparation

With Wendy Quest closed, use this exact standalone installer's Install or update action at the established Steam target. The installer holds the Steam manifest stable and denies new launcher opens. Check all resulting files, canonical originals and the unchanged save/config set. Verify the sole optional recovery against the new installation, then retire its old contents. Do not launch the game automatically.

Consolidate the receipt in docs/deployment.md and the single checkpoint. Retain the requested final ZIP and at most one optional build recovery. Remove expanded staging, mirrored game links, test runtimes, recordings, build output and disposable logs. Keep at most20 long-term development logs and the separately retained gameplay captures. Preserve saves/settings, installed files, unique research and required canonical original recovery. Commit/push the closure and verify the remote ref and private visibility again.

## 7. Public release, only when authorized

Choose the real version, remove the preparation-only sentence from README.md, finish owner gameplay checks and repeat the frozen-artifact steps. Review the release notes and supported build, hashes, signature state and known limitations. A later explicit publication request can authorize the relevant visibility change, V<version> tag and artifact upload. This preparation alone authorizes none of them.

## Installer ownership and recovery design

installer/Setup.cs owns the accessible Windows Forms UI, Steam folder detection, exact runtime checks, manifest/launcher leases, embedded-file integrity and temporary-directory lifetime. It runs as the current user and starts only the original installer utility, never the game. The utility's process tree is limited to512MB and25percent CPU, below-normal priority; the Node heap is limited to128MB. These are installer budgets, separate from shared development admission.

installer/engine.cjs owns allowlisted target paths, current/recovery verification, local geometry generation, patch replay and the transaction. It blocks junctions/symlinks and unsupported or externally changed files. Before mutation it records a durable journal and backups; native plugin registration is inactive while files change and is activated last. Hashes are rechecked before replacement and after installation. On failure it restores the previous installation. Interrupted staging never changes game files; interrupted mutation restores from verified backups on the next run. Unknown recovery contents stop cleanup for preservation. Successful operations remove their transaction and temporary data. Uninstall touches only recorded mod-owned files and restores verified originals. Saves and the NW profile are outside the write set.

Changes to patch producers require regeneration of recipes and native checks. Changes to map semantics use the existing baker and route tests, not a separate installer implementation of navigation. Changes to target ownership or transaction order require the full isolated installer rehearsal. Source locators and behavioral explanations belong in documentation; original game source never does.
