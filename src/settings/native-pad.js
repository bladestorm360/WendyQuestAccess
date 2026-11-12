// Inserted after the game's physical/axis sample and before logical actions.
// Preserve raw physical edges for the active controller owner, then suppress
// consumed native buttons until their physical release.
// After retirement this branch only filters a previously consumed press.
{
    const wqaScene = SceneManager._scene;
    const wqaModal = wqaScene?._wqaSettingsActive === true;
    const wqaActive = (wqaModal || wqaScene?._wqaControllerReady || wqaScene?._wqaFieldReady ||
        wqaScene?._wqaBattleTargetControl) &&
        !SceneManager._nextScene && !SceneManager._exiting;
    const wqaIndex = WQA_PAD.index;
    const wqaPrior = this._wqaSettingsPads?.[wqaIndex] || 0;
    if (wqaModal || wqaPrior || wqaActive) {
        const wqaCount = Math.min(32, WQA_STATE.length);
        let wqaPressed = 0;
        for (let wqaButton = 0; wqaButton < wqaCount; wqaButton++) {
            if (WQA_STATE[wqaButton]) wqaPressed |= 1 << wqaButton;
        }
        const wqaClaim = wqaActive ? globalThis.WendyQuestAccessPadSample?.(
            wqaIndex, WQA_PAD.mapping, WQA_PAD.id, wqaPressed, WQA_PAD.axes[2], WQA_PAD.axes[3]) : 0;
        const wqaMask = wqaPressed & (wqaModal ? -1 : wqaPrior | wqaClaim);
        if (wqaMask) for (let wqaButton = 0; wqaButton < wqaCount; wqaButton++) {
            if (wqaMask & (1 << wqaButton)) WQA_STATE[wqaButton] = false;
        }
        if (wqaMask) (this._wqaSettingsPads ||= Object.create(null))[wqaIndex] = wqaMask;
        else if (wqaPrior) delete this._wqaSettingsPads[wqaIndex];
    }
}
