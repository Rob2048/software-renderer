'use strict';

const { mat4, mat3, vec2, vec3, vec4, quat } = glMatrix;

const canvas = document.querySelector('canvas');

const texSheet1 = getTexturePixelsFromDomElement('texture-sheet');

function getTexturePixelsFromDomElement(elementName) {
	const textureSheetDomElement = document.getElementById(elementName);

	const textureSheetCanvas = document.createElement('canvas');
	const textureSheetContext = textureSheetCanvas.getContext('2d');
	textureSheetCanvas.width = textureSheetDomElement.width;
	textureSheetCanvas.height = textureSheetDomElement.height;
	textureSheetContext.drawImage(textureSheetDomElement, 0, 0);

	const textureSheetImageData = textureSheetContext.getImageData(0, 0, textureSheetCanvas.width, textureSheetCanvas.height);
	const textureSheetBuffer = textureSheetImageData.data;

	textureSheetCanvas.remove();

	return {
		width: textureSheetCanvas.width,
		height: textureSheetCanvas.height,
		data: textureSheetBuffer,
	};
}

// NOTE: Recommended by glMatrix doccs for better performance.
glMatrix.glMatrix.setMatrixArrayType(Array);

let mouseDown = false;
let mousePosLast = [0, 0];

canvas.addEventListener('mousedown', (event) => {
	mouseDown = true;
	mousePosLast[0] = event.offsetX;
	mousePosLast[1] = event.offsetY;
});

document.addEventListener(
	'mousemove',
	(event) => {
		if (mouseDown) {
			let bounds = canvas.getBoundingClientRect();
			let clientX = event.x - bounds.left;
			let clientY = event.y - bounds.top;

			const mouseDeltaX = clientX - mousePosLast[0];
			const mouseDeltaY = clientY - mousePosLast[1];

			camRotY -= mouseDeltaX * 0.5;
			camRotX -= mouseDeltaY * 0.5;

			mousePosLast[0] = clientX;
			mousePosLast[1] = clientY;
		}
	},
	{ capture: true }
);

document.addEventListener(
	'mouseup',
	(event) => {
		mouseDown = false;
	},
	{ capture: true }
);

const keyState = {
	forward: false,
	backward: false,
	left: false,
	right: false,
};

document.addEventListener('keydown', (event) => {
	if (event.key === 'w') {
		keyState.forward = true;
	}

	if (event.key === 's') {
		keyState.backward = true;
	}

	if (event.key === 'a') {
		keyState.left = true;
	}

	if (event.key === 'd') {
		keyState.right = true;
	}
});

document.addEventListener('keyup', (event) => {
	if (event.key === 'w') {
		keyState.forward = false;
	}

	if (event.key === 's') {
		keyState.backward = false;
	}

	if (event.key === 'a') {
		keyState.left = false;
	}

	if (event.key === 'd') {
		keyState.right = false;
	}
});

const context = canvas.getContext('2d');
context.fillStyle = 'rgb(61, 72, 99)';
context.fillRect(0, 0, canvas.width, canvas.height);

const imageData = context.createImageData(canvas.width, canvas.height);
const frameBuffer = imageData.data;

// Texture sheet is 256 x 1024 with 64 x 64 sized elemnts.
function getTexSheetUvs(elementIndex) {
	const x = elementIndex % 4;
	const y = Math.floor(elementIndex / 4);

	const u0 = x / 4;
	const v0 = y / 16;

	const u1 = (x + 1) / 4;
	const v1 = (y + 1) / 16;

	return [
		[u0, v0],
		[u1, v0],
		[u1, v1],
		[u0, v1],
	];
}

function pushTri(trisList, p0, p1, p2, uv0, uv1, uv2, c0, c1, c2) {
	trisList.push(p0[0], p0[1], p0[2], c0[0], c0[1], c0[2], uv0[0], uv0[1], ...calculateNormal(p0, p1, p2));
	trisList.push(p1[0], p1[1], p1[2], c1[0], c1[1], c1[2], uv1[0], uv1[1], ...calculateNormal(p0, p1, p2));
	trisList.push(p2[0], p2[1], p2[2], c2[0], c2[1], c2[2], uv2[0], uv2[1], ...calculateNormal(p0, p1, p2));
}

