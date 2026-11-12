'use strict';

// Only the renderer publishes admission. The worker receives a copy of the
// epoch or the optional shared admission word, never a game object.
function createGate(sharedWord) {
    let epoch = 0;
    let domain = null;
    const publish = value => {
        if (sharedWord) Atomics.store(sharedWord, 0, value);
    };
    publish(0);
    return Object.freeze({
        open(nextDomain) {
            if (!nextDomain || epoch >= 0x7ffffffe) return 0;
            if (domain === nextDomain) return epoch;
            domain = nextDomain;
            publish(++epoch);
            return epoch;
        },
        close() {
            if (domain === null) return false;
            domain = null;
            publish(0);
            return true;
        },
        get epoch() { return domain === null ? 0 : epoch; },
        get domain() { return domain; },
        accepts(candidate) { return domain !== null && candidate === epoch; }
    });
}

module.exports = { createGate };
