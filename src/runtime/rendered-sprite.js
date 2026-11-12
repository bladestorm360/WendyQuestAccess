'use strict';

function renderedSprite(sprite, parent) {
    return sprite?.parent === parent && sprite.worldVisible === true && sprite.worldAlpha > 0 &&
        sprite.visible !== false && sprite.renderable !== false && sprite.texture?.valid === true;
}

module.exports = { renderedSprite };
