const assetPaths = {
    desktop: 'cabin-desktop.webp',
    mobile: 'cabin-mobile.webp',
    rings: 'rings.jpg',
    dawn: 'dawn.jpg',
};

// Left and right edges of the illuminated bands in the approved ring photograph.
const ringEdges = [
    [0, .450, .750], [.10, .455, .727], [.20, .420, .679], [.30, .353, .602],
    [.40, .275, .505], [.50, .189, .396], [.60, .097, .273], [.70, .002, .143],
    [.80, -.098, .011], [.90, -.200, -.127],
];

function fraction(value) {
    return value - Math.floor(value);
}

function variation(seed) {
    return fraction(Math.sin(seed * 78.233 + 31.71) * 43758.5453);
}

function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}

function ringX(y, lane) {
    const index = clamp(Math.floor(y * 10), 0, ringEdges.length - 2);
    const [from, left, right] = ringEdges[index];
    const [to, nextLeft, nextRight] = ringEdges[index + 1];
    const start = left + (right - left) * lane;
    const end = nextLeft + (nextRight - nextLeft) * lane;
    return start + (end - start) * (y - from) / (to - from);
}

const ringTrails = Array.from({ length: 64 }, (_, index) => {
    const seed = index * 11;
    return {
        lane: .08 + variation(seed + 1) * .84,
        phase: variation(seed + 2),
        speed: .010 + variation(seed + 3) * .013,
        length: index % 5 === 0 ? .082 : .005 + variation(seed + 4) * .028,
        width: .55 + variation(seed + 5) * (index % 5 === 0 ? 3.9 : 1.4),
        alpha: .14 + variation(seed + 6) * .27,
        bright: index % 7 !== 0,
    };
});

function sampleStars(image, key) {
    const canvas = document.createElement('canvas');
    const width = canvas.width = 680;
    const height = canvas.height = Math.round(width * image.height / image.width);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const levels = new Uint8Array(width * height);
    for (let i = 0; i < levels.length; i++) {
        levels[i] = (pixels[i * 4] * 2 + pixels[i * 4 + 1] * 5 + pixels[i * 4 + 2]) / 8;
    }

    const top = Math.round(height * .017);
    const bottom = Math.round(height * ({ desktop: .697, mobile: .646, rings: .965, dawn: .415 }[key]));
    const left = Math.round(width * (key === 'rings' ? .66 : .035));
    const right = Math.round(width * .975);
    const cells = new Map();
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const index = y * width + x;
            const peak = levels[index];
            if (peak < 31 || peak > 235) continue;
            if (peak < Math.max(levels[index - 1], levels[index + 1], levels[index - width], levels[index + width])) continue;
            const neighbors = [
                levels[index - 3], levels[index + 3], levels[index - 3 * width], levels[index + 3 * width],
            ];
            const contrast = peak - Math.max(...neighbors);
            if (contrast < 10 || Math.min(...neighbors) > 125) continue;
            const cell = Math.floor(x / 40) + Math.floor(y / 40) * 32;
            const score = contrast + peak * .1;
            if (!cells.has(cell) || cells.get(cell).score < score) {
                cells.set(cell, { x: (x + .5) / width, y: (y + .5) / height, score });
            }
        }
    }
    const stars = [...cells.values()].sort((a, b) => b.score - a.score).slice(0, 92);
    // Give a few stars in the open part of the window a distinctly brighter glint.
    const visible = stars.filter(star => {
        if (key === 'desktop') return star.x > .09 && star.x < .54 && star.y < .58;
        if (key === 'mobile') return star.x > .16 && star.x < .64 && star.y < .35;
        return true;
    });
    const prominent = new Set(visible.slice(0, 15));
    return stars.map((star, index) => {
        const bright = prominent.has(star);
        return {
            ...star,
            bright,
            radius: bright ? 5.6 + variation(index * 7) * 2.8 : 2.1 + variation(index * 7) * 2.7,
            cycle: 2.8 + variation(index * 7 + 1) * 4.8,
            phase: variation(index * 7 + 2),
            alpha: bright ? .73 + variation(index * 7 + 3) * .24 : .32 + variation(index * 7 + 3) * .35,
        };
    });
}

