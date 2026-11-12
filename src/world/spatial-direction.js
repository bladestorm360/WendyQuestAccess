'use strict';

const CARDINAL = Object.freeze({
    2: { x: 0, y: 1, left: 6, right: 4 }, 4: { x: -1, y: 0, left: 2, right: 8 },
    6: { x: 1, y: 0, left: 8, right: 2 }, 8: { x: 0, y: -1, left: 4, right: 6 }
});

function bearing(facing, direction) {
    const view = CARDINAL[facing];
    const source = CARDINAL[direction];
    return view && source && [view.x * source.y - view.y * source.x, 0, view.x * source.x + view.y * source.y];
}

module.exports = { CARDINAL, bearing };
