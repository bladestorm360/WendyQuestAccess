'use strict';

const { drawnText } = require('../battle/presentation');

function createAutosaveNotice(host, fieldReady, notifications, appendToMapBanner) {
    let current = null;

    function leave(scene) {
        if (!current || current.scene !== scene) return;
        const state = current;
        current = null;
        scene._wqaAutosaveNotice = false;
        if (state.epoch) notifications.close(state.epoch);
    }

    function observe(scene, sprite) {
        if (!fieldReady(scene, true) || sprite?._wqaAutosaveRead || sprite?.parent !== scene || sprite._dirty) return;
        const glyph = sprite.children?.[sprite.children.length - 1];
        if (!glyph || !(glyph.alpha > 0) || !glyph.scale?.x || !glyph.scale?.y) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        if (current && current.scene !== scene) leave(current.scene);
        if (!current) current = { scene, pending: new Set(), last: null, epoch: 0 };
        const state = current;
        if (state.pending.has(sprite) || state.pending.size >= 4) return;
        scene._wqaAutosaveNotice = true;
        scene._wqaPresentation = true;
        state.pending.add(sprite);
        renderer.once('postrender', () => {
            state.pending.delete(sprite);
            if (current !== state) return;
            try {
                if (!fieldReady(scene, true)) return leave(scene);
                const text = drawnText(scene, sprite, 64);
                if (!text) return;
                // Each successful native write creates a new presentation.
                sprite._wqaAutosaveRead = true;
                state.last = sprite;
                const record = { kind: 'mapBanner', name: text };
                if (state.epoch && notifications.focus(state.epoch, { ...record, append: true })) return;
                state.epoch = appendToMapBanner(scene, record) ? 0 : notifications.open(record,
                    () => current === state && state.last?.parent === scene && fieldReady(scene, true));
            } catch { leave(scene); }
        });
    }

    return { observe, leave,
        removed(scene, sprite) {
            if (current?.scene !== scene) return;
            current.pending.delete(sprite);
            if (!current.pending.size && (!current.last || current.last === sprite || current.last.parent !== scene)) leave(scene);
        }
    };
}

module.exports = { createAutosaveNotice };
