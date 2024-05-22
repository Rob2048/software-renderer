'use strict';

const { mat4, mat3, vec2, vec3, vec4, quat } = glMatrix;

const canvas = document.querySelector('canvas');
const debugText = document.getElementById('debug-text');

// NOTE: Recommended by glMatrix doccs for better performance.
glMatrix.glMatrix.setMatrixArrayType(Array);

// Color constants (vec3).
const cBlack = [0.0, 0.0, 0.0];
const col0 = [1.0, 1.0, 1.0];
const col1 = [0.3, 0.3, 0.36];
const cR = [1.0, 0.0, 0.0];
const cG = [0.0, 1.0, 0.0];
const cB = [0.0, 0.0, 1.0];
const cY = [1.0, 1.0, 0.0];

//------------------------------------------------------------------------------------------------
// Input handling.
//------------------------------------------------------------------------------------------------
let mouseDown = false;
let mousePosLast = [0, 0];

const keyState = {
	forward: false,
	backward: false,
	left: false,
	right: false,
};

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

//------------------------------------------------------------------------------------------------
// Texture management.
//------------------------------------------------------------------------------------------------
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

function getTexSheetUvs(elementIndex) {
	// Texture sheet is 256 x 1024 with 64 x 64 sized elemnts.
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

const tex = [];

for (let i = 0; i < 64; i++) {
	tex.push(getTexSheetUvs(i));
}

//------------------------------------------------------------------------------------------------
// Triangle soup mangament.
//------------------------------------------------------------------------------------------------
const attribCount = 11;
const verts = [];

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

//------------------------------------------------------------------------------------------------
// Level management.
//------------------------------------------------------------------------------------------------
const level = [
	// [
	// 	{ type: 1, texId: 38 },
	// 	{ type: 1, texId: 38 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 1, texId: 38 },
	// 	{ type: 0, texId: 14 },
	// ],
	// [
	// 	{ type: 1, texId: 38 },
	// 	{ type: 0, texId: 4 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 0, texId: 14 },
	// 	{ type: 0, texId: 14 },
	// ],
	// [
	// 	{ type: 1, texId: 38 },
	// 	{ type: 0, texId: 4 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 0, texId: 14 },
	// 	{ type: 0, texId: 14 },
	// ],
	// [
	// 	{ type: 1, texId: 38 },
	// 	{ type: 0, texId: 4 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 1, texId: 23 },
	// 	{ type: 0, texId: 14 },
	// ],
	// [
	// 	{ type: 0, texId: 18 },
	// 	{ type: 0, texId: 21, texRot: 2 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 0, texId: 14 },
	// 	{ type: 0, texId: 14 },
	// ],
	// [
	// 	{ type: 0, texId: 18 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 0, texId: 3 },
	// 	{ type: 0, texId: 14 },
	// 	{ type: 0, texId: 14 },
	// ],
];

for (let i = 0; i < 40; ++i) {
	const row = [];

	for (let j = 0; j < 40; ++j) {
		const wall = Math.random() * 10 > 9 ? 1 : 0;
		row.push({ type: wall, texId: Math.floor(Math.random() * 63) });
	}

	level.push(row);
}

const lights = [
	// { pos: [0.5, -0.5, 1.5], color: [1, 0.8, 0.8] },
	// { pos: [0.0, 2, 1.0], color: [0.8, 0.8, 1.0] },
	// { pos: [0.0, 0.0, 1.0], color: [2.0, 0.8, 1.0] },
];

for (let i = 0; i < 100; ++i) {
	lights.push({ pos: [Math.random() * 40, Math.random() * 40, 1.0], color: [Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5] });
}

function compileLevel(level, lights, verts) {
	verts.length = 0;

	let t0 = performance.now();
	const offsetX = 0; //-level[0].length / 2;
	const offsetY = 0; //-level.length / 2;

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
			let n0 = x > 0 && y > 0 ? level[y - 1][x - 1] : empty;
			let n1 = y > 0 ? level[y - 1][x] : empty;
			let n2 = x < level[y].length - 1 && y > 0 ? level[y - 1][x + 1] : empty;
			let n3 = x > 0 ? level[y][x - 1] : empty;
			let n4 = x < level[y].length - 1 ? level[y][x + 1] : empty;
			let n5 = x > 0 && y < level.length - 1 ? level[y + 1][x - 1] : empty;
			let n6 = y < level.length - 1 ? level[y + 1][x] : empty;
			let n7 = x < level[y].length - 1 && y < level.length - 1 ? level[y + 1][x + 1] : empty;

			n0 = n0 ? n0 : empty;
			n1 = n1 ? n1 : empty;
			n2 = n2 ? n2 : empty;
			n3 = n3 ? n3 : empty;
			n4 = n4 ? n4 : empty;
			n5 = n5 ? n5 : empty;
			n6 = n6 ? n6 : empty;
			n7 = n7 ? n7 : empty;

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
		const occ = vec3.fromValues(verts[i + 3], verts[i + 4], verts[i + 5]);

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
		vec3.add(ligthContrib, ligthContrib, vec3.fromValues(0.10, 0.12, 0.15));

		// Multiply ambient occlusion.
		vec3.multiply(ligthContrib, ligthContrib, occ);

		verts[i + 3] = ligthContrib[0];
		verts[i + 4] = ligthContrib[1];
		verts[i + 5] = ligthContrib[2];
	}

	console.log('Tri generation time:', performance.now() - t0);
	console.log('Tris:', verts.length / attribCount / 3);
	console.log('Verts:', verts.length / attribCount);
}