function pushQuad(trisList, p0, p1, p2, p3, uv0, uv1, uv2, uv3, c0, c1, c2, c3) {
	pushTri(trisList, p0, p1, p2, uv0, uv1, uv2, c0, c1, c2);
	pushTri(trisList, p0, p2, p3, uv0, uv2, uv3, c0, c2, c3);
}

function calculateNormal(p0, p1, p2) {
	const ab = vec3.subtract(vec3.create(), p1, p0);
	const ac = vec3.subtract(vec3.create(), p2, p0);

	return vec3.normalize(vec3.create(), vec3.cross(vec3.create(), ab, ac));
}

const attribCount = 11;

const cBlack = [0.0, 0.0, 0.0];
const col0 = [1.0, 1.0, 1.0];
// const col1 = [0.6, 0.5, 0.4];
const col1 = [0.3, 0.3, 0.36];
const cR = [1.0, 0.0, 0.0];
const cG = [0.0, 1.0, 0.0];
const cB = [0.0, 0.0, 1.0];
const cY = [1.0, 1.0, 0.0];

// const tex0 = getTexSheetUvs(3);
// const tex1 = getTexSheetUvs(38);
// const tex2 = getTexSheetUvs(7);
// const tex3 = getTexSheetUvs(1);
// const tex4 = getTexSheetUvs(14); // snow

const tex = [];

for (let i = 0; i < 64; i++) {
	tex.push(getTexSheetUvs(i));
}

const level = [
	[
		{ type: 1, texId: 38 },
		{ type: 1, texId: 38 },
		{ type: 0, texId: 3 },
		{ type: 1, texId: 38 },
		{ type: 0, texId: 14 },
	],
	[
		{ type: 1, texId: 38 },
		{ type: 0, texId: 4 },
		{ type: 0, texId: 3 },
		{ type: 0, texId: 14 },
		{ type: 0, texId: 14 },
	],
	[
		{ type: 1, texId: 38 },
		{ type: 0, texId: 4 },
		{ type: 0, texId: 3 },
		{ type: 0, texId: 14 },
		{ type: 0, texId: 14 },
	],
	[
		{ type: 1, texId: 38 },
		{ type: 0, texId: 4 },
		{ type: 0, texId: 3 },
		{ type: 1, texId: 23 },
		{ type: 0, texId: 14 },
	],
	[
		{ type: 0, texId: 18 },
		{ type: 0, texId: 21, texRot: 2 },
		{ type: 0, texId: 3 },
		{ type: 0, texId: 14 },
		{ type: 0, texId: 14 },
	],
];

const lights = [
	{ pos: [0.5, -0.5, 1.5], color: [1, 0.8, 0.8] },
	{ pos: [0.0, 2, 1.0], color: [0.8, 0.8, 1.0] },
	{ pos: [0.0, 0.0, 1.0], color: [2.0, 0.8, 1.0] },
];

let t0 = performance.now();
const verts = [];

const offsetX = -level[0].length / 2;
const offsetY = -level.length / 2;

