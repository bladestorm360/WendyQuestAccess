"""Read a WendyQuest-style literal table without running game scripts.

Default output is source locators only. Optional bodies go to stdout for
local analysis. Keep redirected game source outside every repository.
"""

import argparse
import ast
import operator
from pathlib import Path
import re


STRING = r"(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")"
BINOPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
          ast.Div: operator.truediv}


def arithmetic(node, numbers):
    if isinstance(node, ast.Expression):
        return arithmetic(node.body, numbers)
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    if isinstance(node, ast.Name) and node.id in numbers:
        return numbers[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -arithmetic(node.operand, numbers)
    if isinstance(node, ast.BinOp) and type(node.op) in BINOPS:
        return BINOPS[type(node.op)](arithmetic(node.left, numbers), arithmetic(node.right, numbers))
    raise ValueError('Unexpected table checksum expression')


def decode(source):
    setup = re.search(r'(?P<expr>-?parseInt\(\w+\(0x[0-9a-f]+\)\).*?);if\([^;]*?\).*?'
                      r'\}\}\}\((?P<table>\w+),(?P<target>0x[0-9a-f]+)\)', source)
    if not setup or len(setup['expr']) > 2000:
        raise ValueError('Literal table checksum not found')
    table = re.search(r'function ' + re.escape(setup['table']) +
                      r'\(\)\{(?:const|let|var) \w+=\[(?P<pool>' + STRING + r'(?:,' + STRING + r')*)\]', source)
    if not table:
        raise ValueError('Literal pool not found')
    pool = [ast.literal_eval(item.group()) for item in re.finditer(STRING, table['pool'])]
    if not 1 <= len(pool) <= 10000:
        raise ValueError('Literal pool size outside supported bound')
    alias = re.search(r'parseInt\((\w+)\(', setup['expr'])[1]
    decoder = re.search(r'\b' + alias + r'=(\w+)', source)[1]
    offset_pattern = r'function ' + decoder + r'\([^)]*\)\{.{0,240}?\b(\w+)=\1-(0x[0-9a-f]+)'
    offset = re.search(offset_pattern, source)
    if not offset:
        raise ValueError('Decoder offset not found')
    base = int(offset[2], 16)
    call = re.compile(r'parseInt\(' + alias + r'\((0x[0-9a-f]+)\)\)')
    indices = [int(value, 16) - base for value in call.findall(setup['expr'])]
    if not all(0 <= i < len(pool) for i in indices):
        raise ValueError('Checksum references outside pool')
    variables = iter('arg' + str(i) for i in range(len(indices)))
    tree = ast.parse(call.sub(lambda _: next(variables), setup['expr']), mode='eval')
    matches = []
    for rotate in range(len(pool)):
        matches_at = [re.match(r'^[+-]?\d+', pool[(i + rotate) % len(pool)]) for i in indices]
        if not all(matches_at):
            continue
        values = {'arg' + str(i): int(match[0]) for i, match in enumerate(matches_at)}
        if arithmetic(tree, values) == int(setup['target'], 16):
            matches.append(rotate)
    if len(matches) != 1:
        raise ValueError('Literal table rotation is ambiguous')

    aliases = {decoder}
    assignments = re.findall(r'\b(\w+)\s*=\s*(\w+)\s*[,;]', source)
    for _ in range(12):
        new = {a for a, b in assignments if b in aliases}
        if new <= aliases:
            break
        aliases.update(new)

    spans = []
    delta = 0

    def literal(match):
        nonlocal delta
        index = int(match[2], 16) - base
        if match[1] in aliases and 0 <= index < len(pool):
            value = repr(pool[(index + matches[0]) % len(pool)])
            spans.append((match.start() + delta, match.start() + delta + len(value), match.start()))
            delta += len(value) - len(match[0])
            spans[-1] += (delta,)
            return value
        return match[0]

    decoded = re.sub(r'\b(\w+)\((0x[0-9a-f]+)\)', literal, source)
    return decoded, spans


def raw_offset(spans, position):
    delta = 0
    for start, end, raw, next_delta in spans:
        if position < start:
            break
        if position < end:
            return raw
        delta = next_delta
    return position - delta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('pattern', help='Regex for symbol locators in the decoded file')
    parser.add_argument('--context', type=int, default=0, choices=range(0, 2001), metavar='0..2000')
    parser.add_argument('--limit', type=int, default=20, choices=range(1, 101), metavar='1..100')
    parser.add_argument('--raw-offset', action='store_true', help='Include the original UTF-8 byte range')
    args = parser.parse_args()
    if args.file.stat().st_size > 1024 * 1024:
        parser.error('Plugin exceeds the 1 MiB inspection bound')
    raw = args.file.read_bytes()
    original = raw.decode('utf-8-sig')
    source, spans = decode(original)
    bom = 3 if raw.startswith(b'\xef\xbb\xbf') else 0
    for count, match in enumerate(re.finditer(args.pattern, source)):
        if count == args.limit:
            break
        if args.raw_offset:
            start, end = (bom + len(original[:raw_offset(spans, p)].encode('utf8'))
                          for p in (match.start(), match.end()))
            print(f'Original bytes [{start}, {end})', end=' ')
        print(match.start(), source[match.start():match.end() + args.context])


if __name__ == '__main__':
    main()
