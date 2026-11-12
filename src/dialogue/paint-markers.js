// This observer is called only after a tagged text or icon draw. Keep paint
// fragments bounded and leave formatting and speech on the output worker.
Window_Base.prototype._wqaRecordPaint = function (state, text) {
    let paint = state._wqaPaint;
    if (!paint && state._wqaMessage) {
        paint = { text: '', y: state.y, end: 0, spoken: 0 };
        this._wqaDialoguePaint = state._wqaPaint = paint;
    }
    const newline = paint.y !== undefined && paint.y !== state.y ? '\n' : '';
    const room = 384 - paint.text.length - newline.length;
    if (room <= 0) return;
    // Keep an icon marker whole so the worker cannot mistake it for text.
    if (text.length > room && text[0] === '\x01') return;
    paint.text += newline + (text.length <= room ? text : text.slice(0, room));
    paint.y = state.y;
};
