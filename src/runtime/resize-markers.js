// Installed into the pinned core script. Native window operations retain
// their own timing and order. While the window is changing, only the native
// renderer and these bounded geometry markers run on this path.
Graphics._wqaBeginResize = function () {
    let state = this._wqaResize;
    if (!state || !state.pending) {
        state = this._wqaResize = { pending: 0, width: 0, height: 0, failed: false };
        if (this._wqaFrontEndObserved) globalThis.WendyQuestAccessResizeStarting?.();
    }
    if (state.pending === 0x7fffffff) {
        state.failed = true;
        return null;
    }
    state.pending++;
    return state;
};

Graphics._wqaFinishResize = function (state, succeeded, width, height) {
    if (!state || this._wqaResize !== state || !state.pending) return;
    if (!succeeded) state.failed = true;
    state.width = width;
    state.height = height;
    state.pending--;
    this._wqaTryResumeResize();
};

Graphics._wqaTryResumeResize = function () {
    const state = this._wqaResize;
    if (!state || state.pending || state.failed || !state.width || !state.height ||
        state.width !== this._wqaViewportWidth || state.height !== this._wqaViewportHeight ||
        state.width !== window.innerWidth || state.height !== window.innerHeight) return;
    this._wqaResize = null;
    globalThis.WendyQuestAccessResizeReady?.();
};
