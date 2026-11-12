'use strict';

function readNumberFocus(window) {
    const digits = window._wqaNumberDrawn;
    const index = window._index;
    const revision = window._wqaNumberChange;
    if (typeof digits !== 'string' || !/^[0-9]{1,16}$/.test(digits) ||
        !Number.isInteger(index) || index < 0 || index >= digits.length ||
        (window._wqaNumberShownIndex === index && window._wqaNumberShownChange === revision)) return null;

    const first = window._wqaNumberShownChange === null;
    window._wqaNumberShownIndex = index;
    window._wqaNumberShownChange = revision;
    return { kind: 'numberEntry', digits: first ? digits : '', digit: digits[index],
        position: index + 1, length: digits.length, first };
}

module.exports = { readNumberFocus };
