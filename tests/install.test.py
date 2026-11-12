"""Exercise install and recovery against an isolated mirror of the exact build."""
import os
from pathlib import Path
import shutil

import sys
import tempfile
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import install as installer
from registration import DEPENDENCIES, REGISTRY_REL, TRANSFORMS


def expect_error(call, message):
    try:
        call()
    except (OSError, ValueError, RuntimeError) as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f'Expected a rejected operation containing {message}')


def mirror(source, target):
    for relative in {*TRANSFORMS, *DEPENDENCIES, *installer.PINNED}:
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, destination)
    data = installer.PACKAGE / 'data'
    for source_file in (source / data).glob('Map[0-9][0-9][0-9].json'):
        shutil.copyfile(source_file, target / data / source_file.name)
    for name in ('MapInfos.json', 'Tilesets.json'):
        shutil.copyfile(source / data / name, target / data / name)
    shutil.copyfile(installer.manifest_path(source), installer.manifest_path(target))


def verify_fixture(steam, workspace, prepared=None):
    game = workspace / 'steamapps/common/Wendy Quest'
    stage = prepared[0] if prepared else workspace / 'candidate'
    mirror(steam, game)
    save = game / 'package.nw/save/fixture-save'
    save.parent.mkdir()
    save.write_bytes(b'isolated save witness')
    expected = prepared[1] if prepared else installer.prepare(game, stage)
    receipt = (stage / installer.PLAN).read_bytes()
    plan = installer.validate_plan(receipt)
    originals, patched = installer.game_scripts(game)
    assert not (game / installer.RECOVERY).exists()
    assert not any(installer.inspect(game, plan)[0].values())
    expect_error(lambda: installer.install(game, stage, '0' * 64), 'verified plan hash')

    owned = installer.owned_files(plan)
    marker = game / installer.PACKAGE / installer.PLUGIN
    marker.parent.mkdir(exist_ok=True)
    marker.write_bytes(b'unrelated pre-existing script')
    expect_error(lambda: installer.install(game, stage, expected), 'untracked mod file')
    assert marker.read_bytes() == b'unrelated pre-existing script'
    marker.unlink()

    registry = game / REGISTRY_REL
    atomic_write = installer.atomic_write

    def interrupted_after_registry(path, contents):
        atomic_write(path, contents)
        if path == registry and contents == patched[REGISTRY_REL]:
            raise OSError('fixture interruption after activation')

    with patch.object(installer, 'atomic_write', interrupted_after_registry):
        expect_error(lambda: installer.install(game, stage, expected), 'fixture interruption after activation')
    assert registry.read_bytes() == originals[REGISTRY_REL]
    assert not (game / installer.RECOVERY).exists()
    assert not any(installer.inspect(game, plan)[1].values())

    with installer.closed_game(game) as launcher_hash:
        expect_error(lambda: (game / installer.EXE).read_bytes(), 'denied')
        assert installer.install(game, stage, expected, launcher_hash=launcher_hash).startswith('Installed')
    assert all(all(state.values()) for state in installer.inspect(game, plan))
    assert installer.install(game, stage, expected).endswith('already installed.')

    registry.write_bytes(originals[REGISTRY_REL])
    marker.unlink()
    first_hook = next(iter(TRANSFORMS))
    (game / first_hook).write_bytes(originals[first_hook])
    assert installer.install(game, stage, expected).startswith('Installed')
    assert all(all(state.values()) for state in installer.inspect(game, plan))

    (game / first_hook).write_bytes(b'unknown third-party replacement')
    saved, restore_data, _ = installer.read_recovery(game)
    expect_error(lambda: installer.restore(game, saved, restore_data), 'Unknown native changes')
    assert (game / first_hook).read_bytes() == b'unknown third-party replacement'
    assert registry.read_bytes() == patched[REGISTRY_REL]
    (game / first_hook).write_bytes(patched[first_hook])
    installer.restore(game, saved, restore_data)
    assert all((game / path).read_bytes() == contents for path, contents in originals.items())
    assert not any((game / path).exists() for path in owned)
    assert save.read_bytes() == b'isolated save witness'
    assert not (game / installer.RECOVERY).exists()
    print('Verified staging, the launcher lease, interruption rollback, install, reapply, unknown-file protection and removal.')


if __name__ == '__main__':
    if not os.environ.get('CODEX_BUILD_JOB_NAME'):
        raise SystemExit('Use the bounded build runner for installer verification.')
    source = installer.check_path(Path(sys.argv[1]))
    scratch = installer.check_path(Path(sys.argv[2]))
    if any((parent / '.git').exists() for parent in (scratch, *scratch.parents)):
        raise SystemExit('Installer fixture must stay outside Git.')
    with tempfile.TemporaryDirectory(prefix='wendy-install-fixture-', dir=scratch) as folder:
        target = installer.check_path(Path(folder))
        if target.parent != scratch:
            raise SystemExit('Installer fixture escaped its scratch directory.')
        if len(sys.argv) not in (3, 5):
            raise SystemExit('Pass a stock fixture root and scratch root, optionally followed by a candidate and plan hash.')
        prepared = (installer.local_candidate(Path(sys.argv[3])), sys.argv[4]) if len(sys.argv) == 5 else None
        verify_fixture(source, target, prepared)
