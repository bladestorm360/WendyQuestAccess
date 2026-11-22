"""Source-free native patch recipes and the existing local map baker bundle."""
from pathlib import Path
import base64
import hashlib
import json
import re
import posixpath


class OriginBytes(bytes):
    """Carry exact source ranges through the existing byte-insertion transforms.

    Bytes sliced from the owner's game stay copy instructions. Only authored
    additions become literals; the package never contains original game bodies.
    """
    def __new__(cls, data, parts):
        value = super().__new__(cls, data)
        value.parts = parts
        return value

    def __getitem__(self, key):
        data = super().__getitem__(key)
        if not isinstance(key, slice):
            return data
        start, stop, step = key.indices(len(self))
        if step != 1:
            raise ValueError('Native recipe cannot stride source bytes')
        parts, cursor = [], 0
        for kind, source, length in self.parts:
            lo, hi = max(start, cursor), min(stop, cursor + length)
            if lo < hi:
                offset, count = lo - cursor, hi - lo
                parts.append((kind, source + offset if kind == 'copy' else source[offset:offset + count], count))
            cursor += length
        return OriginBytes(data, parts)

    @staticmethod
    def parts_for(value):
        return value.parts if isinstance(value, OriginBytes) else [('literal', bytes(value), len(value))]

    def __add__(self, other):
        return OriginBytes(bytes(self) + bytes(other), self.parts + self.parts_for(other))

    def __radd__(self, other):
        return OriginBytes(bytes(other) + bytes(self), self.parts_for(other) + self.parts)


def native_recipe(source, transform, registry=False):
    result = transform(OriginBytes(source, [('copy', 0, len(source))]))
    if registry:
        # The registry transform parses JSON. It adds only the mod's own
        # metadata at one position, so retain the untouched prefix/suffix.
        start = 0
        while start < min(len(source), len(result)) and source[start] == result[start]:
            start += 1
        tail = 0
        while tail < len(source) - start and source[-tail - 1] == result[-tail - 1]:
            tail += 1
        if start + tail != len(source):
            raise ValueError('Registry recipe must be a single authored insertion')
        parts = [('copy', 0, start), ('literal', result[start:len(result) - tail], len(result) - len(source)),
                 ('copy', start, tail)]
    else:
        if not isinstance(result, OriginBytes):
            raise ValueError('A native transform lost source provenance')
        parts = result.parts
    merged = []
    for kind, offset, length in parts:
        if not length:
            continue
        if merged and merged[-1][0] == kind and (kind == 'literal' or merged[-1][1] + merged[-1][2] == offset):
            prior = merged.pop()
            merged.append((kind, prior[1] + offset if kind == 'literal' else prior[1], prior[2] + length))
        else:
            merged.append((kind, offset, length))
    ops = [{'kind': kind, 'offset': offset, 'length': length} if kind == 'copy' else
           {'kind': kind, 'data': base64.b64encode(offset).decode('ascii'), 'length': length}
           for kind, offset, length in merged]
    replay = b''.join(source[o['offset']:o['offset'] + o['length']] if o['kind'] == 'copy' else
                      base64.b64decode(o['data']) for o in ops)
    if replay != bytes(result) or len(ops) > 2048:
        raise ValueError('Native copy/literal recipe did not reproduce the verified transform')
    return {'source': hashlib.sha256(source).hexdigest(), 'sourceLength': len(source),
            'result': hashlib.sha256(result).hexdigest(), 'resultLength': len(result), 'operations': ops}


def baker_bundle(root):
    """Bundle original mod modules only; installed game data is read locally."""
    root = Path(root).resolve()
    entry = 'tools/bake-world.cjs'
    modules = {}
    expression = re.compile(r"require\(['\"](\.[^'\"]+)['\"]\)")
    def collect(key):
        if key in modules:
            return
        file = (root / key).resolve()
        if not file.is_relative_to(root) or file.suffix not in ['.js', '.cjs']:
            raise ValueError('Unexpected baker module')
        body = file.read_text(encoding='utf-8-sig')
        modules[key] = body
        if len(modules) > 64:
            raise ValueError('Baker module count exceeds its fixed budget')
        for relative in expression.findall(body):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(key), relative))
            if not Path(target).suffix:
                target += '.js'
            collect(target)
    collect(entry)
    definitions = ',\n'.join(json.dumps(key) + ':function(module,exports,require,__dirname,__filename){\n' + body + '\n}'
                              for key, body in sorted(modules.items()))
    script = """'use strict';
const path=require('path'), nativeRequire=require;
const definitions={DEFINITIONS};
const cache=Object.create(null);
function load(key){
 if(cache[key])return cache[key].exports;
 const module=cache[key]={exports:{},filename:path.join(__dirname,'modules',key)};
 function local(value){
  if(!value.startsWith('.')){if(!['fs','path','crypto'].includes(value))throw Error('Unexpected baker dependency');return nativeRequire(value);}
  let resolved=path.posix.normalize(path.posix.join(path.posix.dirname(key),value));
  if(!path.posix.extname(resolved))resolved+='.js';
  if(!definitions[resolved])throw Error('Missing baker module');return load(resolved);
 }
 definitions[key](module,module.exports,local,path.dirname(module.filename),module.filename);
 return module.exports;
}
const result=load('tools/bake-world.cjs').bake(process.argv[2],process.argv[3]);
console.log(JSON.stringify(result));
""".replace('DEFINITIONS', definitions)
    return script.encode('utf-8'), sorted(modules)
