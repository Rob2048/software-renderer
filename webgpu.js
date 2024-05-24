'use strict';

function wgpuCreateTextureBuffer(imgData, width, height) {
	const buffer = state.device.createBuffer({
		size: width * height * 4 + 4 + 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const tempBuffer = new ArrayBuffer(width * height * 4 + 4 + 4);
	const tempBufferView = new DataView(tempBuffer);
	const tempBufferViewUint8 = new Uint8Array(tempBuffer);

	tempBufferView.setUint32(0, width, true);
	tempBufferView.setUint32(4, height, true);
	tempBufferViewUint8.set(imgData, 8);

	state.device.queue.writeBuffer(buffer, 0, tempBuffer);

	return {
		buffer,
		width,
		height,
	};
}

async function wgpuInit(canvas, state) {
	// https://codelabs.developers.google.com/your-first-webgpu-app#6
	if (!navigator.gpu) {
		throw new Error('WebGPU not supported');
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error('No adapter found');
	}

	const hasBGRA8unormStorage = adapter.features.has('bgra8unorm-storage');
	const device = await adapter.requestDevice({
		requiredFeatures: hasBGRA8unormStorage ? ['bgra8unorm-storage'] : [],
	});

	if (!device) {
		throw new Error('need a browser that supports WebGPU');
	}

	const context = canvas.getContext('webgpu');
	const presentationFormat = hasBGRA8unormStorage ? navigator.gpu.getPreferredCanvasFormat() : 'rgba8unorm';
	context.configure({
		device,
		format: presentationFormat,
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
	});

	const triangleBuffer = device.createBuffer({
		label: 'Triangle buffer',
		size: 8000 * 3 * 16 * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	state.sceneData = device.createBuffer({
		size: 64,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const WORKGROUP_SIZE = 16; // 256 threads per workgroup.
	const SCREEN_WIDTH = 512;
	const SCREEN_HEIGHT = 384;
	const SCREEN_PIXELS_COUNT = SCREEN_WIDTH * SCREEN_HEIGHT;

	const TILE_SIZE = 8;
	const TILES_X = SCREEN_WIDTH / TILE_SIZE; // 64
	const TILES_Y = SCREEN_HEIGHT / TILE_SIZE; // 48
	const TILES_COUNT = TILES_X * TILES_Y;

	const renderShaderModule = device.createShaderModule({
		label: 'Render compute shader',
		code: /* wgsl */ `
			struct SceneData {
				triCount: u32
			};

			struct Vertex {
				position: vec4<f32>,
				normal: vec4<f32>,
				color: vec4<f32>,
				uv: vec4<f32>,
			};

			struct Triangle {
				verts: array<Vertex, 3>
			};

			struct Texture {
				width: u32,
				height: u32,
				data: array<u32>
			};

			fn getTexColor(intColor: u32) -> vec4<f32> {
				let r = f32(intColor & 0xFF) / 255.0;
				let g = f32((intColor >> 8) & 0xFF) / 255.0;
				let b = f32((intColor >> 16) & 0xFF) / 255.0;
				let a = f32((intColor >> 24) & 0xFF) / 255.0;
				return vec4<f32>(r, g, b, a);
			}

			@group(0) @binding(0) var<uniform> sceneData: SceneData;
			@group(0) @binding(1) var screenBuffer: texture_storage_2d<${presentationFormat}, write>;
			@group(0) @binding(2) var<storage> triangle_list: array<Triangle>;
			@group(0) @binding(3) var<storage> tex_sheet_1: Texture;

			@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
			fn computeMain(@builtin(global_invocation_id) invokeId: vec3u) {
				let tileIdx = invokeId.x + invokeId.y * ${TILES_X.toFixed(0)};
				let tilePxStart = vec2<u32>(invokeId.x * ${TILE_SIZE}, invokeId.y * ${TILE_SIZE});
				let tilePxEnd = tilePxStart + vec2<u32>(${TILE_SIZE}, ${TILE_SIZE});

				var drawnTriCount = 0;

				for (var t: u32 = 0; t < sceneData.triCount; t = t + 1) {
					// Get random color base on triangle index
					let tri = triangle_list[t];
					
					// Get triangle bounds.
					let boundsMin = min(min(tri.verts[0].position.xy, tri.verts[1].position.xy), tri.verts[2].position.xy);
					let boundsMax = max(max(tri.verts[0].position.xy, tri.verts[1].position.xy), tri.verts[2].position.xy);

					let boundsMinPx = vec2<u32>(boundsMin * vec2<f32>(${SCREEN_WIDTH}, ${SCREEN_HEIGHT}));
					let boundsMaxPx = vec2<u32>(boundsMax * vec2<f32>(${SCREEN_WIDTH}, ${SCREEN_HEIGHT}) + vec2f(1, 1));

					// Clamp triangle to tile.
					let actualTilePxStart = max(tilePxStart, boundsMinPx);
					let actualTilePxEnd = min(tilePxEnd, boundsMaxPx);

					if (actualTilePxStart.x >= actualTilePxEnd.x || actualTilePxStart.y >= actualTilePxEnd.y) {
						continue;
					}

					drawnTriCount++;
					
					let c0 = tri.verts[0].color;
					let c1 = tri.verts[1].color;
					let c2 = tri.verts[2].color;

					let ab = tri.verts[1].position - tri.verts[0].position;
					let bc = tri.verts[2].position - tri.verts[1].position;
					let ca = tri.verts[0].position - tri.verts[2].position;

					let n1 = vec2<f32>(-ab.y, ab.x);
					let n2 = vec2<f32>(-bc.y, bc.x);
					let n3 = vec2<f32>(-ca.y, ca.x);

					// Barycentric prep.
					let v0 = (tri.verts[1].position - tri.verts[0].position).xy;
					let v1 = (tri.verts[2].position - tri.verts[0].position).xy;
					let d00 = dot(v0, v0);
					let d01 = dot(v0, v1);
					let d11 = dot(v1, v1);
					let denom = d00 * d11 - d01 * d01;
					let w0 = 1 / tri.verts[0].position.w;
					let w1 = 1 / tri.verts[1].position.w;
					let w2 = 1 / tri.verts[2].position.w;

					// NOTE: Dynamic loop is ~2x slower than static loop, but culling here improves perf overall.
					for (var pixelX: u32 = actualTilePxStart.x; pixelX < actualTilePxEnd.x; pixelX = pixelX + 1) {
						let pixelX_u = f32(pixelX) / 512.0;

						for (var pixelY: u32 = actualTilePxStart.y; pixelY < actualTilePxEnd.y; pixelY = pixelY + 1) {
							let pixelY_v = f32(pixelY) / 384.0;
							let p = vec2f(pixelX_u, pixelY_v);

							let ap = p - tri.verts[0].position.xy;
							let bp = p - tri.verts[1].position.xy;
							let cp = p - tri.verts[2].position.xy;

							let dot1 = dot(ap, n1);
							let dot2 = dot(bp, n2);
							let dot3 = dot(cp, n3);

							var finalColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);

							if (dot1 >= 0.0 && dot2 >= 0.0 && dot3 >= 0.0) {
								// Calc bary coords.
								let v2 = p - tri.verts[0].position.xy;
								let d20 = dot(v2, v0);
								let d21 = dot(v2, v1);
								var baryI = vec3<f32>(0.0, 0.0, 0.0);
								baryI.y = (d11 * d20 - d01 * d21) / denom;
								baryI.z = (d00 * d21 - d01 * d20) / denom;
								baryI.x = 1.0 - baryI.y - baryI.z;

								// Perspective correct bary.
								let w = 1 / (baryI.x * w0 + baryI.y * w1 + baryI.z * w2);

								var bary = vec3<f32>(0.0, 0.0, 0.0);
								bary.x = baryI.x * w * w0;
								bary.y = baryI.y * w * w1;
								bary.z = baryI.z * w * w2;

								// Vertex color.
								finalColor = c0 * bary.x + c1 * bary.y + c2 * bary.z;

								// Texture sampling.
								let intUv = tri.verts[0].uv.rg * bary.x + tri.verts[1].uv.rg * bary.y + tri.verts[2].uv.rg * bary.z;
								let texX = u32(intUv.x * f32(tex_sheet_1.width));
								let texY = u32(intUv.y * f32(tex_sheet_1.height));
								let texIndex = (texY * tex_sheet_1.width + texX);
								let texColor = tex_sheet_1.data[texIndex];

								finalColor *= getTexColor(texColor);

								// let drawnTriCount = saturate(f32(drawnTriCount) / 20);
								// finalColor = vec4<f32>(mix(vec3f(0, 0, 0), vec3f(1, 0, 0), drawnTriCount), 1);
								
								textureStore(screenBuffer, vec2<u32>(pixelX, pixelY), finalColor);
							}
						}
					}
				}

				// NOTE: Debug intensity based on num tris drawn.
				// for (var pixelX: u32 = 0; pixelX < 8; pixelX = pixelX + 1) {
				// 	for (var pixelY: u32 = 0; pixelY < 8; pixelY = pixelY + 1) {
				// 		let col = f32(drawnTriCount) / 30;
				// 		textureStore(screenBuffer, vec2<u32>(tilePxStart.x + pixelX, tilePxStart.y + pixelY), vec4f(col, 0, 0, 1));
				// 	}
				// }

				// NOTE: Tile border, debug.
				// for (var p: u32 = 0; p < ${TILE_SIZE}; p = p + 1) {
				// 	textureStore(screenBuffer, vec2<u32>(tilePxStart.x + p, tilePxStart.y), vec4<f32>(0.2, 0.2, 0.2, 1.0));
				// 	textureStore(screenBuffer, vec2<u32>(tilePxStart.x, tilePxStart.y + p), vec4<f32>(0.2, 0.2, 0.2, 1.0));
				// }
			}
		`,
	});

	const computePipeline = device.createComputePipeline({
		label: 'Compute pipeline',
		layout: 'auto',
		compute: {
			module: renderShaderModule,
			entryPoint: 'computeMain',
		},
	});

	state.device = device;
	state.context = context;
	state.triangleBuffer = triangleBuffer;
	state.computePipeline = computePipeline;
	state.renderShaderModule = renderShaderModule;
}

// NOTE: "Blocks" until the GPU has finished rendering.
async function wgpuRender() {
	const device = state.device;

	const bindGroup = device.createBindGroup({
		label: 'Bind group',
		layout: state.computePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: state.sceneData } },
			{ binding: 1, resource: state.context.getCurrentTexture().createView() },
			{ binding: 2, resource: { buffer: state.triangleBuffer } },
			{ binding: 3, resource: { buffer: state.texSheet1.buffer } },
		],
	});

	device.queue.writeBuffer(state.sceneData, 0, state.sceneDataRaw);
	device.queue.writeBuffer(state.triangleBuffer, 0, state.triBuffer);

	const encoder = device.createCommandEncoder();

	const computePass = encoder.beginComputePass();
	computePass.setPipeline(state.computePipeline);
	computePass.setBindGroup(0, bindGroup);
	computePass.dispatchWorkgroups(4, 3);
	computePass.end();

	const commandBuffer = encoder.finish();

	device.queue.submit([commandBuffer]);
	await device.queue.onSubmittedWorkDone();
}