for (let y = 0; y < level.length; y++) {
	for (let x = 0; x < level[y].length; x++) {
		const tile = level[y][x];
		let tex0 = tex[tile.texId];

		if (tile.texRot == 1) {
			tex0 = [tex0[1], tex0[2], tex0[3], tex0[0]];
		} else if (tile.texRot == 2) {
			tex0 = [tex0[2], tex0[3], tex0[0], tex0[1]];
		} else if (tile.texRot == 3) {
			tex0 = [tex0[3], tex0[0], tex0[1], tex0[2]];
		} else if (tile.texRot == 4) {
			tex0 = [tex0[1], tex0[0], tex0[3], tex0[2]];
		}

		const p0 = [x + offsetX, y + offsetY, 0];
		const p1 = [x + offsetX + 1, y + offsetY, 0];
		const p2 = [x + offsetX + 1, y + offsetY + 1, 0];
		const p3 = [x + offsetX, y + offsetY + 1, 0];

		const cp0 = [x + offsetX, y + offsetY, 1];
		const cp1 = [x + offsetX + 1, y + offsetY, 1];
		const cp2 = [x + offsetX + 1, y + offsetY + 1, 1];
		const cp3 = [x + offsetX, y + offsetY + 1, 1];

		// Get neightbours
		const empty = { type: 99 };
		const n0 = x > 0 && y > 0 ? level[y - 1][x - 1] : empty;
		const n1 = y > 0 ? level[y - 1][x] : empty;
		const n2 = x < level[y].length - 1 && y > 0 ? level[y - 1][x + 1] : empty;
		const n3 = x > 0 ? level[y][x - 1] : empty;
		const n4 = x < level[y].length - 1 ? level[y][x + 1] : empty;
		const n5 = x > 0 && y < level.length - 1 ? level[y + 1][x - 1] : empty;
		const n6 = y < level.length - 1 ? level[y + 1][x] : empty;
		const n7 = x < level[y].length - 1 && y < level.length - 1 ? level[y + 1][x + 1] : empty;

		if (tile.type === 0) {
			// Floor.
			const c0 = n0.type == 1 || n1.type == 1 || n3.type == 1 ? col1 : col0;
			const c1 = n1.type == 1 || n2.type == 1 || n4.type == 1 ? col1 : col0;
			const c2 = n4.type == 1 || n6.type == 1 || n7.type == 1 ? col1 : col0;
			const c3 = n3.type == 1 || n5.type == 1 || n6.type == 1 ? col1 : col0;

			pushQuad(verts, p0, p1, p2, p3, tex0[0], tex0[1], tex0[2], tex0[3], c0, c1, c2, c3);
		} else if (tile.type === 1) {
			// Wall.
			if (n1.type == 0) {
				pushQuad(verts, p0, p1, cp1, cp0, tex0[0], tex0[1], tex0[2], tex0[3], col1, col1, col0, col0);
			}

			if (n4.type == 0) {
				pushQuad(verts, p1, p2, cp2, cp1, tex0[0], tex0[1], tex0[2], tex0[3], col1, col1, col0, col0);
			}

			if (n6.type == 0) {
				pushQuad(verts, p2, p3, cp3, cp2, tex0[0], tex0[1], tex0[2], tex0[3], col1, col1, col0, col0);
			}

			if (n3.type == 0) {
				pushQuad(verts, p3, p0, cp0, cp3, tex0[0], tex0[1], tex0[2], tex0[3], col1, col1, col0, col0);
			}

			const texRoof = tex[17];
			pushQuad(verts, cp0, cp1, cp2, cp3, texRoof[0], texRoof[1], texRoof[2], texRoof[3], col0, col0, col0, col0);
		}

		// Ceiling.
		const texRoof = tex[18];
		const rp0 = [x + offsetX, y + offsetY, 2];
		const rp1 = [x + offsetX + 1, y + offsetY, 2];
		const rp2 = [x + offsetX + 1, y + offsetY + 1, 2];
		const rp3 = [x + offsetX, y + offsetY + 1, 2];
		pushQuad(verts, rp3, rp2, rp1, rp0, texRoof[0], texRoof[1], texRoof[2], texRoof[3], col0, col0, col0, col0);
	}
}

