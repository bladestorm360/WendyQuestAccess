"use strict";

const { battleScenePresented } = require('./presentation');

// Accepted battle records share one bounded transport FIFO. A command losing
// focus retires only its logical owner, not attacks already admitted to speech.
// Native loading/focus/settings boundaries still close the transport explicitly.
function createBattleSpeech(root, host, notifications) {
    let stream = null;
    let serial = 0;
    const owners = new Map();
    function leave(scene) {
        if (!stream || scene && stream.scene !== scene) return;
        notifications.close(stream.epoch);
        stream = null;
        owners.clear();
    }
    function enqueue(scene, record, ready) {
        if (stream?.scene !== scene) leave();
        if (stream) {
            stream.ready = ready;
            if (notifications.current(stream.epoch))
                return notifications.focus(stream.epoch, { ...record, append: true });
            // Another explicit output context may have replaced the stream.
            // Re-admit this current event without replaying older records.
            leave();
        }
        const page = stream = { scene, ready, epoch: 0 };
        page.epoch = notifications.open(record, () => stream === page &&
            (battleScenePresented(root, host, scene) || page.ready()));
        return !!page.epoch;
    }
    return {
        ...notifications,
        leave,
        open(record, ready, ...args) {
            const scene = host.manager._scene;
            if (!scene?._wqaBattleStarted) return notifications.open(record, ready, ...args);
            if (serial >= 0x7ffffffe || owners.size >= 16 || typeof ready !== 'function' || !ready()) return 0;
            if (!enqueue(scene, record, ready)) return 0;
            const token = -(++serial);
            owners.set(token, { scene, ready });
            return token;
        },
        focus(token, record, ...args) {
            if (!(token < 0)) return notifications.focus(token, record, ...args);
            const owner = owners.get(token);
            if (!owner || owner.scene !== host.manager._scene || !owner.ready() ||
                !enqueue(owner.scene, { ...record, append: true }, owner.ready)) return false;
            owners.set(token, owner);
            return true;
        },
        close(token) {
            if (token < 0) { owners.delete(token);return; }
            if (token === undefined) leave();
            notifications.close(token);
        }
    };
}
module.exports = { createBattleSpeech };
