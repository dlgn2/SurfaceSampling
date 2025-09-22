const canvas = document.createElement('canvas');
canvas.width = 64;
canvas.height = 64;
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, 64, 64);

const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 64, 64);

export function createDotTexture() {
    return canvas;
}