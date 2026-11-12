"""Prepare, verify and reversibly install the pinned Wendy Quest Steam build."""
import argparse
from contextlib import contextmanager
import ctypes
from ctypes import wintypes
import hashlib
import json
import msvcrt
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile

from registration import REGISTRY_REL, TRANSFORMS, verify_dependencies


ROOT = Path(__file__).resolve().parents[1]
STEAM = Path('C:/Program Files (x86)/Steam/steamapps')
GAME = STEAM / 'common/Wendy Quest'
WORK = Path('C:/Games/Dev/WendyQuestAccess-analysis')
PAYLOAD = ROOT / '.build/payload'
APP = '3339970'
BUILD = '26578620'
PACKAGE = Path('package.nw')
EXE = 'WendyQuest.exe'
PLUGIN = Path('js/plugins/WendyQuestAccess.js')
SERVICE = Path('wendyquest-access')
GEOMETRY = Path('wendyquest-access-geometry')
RECOVERY = Path('.wendyquest-access-recovery')
PLAN = 'plan.json'
REQUIRED_PAYLOAD = {PLUGIN.as_posix()} | {
    (SERVICE / name).as_posix() for name in (
        'WendyQuestSpeech.exe', 'prism.dll', 'speech-worker.cjs', 'speech-text.cjs', 'dialogue-icons.cjs',
        'WendyQuestAudio.node', 'audio-worker.cjs', 'audio-deps/SDL3.dll', 'audio-deps/soft_oal.dll',
        'route-worker.cjs', 'geometry.cjs', 'routes.cjs', 'walking-catalog.cjs', 'transfer-gates.cjs',
        'puzzles/crossing.cjs', 'puzzles/motion-world.cjs', 'puzzles/patrol-motion.cjs',
    )
}
HASH = re.compile(r'[0-9a-f]{64}')
MIB = 1024 * 1024
PINNED = {
    Path(EXE): 'd0c8877ffec0f8e0c12d0f8f84031e720f60e6fb7c61ad7f0d851aaeae4e93a0',
    PACKAGE / 'package.json': '36cda7d6953ece091002940373d4cd8c28338279247c28ae47879d347427ff12',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check_path(path):
    """Reject junctions, symlinks and other redirecting components."""
    if not path.is_absolute() or path.drive.casefold() != 'c:' or '..' in path.parts:
        raise ValueError(f'Expected a direct C: path: {path}')
    for entry in (*reversed(path.parents), path):
        try:
            info = entry.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError(f'Redirected path is unsupported: {entry}')
    return path


def relative_path(value):
    relative = PurePosixPath(value)
    if not relative.parts or relative.as_posix() != value or relative.is_absolute() or any(
        part in ('.', '..') or part.endswith(('.', ' ')) or not re.fullmatch(r'[A-Za-z0-9._ -]+', part)
        for part in relative.parts
    ):
        raise ValueError(f'Unsafe manifest path: {value}')
    return Path(*relative.parts)


def read(path, limit):
    info = check_path(path).stat()
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= limit:
        raise ValueError(f'Unexpected file type or size: {path}')
    with path.open('rb') as source:
        data = source.read(limit + 1)
    if len(data) != info.st_size:
        raise ValueError(f'File changed while reading: {path}')
    return data


def file_hash(path, limit=16 * MIB):
    return digest(read(path, limit))


def hash_if_present(path, limit=16 * MIB):
    try:
        return file_hash(path, limit)
    except FileNotFoundError:
        return None


def inventory(root):
    files = {}
    if not check_path(root).exists():
        return files

    def fail(error):
        raise error

    for directory, children, names in os.walk(root, onerror=fail):
        base = Path(directory)
        for child in children:
            check_path(base / child)
        for name in names:
            file = base / name
            key = file.relative_to(root).as_posix()
            relative_path(key)
            files[key] = file_hash(file)
            if len(files) > 512:
                raise ValueError(f'Unexpected number of staged files in {root}')
    return files


def manifest_path(game):
    return game.parent.parent / f'appmanifest_{APP}.acf'


def verify_game(game, launcher_hash=None):
    check_path(game)
    manifest = read(manifest_path(game), 64 * 1024).decode('utf-8-sig')
    fields = {'appid': APP, 'buildid': BUILD, 'installdir': game.name, 'StateFlags': '4'}
    for name, value in fields.items():
        if not re.search(rf'(?im)^\s*"{name}"\s+"{re.escape(value)}"\s*$', manifest):
            raise ValueError(f'Steam must report an idle, installed build {BUILD} for {game.name}')
    for relative, expected in PINNED.items():
        actual = launcher_hash if relative == Path(EXE) and launcher_hash is not None else file_hash(game / relative, 4 * MIB)
        if actual != expected:
            raise ValueError(f'Unsupported installed game file: {relative}')
    verify_dependencies(lambda relative, limit: read(game / relative, limit))


def game_scripts(source, check_syntax=False):
    originals = {}
    patched = {}
    for relative, transform in TRANSFORMS.items():
        stock = read(source / relative, MIB)
        candidate = transform(stock)
        if check_syntax:
            subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        originals[relative] = stock
        patched[relative] = candidate
    return originals, patched


def verify_geometry(game, geometry):
    contents = inventory(geometry)
    manifest = json.loads(read(geometry / 'manifest.json', 128 * 1024))
    maps = manifest.get('maps', {})
    if manifest.get('build') != BUILD or len(maps) != 239 or any(not re.fullmatch(r'[1-9]\d{0,2}', key) for key in maps):
        raise ValueError('Unsupported geometry manifest')
    data = game / PACKAGE / 'data'
    for key, filename in (('tilesets', 'Tilesets.json'), ('commonEvents', 'CommonEvents.json'), ('mapInfos', 'MapInfos.json')):
        if file_hash(data / filename, 2 * MIB) != manifest.get(key):
            raise ValueError(f'Geometry input changed: {filename}')
    expected = {'manifest.json': contents.get('manifest.json')}
    for number, entry in maps.items():
        filename = f'Map{int(number):03}.json'
        if file_hash(data / filename, 2 * MIB) != entry.get('input'):
            raise ValueError(f'Geometry input changed: {filename}')
        expected[f'{number}.wqg'] = entry.get('geometry')
    if contents != expected:
        raise ValueError('Local geometry files differ from their manifest')
    return contents


def prepare(game, stage, payload=PAYLOAD):
    verify_game(game)
    originals, patched = game_scripts(game, check_syntax=True)
    files = inventory(payload)
    if not REQUIRED_PAYLOAD <= files.keys() or not all(
        Path(name) == PLUGIN or Path(name).parts[0] == SERVICE.name for name in files
    ):
        raise ValueError('Build the complete development payload before preparing an installation')
    check_path(stage).mkdir()
    geometry = stage / 'geometry'
    subprocess.run(['node', str(ROOT / 'tools/bake-world.cjs'), str(game), str(geometry)], check=True, timeout=60)
    derived = verify_geometry(game, geometry)
    plan = {
        'build': BUILD,
        'stock': {path.as_posix(): digest(data) for path, data in originals.items()},
        'patched': {path.as_posix(): digest(data) for path, data in patched.items()},
        'payload': files,
        'geometry': derived,
    }
    data = json.dumps(plan, sort_keys=True, indent=2).encode('utf-8') + b'\n'
    (stage / PLAN).write_bytes(data)
    return digest(data)


def validate_plan(data):
    plan = json.loads(data)
    if plan.get('build') != BUILD or set(plan) != {'build', 'stock', 'patched', 'payload', 'geometry'}:
        raise ValueError('Unsupported installation record')
    native = {path.as_posix() for path in TRANSFORMS}
    if set(plan['stock']) != native or set(plan['patched']) != native:
        raise ValueError('The installation record has an unexpected producer set')
    for category in ('stock', 'patched', 'payload', 'geometry'):
        values = plan[category]
        if not values or len(values) > 512:
            raise ValueError('The installation record has an unexpected file count')
        for name, value in values.items():
            relative_path(name)
            if not isinstance(value, str) or not HASH.fullmatch(value):
                raise ValueError(f'Invalid file hash: {name}')
    if not REQUIRED_PAYLOAD <= plan['payload'].keys() or any(
        Path(name) != PLUGIN and Path(name).parts[0] != SERVICE.name for name in plan['payload']
    ):
        raise ValueError('Unexpected payload destination')
    if len(plan['geometry']) != 240 or 'manifest.json' not in plan['geometry'] or any(
        name != 'manifest.json' and not re.fullmatch(r'[1-9]\d{0,2}\.wqg', name) for name in plan['geometry']
    ):
        raise ValueError('Unexpected geometry destination')
    return plan


def atomic_write(path, data):
    check_path(path.parent).mkdir(parents=True, exist_ok=True)
    check_path(path)
    fd, name = tempfile.mkstemp(prefix='.wendyquest-access-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def match_scripts(plan, originals, patched=None):
    if {path.as_posix(): digest(data) for path, data in originals.items()} != plan['stock'] or (
        patched is not None and {path.as_posix(): digest(data) for path, data in patched.items()} != plan['patched']
    ):
        raise ValueError('Native producer fingerprints changed')


def owned_files(plan):
    return {
        **{PACKAGE / relative_path(name): expected for name, expected in plan['payload'].items()},
        **{PACKAGE / GEOMETRY / relative_path(name): expected for name, expected in plan['geometry'].items()},
    }


def inspect(game, plan):
    native = {}
    for path in TRANSFORMS:
        actual = file_hash(game / path, MIB)
        name = path.as_posix()
        if actual == plan['stock'][name]:
            native[path] = False
        elif actual == plan['patched'][name]:
            native[path] = True
        else:
            raise ValueError(f'Unknown native changes. Use Steam verification before trying again: {path}')
    for tree in (SERVICE, GEOMETRY):
        prefix = (PACKAGE / tree).as_posix() + '/'
        expected = {path.as_posix()[len(prefix):] for path in owned_files(plan) if path.as_posix().startswith(prefix)}
        folder = check_path(game / PACKAGE / tree)
        if folder.exists() and not folder.is_dir():
            raise ValueError(f'Unexpected file in a mod directory position: {folder}')
        if set(inventory(folder)) - expected:
            raise ValueError(f'Unexpected files in the mod directory: {folder}')
    owned = {}
    for path, expected in owned_files(plan).items():
        actual = hash_if_present(game / path)
        if actual is not None and actual != expected:
            raise ValueError(f'An installed mod file changed: {path}')
        owned[path] = actual is not None
    return native, owned


def replace_known(path, data, expected):
    if hash_if_present(path) != expected:
        raise ValueError(f'File changed since verification: {path}')
    atomic_write(path, data)


def save_recovery(game, plan_data, originals):
    recovery = check_path(game / RECOVERY)
    # Publish the recovery directory only after its complete original set exists.
    temp = Path(tempfile.mkdtemp(prefix='.wendyquest-access-recovery-', dir=game))
    try:
        for path, data in originals.items():
            atomic_write(temp / path, data)
        atomic_write(temp / PLAN, plan_data)
        temp.rename(recovery)
    finally:
        if temp.exists():
            remove_recovery(temp)


def remove_recovery(recovery):
    check_path(recovery)
    for path in TRANSFORMS:
        check_path(recovery / path).unlink(missing_ok=True)
    check_path(recovery / PLAN).unlink(missing_ok=True)
    for path in (PACKAGE / 'js/plugins', PACKAGE / 'js', PACKAGE):
        folder = check_path(recovery / path)
        if folder.exists():
            folder.rmdir()
    recovery.rmdir()


def read_recovery(game):
    root = check_path(game / RECOVERY)
    plan_data = read(root / PLAN, 128 * 1024)
    plan = validate_plan(plan_data)
    if set(inventory(root)) != {PLAN, *(path.as_posix() for path in TRANSFORMS)}:
        raise ValueError('The recovery directory has an unexpected file set')
    originals, _ = game_scripts(root)
    match_scripts(plan, originals)
    return plan, originals, plan_data


def restore(game, plan, originals):
    native, owned = inspect(game, plan)
    order = [REGISTRY_REL, *(path for path in TRANSFORMS if path != REGISTRY_REL)]
    for path in order:
        if native[path]:
            replace_known(game / path, originals[path], plan['patched'][path.as_posix()])
    expected = owned_files(plan)
    directories = set()
    for path, installed in owned.items():
        target = check_path(game / path)
        if installed:
            if file_hash(target) != expected[path]:
                raise ValueError(f'File changed during removal: {path}')
            target.unlink()
        parent = path.parent
        while parent != PACKAGE and parent.parts[1] in (SERVICE.name, GEOMETRY.name):
            directories.add(game / parent)
            parent = parent.parent
    for folder in sorted(directories, key=lambda path: len(path.parts), reverse=True):
        if check_path(folder).exists():
            folder.rmdir()
    stock, remaining = inspect(game, plan)
    if any(stock.values()) or any(remaining.values()):
        raise ValueError('Restoration could not be verified')
    remove_recovery(game / RECOVERY)


def install(game, stage, expected, payload=PAYLOAD, launcher_hash=None):
    verify_game(game, launcher_hash)
    plan_data = read(stage / PLAN, 128 * 1024)
    if digest(plan_data) != expected:
        raise ValueError('The candidate does not match the verified plan hash')
    plan = validate_plan(plan_data)
    geometry = stage / 'geometry'
    if inventory(payload) != plan['payload'] or verify_geometry(game, geometry) != plan['geometry']:
        raise ValueError('The candidate changed after preparation')
    recovery = check_path(game / RECOVERY)
    if recovery.exists():
        _, originals, saved = read_recovery(game)
        if saved != plan_data:
            raise ValueError('Remove the previous mod version before applying this candidate')
        patched = {path: transform(originals[path]) for path, transform in TRANSFORMS.items()}
    else:
        originals, patched = game_scripts(game)
        if any(check_path(game / PACKAGE / path).exists() for path in (PLUGIN, SERVICE, GEOMETRY)):
            raise ValueError('An untracked mod file already occupies the installation path')
    match_scripts(plan, originals, patched)
    native, owned = inspect(game, plan)
    if all(native.values()) and all(owned.values()):
        return 'The verified mod is already installed.'
    if not recovery.exists():
        save_recovery(game, plan_data, originals)
    try:
        if native[REGISTRY_REL]:
            replace_known(game / REGISTRY_REL, originals[REGISTRY_REL], plan['patched'][REGISTRY_REL.as_posix()])
            native[REGISTRY_REL] = False
        for category, source, base in (('payload', payload, PACKAGE), ('geometry', geometry, PACKAGE / GEOMETRY)):
            for name, expected_hash in plan[category].items():
                relative = relative_path(name)
                path = base / relative
                if not owned[path]:
                    content = read(source / relative, 16 * MIB)
                    if digest(content) != expected_hash:
                        raise ValueError(f'Candidate file changed: {name}')
                    replace_known(game / path, content, None)
        for path, content in patched.items():
            if not native[path]:
                replace_known(game / path, content, plan['stock'][path.as_posix()])
        verify_game(game, launcher_hash)
        native, owned = inspect(game, plan)
        if not all(native.values()) or not all(owned.values()):
            raise ValueError('The installed payload did not match the prepared candidate')
    except BaseException:
        try:
            restore(game, plan, originals)
        except (OSError, ValueError) as error:
            raise RuntimeError(f'Installation stopped. Recovery files are preserved. {error}') from error
        raise
    return 'Installed and verified Wendy Quest Accessibility. Launch through Steam when ready.'


@contextmanager
def closed_game(game):
    """Hold the manifest stable and deny new opens of the game executable."""
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                   wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handles = []
    try:
        # The manifest lease permits readers only. The exclusive launcher
        # handle denies new opens and supplies the fingerprint directly.
        for path, sharing in ((manifest_path(game), 1), (game / EXE, 0)):
            handle = kernel.CreateFileW(str(check_path(path)), 0x80000000, sharing, None, 3, 0, None)
            if handle == ctypes.c_void_p(-1).value:
                raise OSError(f'Close Wendy Quest and let Steam finish any update: {path.name}')
            handles.append(handle)
        fd = msvcrt.open_osfhandle(handles[-1], os.O_RDONLY | os.O_BINARY)
        handles.pop()
        with os.fdopen(fd, 'rb') as launcher:
            launcher_hash = digest(launcher.read(4 * MIB + 1))
            tool = Path(os.environ['SystemRoot']) / 'System32/tasklist.exe'
            processes = subprocess.run([str(tool), '/FI', f'IMAGENAME eq {EXE}', '/FO', 'CSV', '/NH'],
                                       check=True, capture_output=True, timeout=10,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            if f'"{EXE}"'.encode('ascii').lower() in processes.stdout.lower():
                raise ValueError('Close Wendy Quest in Steam before changing the installation')
            yield launcher_hash
    finally:
        for handle in reversed(handles):
            kernel.CloseHandle(handle)


def local_candidate(path):
    path = check_path(path.absolute())
    if path.parent != check_path(WORK):
        raise ValueError(f'Use a new candidate folder directly under {WORK}')
    if any((parent / '.git').exists() for parent in (path, *path.parents)):
        raise ValueError('Local geometry must stay outside Git')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    prep = commands.add_parser('prepare', help='verify the local build and bake installation geometry')
    prep.add_argument('candidate', type=Path)
    apply = commands.add_parser('install', help='install a prepared and scanned candidate')
    apply.add_argument('candidate', type=Path)
    apply.add_argument('sha256', help='exact plan hash printed by prepare')
    commands.add_parser('status', help='verify the current local installation')
    commands.add_parser('remove', help='restore the original game files')
    args = parser.parse_args()
    try:
        if args.action == 'prepare':
            if not os.environ.get('CODEX_BUILD_JOB_NAME'):
                raise ValueError('Run prepare through tools/run-build.py to bound the geometry bake')
            stage = local_candidate(args.candidate)
            print('Verified plan SHA-256:', prepare(GAME, stage))
        elif args.action == 'status':
            verify_game(GAME)
            if check_path(GAME / RECOVERY).exists():
                plan, _, _ = read_recovery(GAME)
                native, owned = inspect(GAME, plan)
                print('Installed and verified.' if all(native.values()) and all(owned.values()) else
                      'Partial installation. Reapply the verified candidate or remove it.')
            else:
                game_scripts(GAME)
                if any(check_path(GAME / PACKAGE / path).exists() for path in (PLUGIN, SERVICE, GEOMETRY)):
                    raise ValueError('Mod files exist without a recovery record')
                print('Verified original Steam game. The mod is absent.')
        elif args.action == 'remove':
            with closed_game(GAME) as launcher_hash:
                verify_game(GAME, launcher_hash)
                plan, originals, _ = read_recovery(GAME)
                restore(GAME, plan, originals)
            print('Restored and verified the original game files.')
        else:
            with closed_game(GAME) as launcher_hash:
                print(install(GAME, local_candidate(args.candidate), args.sha256.lower(), launcher_hash=launcher_hash))
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(1, f'Wendy Quest Access: {error}\n')


if __name__ == '__main__':
    main()