// Apply lights.
for (let i = 0; i < verts.length; i += attribCount) {
	const p = vec3.fromValues(verts[i], verts[i + 1], verts[i + 2]);
	const n = vec3.fromValues(verts[i + 8], verts[i + 9], verts[i + 10]);
	const c = vec3.fromValues(verts[i + 3], verts[i + 4], verts[i + 5]);

	const ligthContrib = vec3.create();

	for (let j = 0; j < lights.length; j++) {
		const l = lights[j];
		const lDir = vec3.subtract(vec3.create(), l.pos, p);
		vec3.normalize(lDir, lDir);

		const dot = vec3.dot(n, lDir);
		if (dot <= 0) {
			continue;
		}

		const lightColor = vec3.scale(vec3.create(), l.color, dot);

		// Inverse square falloff.
		const distSqr = vec3.squaredDistance(l.pos, p);
		const falloff = 1 / distSqr;
		vec3.scale(lightColor, lightColor, falloff);

		vec3.add(ligthContrib, ligthContrib, lightColor);
	}

	// Add ambient.
	vec3.add(ligthContrib, ligthContrib, vec3.fromValues(0.3, 0.3, 0.3));

	// Add occlusion.
	vec3.multiply(ligthContrib, ligthContrib, c);

	verts[i + 3] = ligthContrib[0];
	verts[i + 4] = ligthContrib[1];
	verts[i + 5] = ligthContrib[2];
}

console.log('Tri generation time:', performance.now() - t0);
console.log('Tris:', verts.length / attribCount / 3);
console.log('Verts:', verts.length / attribCount);

const numPrims = verts.length / attribCount / 3;

const startTime = Date.now();
let lastFrameTime = startTime;

const showWireframe = false;

let frameTimeFiltered = 0;

let camX = 0; //Math.sin((Date.now() - startTime) * 0.0005) * 2.0;
let camY = 0; //Math.cos((Date.now() - startTime) * 0.0005) * 2.0;
let camZ = 2.0;
let camRotX = 45;
let camRotY = 0;

let cameraWorldPos;
let cameraWorldDir;