compileLevel(level, lights, verts);

//------------------------------------------------------------------------------------------------
// Render helpers.
//------------------------------------------------------------------------------------------------
function getBarycentric(p, a, b, c) {
	const v0 = vec2.create();
	vec2.subtract(v0, b, a);
	const v1 = vec2.create();
	vec2.subtract(v1, c, a);
	const v2 = vec2.create();
	vec2.subtract(v2, p, a);

	const d00 = vec2.dot(v0, v0);
	const d01 = vec2.dot(v0, v1);
	const d11 = vec2.dot(v1, v1);
	const d20 = vec2.dot(v2, v0);
	const d21 = vec2.dot(v2, v1);
	const denom = d00 * d11 - d01 * d01;

	const result = vec3.create();
	result[0] = (d11 * d20 - d01 * d21) / denom;
	result[1] = (d00 * d21 - d01 * d20) / denom;
	result[2] = 1.0 - result[0] - result[1];

	return result;
}

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

function clearFrameBuffer(frameBuffer, color) {
	for (let i = 0; i < frameBuffer.length; i += 4) {
		frameBuffer[i] = color[0];
		frameBuffer[i + 1] = color[1];
		frameBuffer[i + 2] = color[2];
		frameBuffer[i + 3] = 255;
	}
}

//------------------------------------------------------------------------------------------------
// App state.
//------------------------------------------------------------------------------------------------
const showWireframe = false;

const startTime = Date.now();
let lastFrameTime = startTime;
let frameTimeFiltered = 0;
let prepTimeFiltered = 0;

let camPosition = [-0.84, 1.72, 1.45];
let camRotX = 45;
let camRotY = 0;
let cameraWorldPos;
let cameraWorldDir;

const vertSizeBytes = 16 * 4;
const triSizeBytes = 3 * vertSizeBytes;

