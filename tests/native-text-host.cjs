'use strict';

// The installed Sprite_Text code supplies layout, repaint and glyph creation.
// These stand-ins provide only the PIXI container and canvas used by that code.
function nativeTextHost() {
    function Sprite(bitmap) { this.initialize(bitmap); }
    Sprite.prototype.initialize = function (bitmap) {
        Object.assign(this, { bitmap, children: [], anchor: {}, scale: { x: 1, y: 1 }, x: 0, y: 0,
            alpha: 1, worldVisible: true, worldAlpha: 1 });
    };
    Sprite.prototype.update = function () { for (const child of this.children) child.update(); };
    Sprite.prototype.addChild = function (child) { this.children.push(child); child.parent = this; return child; };
    Sprite.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; };
    Sprite.prototype.setFrame = function (x, y, width, height) { this._frame = { x, y, width, height }; };

    function Sprite_Text() { this.initialize(); }
    Sprite_Text.prototype = Object.create(Sprite.prototype);
    Sprite_Text.prototype.updateAnimation = () => {};

    function Bitmap(width, height) { Object.assign(this, { width, height, context: {}, _baseTexture: { dirtyId: 0 } }); }
    Bitmap.prototype.clear = function () { this.paint = ''; this._baseTexture.dirtyId++; };
    Bitmap.prototype.drawText = function (glyph) { this.paint = glyph; this._baseTexture.dirtyId++; };
    Bitmap.prototype.measureTextWidth = () => 7;
    Bitmap.prototype.isReady = () => true;

    return { Sprite, Sprite_Text, Bitmap, $gameSystem: { mainFontSize: () => 16 },
        TextAlignment: { Left: 0, Center: 1, Right: 2 },
        a18_0x52f0af() { throw Error('Unresolved native text property'); } };
}

module.exports = { nativeTextHost };