function renderFrame() {
	const currentTime = Date.now();
	const deltaTime = currentTime - lastFrameTime;
	lastFrameTime = currentTime;

	if (mouseDown) {
		const camWorldLeft = vec3.fromValues(cameraWorldDir[1], -cameraWorldDir[0], 0);

		const moveDir = vec3.fromValues(0, 0, 0);

		if (keyState.forward) {
			vec3.add(moveDir, moveDir, cameraWorldDir);
		}

		if (keyState.backward) {
			vec3.subtract(moveDir, moveDir, cameraWorldDir);
		}

		if (keyState.left) {
			vec3.add(moveDir, moveDir, camWorldLeft);
		}

		if (keyState.right) {
			vec3.subtract(moveDir, moveDir, camWorldLeft);
		}

		vec3.normalize(moveDir, moveDir);

		camX += moveDir[0] * deltaTime * 0.001;
		camY += moveDir[1] * deltaTime * 0.001;
		camZ += moveDir[2] * deltaTime * 0.001;
	}

	// Clear.
	let t0 = performance.now();
	for (let i = 0; i < frameBuffer.length; i += 4) {
		frameBuffer[i] = 99;
		frameBuffer[i + 1] = 72;
		frameBuffer[i + 2] = 61;
		frameBuffer[i + 3] = 255;
		// frameBuffer[i] = 61;
		// frameBuffer[i + 1] = 72;
		// frameBuffer[i + 2] = 99;
	}
	// console.log('Clear:', performance.now() - t0);

	const nearPlane = 0.1;
	const farPlane = 5;

	// Projection matrix
	const projMat = mat4.perspective(mat4.create(), Math.PI / 2, canvas.width / canvas.height, nearPlane, farPlane);
	// const viewMat = mat4.lookAt(mat4.create(), vec3.fromValues(camX, camY, 2.0), [0, 0, 0], [0, 0, -1]);
	// console.log(viewMat2);
	// const viewMat = mat4.fromRotationTranslation(mat4.create(), quat.fromEuler(quat.create(), 45, 45, 0), vec3.fromValues(-camX, -camY, -camZ));
	const viewMat = mat4.fromTranslation(mat4.create(), vec3.fromValues(-camX, -camY, -camZ));
	const viewRotY = mat4.fromZRotation(mat4.create(), glMatrix.glMatrix.toRadian(camRotY));
	const viewRotX = mat4.fromXRotation(mat4.create(), glMatrix.glMatrix.toRadian(camRotX));
	mat4.multiply(viewRotX, viewRotX, viewRotY);

	mat4.multiply(viewMat, viewRotX, viewMat);

	const viewProj = mat4.multiply(mat4.create(), projMat, viewMat);

	mat4.invert(viewMat, viewMat);

	cameraWorldPos = vec3.fromValues(viewMat[12], viewMat[13], viewMat[14]);
	cameraWorldDir = vec3.fromValues(-viewMat[8], -viewMat[9], -viewMat[10]);
	vec3.normalize(cameraWorldDir, cameraWorldDir);

	const drawList = [];
	const wireframeLineList = [];

	// Triangle culling.
	t0 = performance.now();
	for (let i = 0; i < numPrims; i++) {
		// Backface cull.
		const startIdx = i * attribCount * 3;
		const aT = vec4.fromValues(verts[startIdx], verts[startIdx + 1], verts[startIdx + 2], 1.0);
		const aN = vec4.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10], 0.0);
		const camToVert = vec3.subtract(vec3.create(), cameraWorldPos, aT);
		const dot = vec3.dot(camToVert, aN);

		if (dot > 0) {
			const bT = vec4.fromValues(verts[startIdx + attribCount], verts[startIdx + attribCount + 1], verts[startIdx + attribCount + 2], 1.0);
			const cT = vec4.fromValues(verts[startIdx + attribCount * 2], verts[startIdx + attribCount * 2 + 1], verts[startIdx + attribCount * 2 + 2], 1.0);

			// Cheap frustum culling.
			const camToVertA = vec3.subtract(vec3.create(), aT, cameraWorldPos);
			const camToVertB = vec3.subtract(vec3.create(), bT, cameraWorldPos);
			const camToVertC = vec3.subtract(vec3.create(), cT, cameraWorldPos);

			const dVA = vec3.dot(camToVertA, cameraWorldDir);
			const dVB = vec3.dot(camToVertB, cameraWorldDir);
			const dVC = vec3.dot(camToVertC, cameraWorldDir);

			if (dVA <= nearPlane || dVB <= nearPlane || dVC <= nearPlane) {
				continue;
			}

			if (dVA >= farPlane || dVB >= farPlane || dVC >= farPlane) {
				continue;
			}

			// Get average world position of triangle for depth sorting.
			const avgPos = vec3.clone(aT);
			vec3.add(avgPos, avgPos, bT);
			vec3.add(avgPos, avgPos, cT);
			vec3.scale(avgPos, avgPos, 1 / 3);

			// Get distance to camera.
			const distSqr = vec3.squaredDistance(cameraWorldPos, avgPos);

			drawList.push({ idx: i, dist: distSqr });
		}
	}
	// console.log('Tri initial cull:', performance.now() - t0);

	// Sort by depth.
	t0 = performance.now();
	drawList.sort((a, b) => b.dist - a.dist);
	// console.log('Tri sort:', performance.now() - t0);

	// Assume each triangle is each unique 3 verts.
	t0 = performance.now();
	for (let prim = 0; prim < drawList.length; prim++) {
		let startIdx = drawList[prim].idx * attribCount * 3;
		const aT = vec4.fromValues(verts[startIdx], verts[startIdx + 1], verts[startIdx + 2], 1);
		const aC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
		const aUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
		const aN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

		startIdx += attribCount;
		const bT = vec4.fromValues(verts[startIdx], verts[startIdx + 1], verts[startIdx + 2], 1);
		const bC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
		const bUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
		const bN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

		startIdx += attribCount;
		const cT = vec4.fromValues(verts[startIdx], verts[startIdx + 1], verts[startIdx + 2], 1);
		const cC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
		const cUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
		const cN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

		// Project verts to screenspace.
		mat4.multiply(aT, viewProj, aT);
		mat4.multiply(bT, viewProj, bT);
		mat4.multiply(cT, viewProj, cT);

		// Perspective divide.
		const a = vec3.fromValues(aT[0] / aT[3], aT[1] / aT[3], aT[2] / aT[3]);
		const b = vec3.fromValues(bT[0] / bT[3], bT[1] / bT[3], bT[2] / bT[3]);
		const c = vec3.fromValues(cT[0] / cT[3], cT[1] / cT[3], cT[2] / cT[3]);

		// Clip against near plane.
		// NOTE: Cheap removal of triangles behind camera. Should already be culled by cheap frustum culling.
		if (aT[2] < 0 || bT[2] < 0 || cT[2] < 0) {
			continue;
		}

		// Normalize to viewport.
		a[0] = (a[0] + 1) / 2;
		a[1] = (a[1] + 1) / 2;

		b[0] = (b[0] + 1) / 2;
		b[1] = (b[1] + 1) / 2;

		c[0] = (c[0] + 1) / 2;
		c[1] = (c[1] + 1) / 2;

		// Get bounds of triangle.
		const min = vec3.set(vec3.create(), Infinity, Infinity, Infinity);
		const max = vec3.set(vec3.create(), -Infinity, -Infinity, -Infinity);

		vec3.min(min, min, a);
		vec3.max(max, max, a);

		vec3.min(min, min, b);
		vec3.max(max, max, b);

		vec3.min(min, min, c);
		vec3.max(max, max, c);

		const xStart = Math.max(0, Math.floor(min[0] * canvas.width));
		const xEnd = Math.min(canvas.width, Math.ceil(max[0] * canvas.width));

		const yStart = Math.max(0, Math.floor(min[1] * canvas.height));
		const yEnd = Math.min(canvas.height, Math.ceil(max[1] * canvas.height));

		// Raster bounds.
		// drawLine(xStart, yStart, xEnd, yStart, frameBuffer, cG);
		// drawLine(xEnd, yStart, xEnd, yEnd, frameBuffer, cG);
		// drawLine(xEnd, yEnd, xStart, yEnd, frameBuffer, cG);
		// drawLine(xStart, yEnd, xStart, yStart, frameBuffer, cG);

		const ab = vec3.subtract(vec3.create(), b, a);
		const bc = vec3.subtract(vec3.create(), c, b);
		const ca = vec3.subtract(vec3.create(), a, c);

		const n1 = vec3.fromValues(-ab[1], ab[0], 0.0);
		const n2 = vec3.fromValues(-bc[1], bc[0], 0.0);
		const n3 = vec3.fromValues(-ca[1], ca[0], 0.0);

		// Point vs edge prep.
		const p = vec3.create();
		const ap = vec3.create();
		const bp = vec3.create();
		const cp = vec3.create();

		// Barycentric prep.
		const v0 = vec2.subtract(vec2.create(), b, a);
		const v1 = vec2.subtract(vec2.create(), c, a);
		const d00 = vec2.dot(v0, v0);
		const d01 = vec2.dot(v0, v1);
		const d11 = vec2.dot(v1, v1);
		const denom = d00 * d11 - d01 * d01;
		const bary = vec3.create();
		const baryI = vec3.create();
		const v2 = vec2.create();
		const w0 = 1 / aT[3];
		const w1 = 1 / bT[3];
		const w2 = 1 / cT[3];

		for (let y = yStart; y < yEnd; y++) {
			for (let x = xStart; x < xEnd; x++) {
				const u = x / canvas.width;
				const v = y / canvas.height;

				vec3.set(p, u, v, 1);

				vec3.subtract(ap, p, a);
				vec3.subtract(bp, p, b);
				vec3.subtract(cp, p, c);

				const dot1 = vec3.dot(ap, n1);
				const dot2 = vec3.dot(bp, n2);
				const dot3 = vec3.dot(cp, n3);

				if (dot1 >= 0 && dot2 >= 0 && dot3 >= 0) {
					// Calc bary coords.
					vec2.subtract(v2, p, a);
					const d20 = vec2.dot(v2, v0);
					const d21 = vec2.dot(v2, v1);
					baryI[1] = (d11 * d20 - d01 * d21) / denom;
					baryI[2] = (d00 * d21 - d01 * d20) / denom;
					baryI[0] = 1.0 - baryI[1] - baryI[2];

					// Perspective correct bary.
					const w = 1 / (baryI[0] * w0 + baryI[1] * w1 + baryI[2] * w2);

					bary[0] = baryI[0] * w * w0;
					bary[1] = baryI[1] * w * w1;
					bary[2] = baryI[2] * w * w2;

					const fragColor = vec3.create();

					// Vertex colors.
					fragColor[0] = aC[0] * bary[0] + bC[0] * bary[1] + cC[0] * bary[2];
					fragColor[1] = aC[1] * bary[0] + bC[1] * bary[1] + cC[1] * bary[2];
					fragColor[2] = aC[2] * bary[0] + bC[2] * bary[1] + cC[2] * bary[2];

					// UVs.
					// bary[0] *= 255;
					// bary[1] *= 255;
					// bary[2] *= 255;
					// frameBuffer[index] = aUv[0] * bary[0] + bUv[0] * bary[1] + cUv[0] * bary[2];
					// frameBuffer[index + 1] = aUv[1] * bary[0] + bUv[1] * bary[1] + cUv[1] * bary[2];
					// frameBuffer[index + 2] = 0;

					// Normals.
					// const n = vec3.create();
					// n[0] = aN[0] * bary[0] + bN[0] * bary[1] + cN[0] * bary[2];
					// n[1] = aN[1] * bary[0] + bN[1] * bary[1] + cN[1] * bary[2];
					// n[2] = aN[2] * bary[0] + bN[2] * bary[1] + cN[2] * bary[2];
					// vec3.normalize(n, n);
					// fragColor[0] = (n[0] * 0.5 + 0.5) * 255;
					// fragColor[1] = (n[1] * 0.5 + 0.5) * 255;
					// fragColor[2] = (n[2] * 0.5 + 0.5) * 255;

					// Texture sample.
					const texU = aUv[0] * bary[0] + bUv[0] * bary[1] + cUv[0] * bary[2];
					const texV = aUv[1] * bary[0] + bUv[1] * bary[1] + cUv[1] * bary[2];
					const texX = Math.floor(texSheet1.width * texU);
					const texY = Math.floor(texSheet1.height * texV);
					const texIndex = (texY * texSheet1.width + texX) * 4;
					// NOTE: In 0 - 255 range.
					const texColor = vec3.fromValues(texSheet1.data[texIndex], texSheet1.data[texIndex + 1], texSheet1.data[texIndex + 2]);

					vec3.multiply(fragColor, fragColor, texColor);
					// fragColor[0] *= 255;
					// fragColor[1] *= 255;
					// fragColor[2] *= 255;

					// Depth.
					const depth = aT[2] * bary[0] + bT[2] * bary[1] + cT[2] * bary[2];

					// Fog.
					const fog = 1.0 - Math.min(1.0, Math.max(0.0, depth * 0.3));
					// fragColor[0] = fragColor[0] * fog + 61 * (1 - fog);
					// fragColor[1] = fragColor[1] * fog + 72 * (1 - fog);
					// fragColor[2] = fragColor[2] * fog + 99 * (1 - fog);
					fragColor[0] = fragColor[0] * fog + 99 * (1 - fog);
					fragColor[1] = fragColor[1] * fog + 72 * (1 - fog);
					fragColor[2] = fragColor[2] * fog + 61 * (1 - fog);

					// Write final fragment.
					const index = (y * canvas.width + x) * 4;
					frameBuffer[index] = fragColor[0];
					frameBuffer[index + 1] = fragColor[1];
					frameBuffer[index + 2] = fragColor[2];
				}
			}
		}

		if (showWireframe) {
			a[0] = a[0] * canvas.width;
			a[1] = a[1] * canvas.height;
			b[0] = b[0] * canvas.width;
			b[1] = b[1] * canvas.height;
			c[0] = c[0] * canvas.width;
			c[1] = c[1] * canvas.height;
			// wireframeLineList.push(a[0], a[1], b[0], b[1]);
			// wireframeLineList.push(b[0], b[1], c[0], c[1]);
			// wireframeLineList.push(c[0], c[1], a[0], a[1]);
			drawLine(a[0], a[1], b[0], b[1], frameBuffer, col0);
			drawLine(b[0], b[1], c[0], c[1], frameBuffer, col0);
			drawLine(c[0], c[1], a[0], a[1], frameBuffer, col0);
			// drawLine(a[0], a[1], b[0], b[1], frameBuffer, col0);
			// drawLine(b[0], b[1], c[0], c[1], frameBuffer, col0);
			// drawLine(c[0], c[1], a[0], a[1], frameBuffer, col0);
		}
	}
	// console.log('Draw:', (performance.now() - t0).toFixed(1) + 'ms');
	frameTimeFiltered = 0.9 * frameTimeFiltered + 0.1 * (performance.now() - t0);

	if (showWireframe) {
		for (let i = 0; i < wireframeLineList.length; i += 4) {
			drawLine(wireframeLineList[i], wireframeLineList[i + 1], wireframeLineList[i + 2], wireframeLineList[i + 3], frameBuffer, cBlack);
		}
	}

	context.putImageData(imageData, 0, 0);

	context.fillStyle = 'rgb(255, 255, 255)';
	context.font = '10px monospace';
	context.fillText(frameTimeFiltered.toFixed(1) + 'ms', 5, 10);
	context.fillText('Tris: ' + drawList.length + '/' + numPrims, 5, 20);

	requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);