function makeStarGlow(prominent = false) {
    const sprite = document.createElement('canvas');
    const size = sprite.width = sprite.height = 48;
    const center = size / 2;
    const ctx = sprite.getContext('2d');
    const light = ctx.createRadialGradient(center, center, 0, center, center, center);
    light.addColorStop(0, '#fffdf8');
    light.addColorStop(.16, '#e5edffdc');
    light.addColorStop(.42, '#afc6ff57');
    light.addColorStop(1, '#afc6ff00');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, size, size);
    if (prominent) {
        ctx.save();
        ctx.translate(center, center);
        for (let axis = 0; axis < 2; axis++) {
            const ray = ctx.createLinearGradient(-center, 0, center, 0);
            ray.addColorStop(0, '#dfe8ff00');
            ray.addColorStop(.5, '#fffcf5');
            ray.addColorStop(1, '#dfe8ff00');
            ctx.fillStyle = ray;
            ctx.beginPath();
            ctx.moveTo(-center, 0);
            ctx.lineTo(0, -2.5);
            ctx.lineTo(center, 0);
            ctx.lineTo(0, 2.5);
            ctx.fill();
            ctx.rotate(Math.PI / 2);
        }
        ctx.restore();
    }
    return sprite;
}

function makeCloudLayer(image) {
    const layer = document.createElement('canvas');
    const width = layer.width = Math.min(1000, image.width);
    const height = layer.height = Math.round(width * image.height / image.width);
    const ctx = layer.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';

    // Feather only the lower cloud bank, leaving the sky and horizon in place.
    const slope = .36 * height / width;
    const fromX = width / 2;
    const fromY = height * .673;
    const feather = height * .17;
    const cloudMask = ctx.createLinearGradient(fromX, fromY, fromX - feather * slope, fromY + feather);
    cloudMask.addColorStop(0, 'transparent');
    cloudMask.addColorStop(1, 'black');
    ctx.fillStyle = cloudMask;
    ctx.fillRect(0, 0, width, height);

    const edgeMask = ctx.createLinearGradient(0, 0, width, 0);
    edgeMask.addColorStop(0, 'transparent');
    edgeMask.addColorStop(.065, 'black');
    edgeMask.addColorStop(.935, 'black');
    edgeMask.addColorStop(1, 'transparent');
    ctx.fillStyle = edgeMask;
    ctx.fillRect(0, 0, width, height);
    return layer;
}