//------------------------------------------------------------------------------------------------
// Main loop.
//------------------------------------------------------------------------------------------------
async function mainLoop() {
	//------------------------------------------------------------------------------------------------
	// State update.
	//------------------------------------------------------------------------------------------------
	const currentTime = Date.now();
	const deltaTime = currentTime - lastFrameTime;
	lastFrameTime = currentTime;

	if (mouseDown) {
		const camWorldForward = vec3.clone(cameraWorldDir);
		const camWorldLeft = vec3.cross(vec3.create(), cameraWorldDir, [0, 0, 1]);

		const moveDir = vec3.fromValues(0, 0, 0);

		if (keyState.forward) {
			vec3.add(moveDir, moveDir, camWorldForward);
		}

		if (keyState.backward) {
			vec3.subtract(moveDir, moveDir, camWorldForward);
		}

		if (keyState.left) {
			vec3.add(moveDir, moveDir, camWorldLeft);
		}

		if (keyState.right) {
			vec3.subtract(moveDir, moveDir, camWorldLeft);
		}

		vec3.normalize(moveDir, moveDir);
		vec3.add(camPosition, camPosition, vec3.scale(moveDir, moveDir, deltaTime * 0.01));
	}

	// Projection matrix.
	const nearPlane = 0.1;
	const farPlane = 100;
	const projMat = mat4.perspective(mat4.create(), Math.PI / 2, canvas.width / canvas.height, nearPlane, farPlane);

	// View matrix.
	const viewMat = mat4.fromTranslation(mat4.create(), vec3.fromValues(-camPosition[0], -camPosition[1], -camPosition[2]));
	const viewRotY = mat4.fromZRotation(mat4.create(), glMatrix.glMatrix.toRadian(camRotY));
	const viewRotX = mat4.fromXRotation(mat4.create(), glMatrix.glMatrix.toRadian(camRotX));
	mat4.multiply(viewRotX, viewRotX, viewRotY);
	mat4.multiply(viewMat, viewRotX, viewMat);

	const viewProj = mat4.multiply(mat4.create(), projMat, viewMat);

	// Extract camera world position and direction from view matrix.
	mat4.invert(viewMat, viewMat);
	cameraWorldPos = vec3.fromValues(viewMat[12], viewMat[13], viewMat[14]);
	cameraWorldDir = vec3.fromValues(-viewMat[8], -viewMat[9], -viewMat[10]);
	vec3.normalize(cameraWorldDir, cameraWorldDir);

	//------------------------------------------------------------------------------------------------
	// Rendering.
	//------------------------------------------------------------------------------------------------
	const numPrims = verts.length / attribCount / 3;

	// clearFrameBuffer(frameBuffer, [99, 72, 61]);

	//------------------------------------------------------------------------------------------------
	// Triangle culling and transform.
	//------------------------------------------------------------------------------------------------
	let t0 = performance.now();

	const drawList = [];
	const wireframeLineList = [];
	const tempTriBuffer = new Float32Array(state.tempTriBuffer);
	const triBuffer = new Float32Array(state.triBuffer);

	for (let i = 0; i < numPrims; i++) {
		// Backface cull.
		let startIdx = i * attribCount * 3;
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

			startIdx = i * attribCount * 3;
			const aC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
			const aUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
			const aN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

			startIdx += attribCount;
			const bC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
			const bUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
			const bN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

			startIdx += attribCount;
			const cC = vec3.fromValues(verts[startIdx + 3], verts[startIdx + 4], verts[startIdx + 5]);
			const cUv = vec2.fromValues(verts[startIdx + 6], verts[startIdx + 7]);
			const cN = vec3.fromValues(verts[startIdx + 8], verts[startIdx + 9], verts[startIdx + 10]);

			// Get average world position of triangle for depth sorting.
			const avgPos = vec3.clone(aT);
			vec3.add(avgPos, avgPos, bT);
			vec3.add(avgPos, avgPos, cT);
			vec3.scale(avgPos, avgPos, 1 / 3);

			// Get distance to camera.
			const distSqr = vec3.squaredDistance(cameraWorldPos, avgPos);

			const triIdx = drawList.length;
			drawList.push({ idx: triIdx, dist: distSqr });

			// Project verts to screenspace.
			mat4.multiply(aT, viewProj, aT);
			mat4.multiply(bT, viewProj, bT);
			mat4.multiply(cT, viewProj, cT);

			// Perspective divide.
			const a = vec3.fromValues(aT[0] / aT[3], aT[1] / aT[3], aT[2] / aT[3]);
			const b = vec3.fromValues(bT[0] / bT[3], bT[1] / bT[3], bT[2] / bT[3]);
			const c = vec3.fromValues(cT[0] / cT[3], cT[1] / cT[3], cT[2] / cT[3]);

			// Normalize to viewport.
			a[0] = (a[0] + 1) / 2;
			a[1] = (a[1] + 1) / 2;

			b[0] = (b[0] + 1) / 2;
			b[1] = (b[1] + 1) / 2;

			c[0] = (c[0] + 1) / 2;
			c[1] = (c[1] + 1) / 2;

			// V1
			let vIdx = triIdx * 48;
			tempTriBuffer[vIdx + 0] = a[0];
			tempTriBuffer[vIdx + 1] = a[1];
			tempTriBuffer[vIdx + 2] = a[2];
			tempTriBuffer[vIdx + 3] = aT[3];

			tempTriBuffer[vIdx + 8] = aC[0];
			tempTriBuffer[vIdx + 9] = aC[1];
			tempTriBuffer[vIdx + 10] = aC[2];

			tempTriBuffer[vIdx + 12] = aUv[0];
			tempTriBuffer[vIdx + 13] = aUv[1];

			// V2
			vIdx += 16;
			tempTriBuffer[vIdx + 0] = b[0];
			tempTriBuffer[vIdx + 1] = b[1];
			tempTriBuffer[vIdx + 2] = b[2];
			tempTriBuffer[vIdx + 3] = bT[3];

			tempTriBuffer[vIdx + 8] = bC[0];
			tempTriBuffer[vIdx + 9] = bC[1];
			tempTriBuffer[vIdx + 10] = bC[2];

			tempTriBuffer[vIdx + 12] = bUv[0];
			tempTriBuffer[vIdx + 13] = bUv[1];

			// V3
			vIdx += 16;
			tempTriBuffer[vIdx + 0] = c[0];
			tempTriBuffer[vIdx + 1] = c[1];
			tempTriBuffer[vIdx + 2] = c[2];
			tempTriBuffer[vIdx + 3] = cT[3];

			tempTriBuffer[vIdx + 8] = cC[0];
			tempTriBuffer[vIdx + 9] = cC[1];
			tempTriBuffer[vIdx + 10] = cC[2];

			tempTriBuffer[vIdx + 12] = cUv[0];
			tempTriBuffer[vIdx + 13] = cUv[1];
		}
	}

	// Sort by depth.
	drawList.sort((a, b) => b.dist - a.dist);

	// Copy temp tri buffer to state tri buffer.
	for (let i = 0; i < drawList.length; i++) {
		const triIdx = drawList[i].idx;
		triBuffer.set(tempTriBuffer.subarray(triIdx * 48, triIdx * 48 + 48), i * 48);
	}

	prepTimeFiltered = 0.9 * prepTimeFiltered + 0.1 * (performance.now() - t0);

	//------------------------------------------------------------------------------------------------
	// Rasterization.
	//------------------------------------------------------------------------------------------------
	const sceneDataRawU32 = new Uint32Array(state.sceneDataRaw);
	sceneDataRawU32[0] = drawList.length;

	t0 = performance.now();
	await wgpuRender();
	const frameTime = performance.now() - t0;

	frameTimeFiltered = 0.9 * frameTimeFiltered + 0.1 * frameTime;
	let debugStr = '<p>' + frameTimeFiltered.toFixed(2) + ' ms';
	debugStr += ' Tris: ' + drawList.length + '/' + numPrims;
	debugStr += ' Cam: ' + camPosition[0].toFixed(2) + ', ' + camPosition[1].toFixed(2) + ', ' + camPosition[2].toFixed(2) + ' ' + camRotX.toFixed(2) + ', ' + camRotY.toFixed(2);
	debugStr += '</p>';
	debugStr += '<p>';
	debugStr += 'Prep: ' + prepTimeFiltered.toFixed(2) + ' ms';
	debugStr += '</p>';
	debugText.innerHTML = debugStr;

	requestAnimationFrame(mainLoop);
}

const state = {
	tempTriBuffer: new ArrayBuffer(8000 * triSizeBytes),
	triBuffer: new ArrayBuffer(8000 * triSizeBytes),
	sceneDataRaw: new ArrayBuffer(64),
};

async function main() {
	await wgpuInit(canvas, state);

	const texSheet1 = getTexturePixelsFromDomElement('texture-sheet');
	state.texSheet1 = wgpuCreateTextureBuffer(texSheet1.data, texSheet1.width, texSheet1.height);

	mainLoop();
}

main();
