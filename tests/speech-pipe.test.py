"""Drive the production helper protocol with a silent, deliberately stalled provider."""

from pathlib import Path
from queue import Queue
import subprocess
import sys
from threading import Thread


def verify(path):
    with subprocess.Popen([path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                          encoding='ascii', creationflags=subprocess.CREATE_NO_WINDOW) as child:
        replies = Queue()

        def read_replies():
            for _ in range(32):
                line = child.stdout.readline()
                if not line:
                    break
                replies.put(line.rstrip('\r\n'))

        reader = Thread(target=read_replies, daemon=True)
        reader.start()

        def send(line):
            child.stdin.write(line + '\n')
            child.stdin.flush()

        def expect(value):
            observed = replies.get(timeout=5)
            if observed != value:
                raise AssertionError(f'Expected {value!r}, got {observed!r}')

        try:
            expect('R')
            send('Sretired before helper admission')
            expect('P')
            send('N')
            expect('D')
            send('Sretired inside provider initialization')
            expect('P')
            send('Y')
            expect('I')
            send('K')
            expect('B')
            send('N')
            expect('D')
            send('Sprovider already started')
            expect('P')
            send('Y')
            expect('O')
            send('K')
            expect('S')
            send('Ainitial choice follows its prompt')
            expect('P')
            send('Y')
            expect('A')
            send('K')
            expect('S')
            send('Smalformed authorization')
            expect('P')
            send('Yextra')
            if child.wait(timeout=5) != 5:
                raise AssertionError('Invalid grant did not fail closed')
        finally:
            if child.poll() is None:
                child.kill()
            reader.join(timeout=5)
    print('Verified actual helper admission and initialization boundaries with a silent provider fixture.')


if __name__ == '__main__':
    verify(Path(sys.argv[1]).resolve(strict=True))