function drawStars(ctx, glow, sparkle, stars, box, seconds) {
    const scale = clamp(box.width / 1400, .84, 1.5);
    for (const star of stars) {
        const cycle = seconds / star.cycle + star.phase;
        const pulse = Math.pow((1 + Math.cos(cycle * Math.PI * 2)) / 2, 3);
        if (pulse < .065) continue;
        const radius = star.radius * scale * (.64 + pulse * .42);
        const x = box.x + star.x * box.width;
        const y = box.y + star.y * box.height;
        ctx.globalAlpha = pulse * star.alpha;
        ctx.drawImage(star.bright ? sparkle : glow, x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 1;
}

function drawRings(ctx, box, seconds) {
    const scale = clamp(box.width / 1400, .75, 1.5);
    for (const trail of ringTrails) {
        const y = .91 - fraction(trail.phase + seconds * trail.speed) * 1.03;
        if (y < -.025 || y > .82) continue;
        const endY = y + trail.length;
        const fromX = box.x + ringX(y, trail.lane) * box.width;
        const fromY = box.y + y * box.height;
        const toX = box.x + ringX(endY, trail.lane) * box.width;
        const toY = box.y + endY * box.height;
        const color = trail.bright ? '251, 224, 191' : '27, 18, 34';
        const feather = clamp((.82 - y) * 7, 0, 1);
        const light = ctx.createLinearGradient(fromX, fromY, toX, toY);
        light.addColorStop(0, 'rgba(' + color + ',0)');
        light.addColorStop(.38, 'rgba(' + color + ',' + trail.alpha * feather + ')');
        light.addColorStop(1, 'rgba(' + color + ',0)');
        ctx.strokeStyle = light;
        ctx.lineWidth = trail.width * scale;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let i = 1; i <= 4; i++) {
            const point = y + trail.length * i / 4;
            ctx.lineTo(box.x + ringX(point, trail.lane) * box.width, box.y + point * box.height);
        }
        ctx.stroke();
    }
}

function drawDawn(ctx, cloudLayer, box, seconds) {
    const cycle = fraction(seconds / 38);
    for (const phase of [cycle, fraction(cycle + .5)]) {
        const x = (phase - .5) * box.width * .038;
        ctx.globalAlpha = Math.pow(Math.sin(phase * Math.PI), 2) * .72;
        ctx.drawImage(cloudLayer, box.x + x, box.y + x * .20, box.width, box.height);
    }
    ctx.globalAlpha = 1;

    const sunX = box.x + .149 * box.width;
    const sunY = box.y + .484 * box.height;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, box.width * .11);
    const light = .052 + .029 * Math.sin(seconds * .36);
    glow.addColorStop(0, 'rgba(255,196,130,' + light + ')');
    glow.addColorStop(1, 'rgba(255,196,130,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(box.x, box.y, box.width, box.height);
}

export function mountWindowMotion(cabin) {
    const canvas = cabin.querySelector('.window-motion');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return { setRoute() {}, setStill() {} };
    const portrait = matchMedia('(max-width: 760px)');
    const glow = makeStarGlow();
    const sparkle = makeStarGlow(true);
    const loaded = new Map();
    const vistas = {
        rings: cabin.querySelector('.vista-rings'),
        dawn: cabin.querySelector('.vista-dawn'),
    };
    let route = 'galaxy';
    let asset;
    let still = false;
    let frame = 0;
    let lastDraw = 0;
    let loadTicket = 0;
    let geometry;

    function load(key) {
        if (!loaded.has(key)) {
            const image = new Image();
            image.src = new URL('./assets/' + assetPaths[key], import.meta.url).href;
            loaded.set(key, image.decode().then(() => ({
                image,
                stars: sampleStars(image, key),
                clouds: key === 'dawn' ? makeCloudLayer(image) : null,
            })));
        }
        return loaded.get(key);
    }

    function measure() {
        if (!asset) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            geometry = null;
            return;
        }
        const ratio = Math.min(devicePixelRatio, 1.4, Math.sqrt(1350000 / (rect.width * rect.height)));
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        const viewport = { x: 0, y: 0, width: rect.width, height: rect.height };
        let imageBox = viewport;
        const vista = vistas[route];
        if (vista) {
            const bounds = vista.getBoundingClientRect();
            const css = getComputedStyle(vista);
            const scale = Math.max(bounds.width / asset.image.width, bounds.height / asset.image.height);
            const width = asset.image.width * scale;
            const height = asset.image.height * scale;
            imageBox = {
                x: bounds.left - rect.left + (bounds.width - width) * (parseFloat(css.backgroundPositionX) / 100),
                y: bounds.top - rect.top + (bounds.height - height) * (parseFloat(css.backgroundPositionY) / 100),
                width, height,
            };
        }
        geometry = { ratio, imageBox, viewport };
        resume();
    }

    function draw(timestamp) {
        frame = 0;
        if (still || document.hidden || !asset || !geometry) return;
        if (timestamp - lastDraw >= (portrait.matches ? 42 : 33)) {
            lastDraw = timestamp;
            const seconds = timestamp / 1000;
            const { ratio, imageBox, viewport } = geometry;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, viewport.width + 1, viewport.height + 1);
            if (route === 'rings') drawRings(ctx, imageBox, seconds);
            if (route === 'dawn' && asset.clouds) drawDawn(ctx, asset.clouds, imageBox, seconds);
            drawStars(ctx, glow, sparkle, asset.stars, imageBox, seconds);
        }
        resume();
    }

    function resume() {
        if (!frame && !still && !document.hidden && asset && geometry) frame = requestAnimationFrame(draw);
    }

    function stop(clear) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (clear) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    async function setRoute(next) {
        route = next;
        const ticket = ++loadTicket;
        const key = next === 'galaxy' ? (portrait.matches ? 'mobile' : 'desktop') : next;
        stop(true);
        asset = null;
        geometry = null;
        try {
            const source = await load(key);
            if (ticket !== loadTicket) return;
            asset = source;
            measure();
        } catch {
            // The original static image remains available.
        }
    }

    new ResizeObserver(measure).observe(canvas);
    portrait.addEventListener('change', () => setRoute(route));
    document.addEventListener('visibilitychange', () => document.hidden ? stop(false) : resume());
    return {
        setRoute,
        setStill(value) {
            still = value;
            if (still) stop(true);
            else resume();
        },
    };
}
