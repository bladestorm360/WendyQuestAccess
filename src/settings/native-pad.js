// Inserted after the game's physical/axis sample and before logical actions.
// Once a modal owns a pad, suppress its buttons until their physical release.
// After retirement this branch only filters a previously consumed press.
{
    const wqaModal = SceneManager._scene?._wqaSettingsActive === true;
    const wqaIndex = WQA_PAD.index;
    const wqaPrior = this._wqaSettingsPads?.[wqaIndex] || 0;
    if (wqaModal || wqaPrior) {
        let wqaMask = 0;
        for (let wqaButton = 0; wqaButton < Math.min(32, WQA_STATE.length); wqaButton++) {
            const wqaBit = 1 << wqaButton;
            if (WQA_STATE[wqaButton] && (wqaModal || (wqaPrior & wqaBit))) {
                WQA_STATE[wqaButton] = false;
                wqaMask |= wqaBit;
            }
        }
        if (wqaMask) (this._wqaSettingsPads ||= Object.create(null))[wqaIndex] = wqaMask;
        else if (wqaPrior) delete this._wqaSettingsPads[wqaIndex];
    }
}