// function getBarycentric(p, a, b, c) {
// 	const v0 = vec3.create();
// 	vec3.subtract(v0, b, a);
// 	const v1 = vec3.create();
// 	vec3.subtract(v1, c, a);
// 	const v2 = vec3.create();
// 	vec3.subtract(v2, p, a);

// 	const d00 = vec3.dot(v0, v0);
// 	const d01 = vec3.dot(v0, v1);
// 	const d11 = vec3.dot(v1, v1);
// 	const d20 = vec3.dot(v2, v0);
// 	const d21 = vec3.dot(v2, v1);
// 	const denom = d00 * d11 - d01 * d01;

// 	const result = vec3.create();
// 	result[0] = (d11 * d20 - d01 * d21) / denom;
// 	result[1] = (d00 * d21 - d01 * d20) / denom;
// 	result[2] = 1.0 - result[0] - result[1];

// 	return result;
// }

// NOTE: In pixel space.
function drawLine(x0, y0, x1, y1, frameBuffer, color) {
	x0 = Math.floor(x0);
	y0 = Math.floor(y0);
	x1 = Math.floor(x1);
	y1 = Math.floor(y1);

	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;

	const cR = color[0] * 255;
	const cG = color[1] * 255;
	const cB = color[2] * 255;

	while (true) {
		// TODO: Prefer to clip line to viewport size.
		if (x0 >= 0 && x0 < canvas.width && y0 >= 0 && y0 < canvas.height) {
			const index = (y0 * canvas.width + x0) * 4;
			frameBuffer[index] = cR;
			frameBuffer[index + 1] = cG;
			frameBuffer[index + 2] = cB;
		}

		if (x0 === x1 && y0 === y1) {
			break;
		}

		const e2 = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x0 += sx;
		}

		if (e2 < dx) {
			err += dx;
			y0 += sy;
		}
	}
}
