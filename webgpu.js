'use strict';

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
			@group(0) @binding(0)
			var<uniform> sceneData: SceneData;
			
			@group(0) @binding(1)
			var screenBuffer: texture_storage_2d<${presentationFormat}, write>;

			struct SceneData {
				triCount: u32
			}

			struct Vertex {
				position: vec4<f32>,
				normal: vec4<f32>,
				color: vec4<f32>,
				uv: vec4<f32>,
			};

			struct Triangle {
				verts: array<Vertex, 3>
			};

			@group(0) @binding(2)
			var<storage> triangle_list: array<Triangle>;

			@compute
			@workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
			fn computeMain(@builtin(global_invocation_id) invokeId: vec3u) {
				let tileIdx = invokeId.x + invokeId.y * ${TILES_X.toFixed(0)};

				// let triCount = u32(1);//arrayLength(&triangle_list);

				let tilePxStart = vec2<u32>(invokeId.x * ${TILE_SIZE}, invokeId.y * ${TILE_SIZE});
				let tilePxEnd = tilePxStart + vec2<u32>(${TILE_SIZE} - 1, ${TILE_SIZE} - 1);
				// let tilePxEnd = tilePxStart + vec2<u32>(2 - 1, 2 - 1);

				for (var t: u32 = 0; t < sceneData.triCount; t = t + 1) {
					// Get random color base on triangle index
					let tri = triangle_list[t];
					let triCol = tri.verts[0].color;

					let ab = tri.verts[1].position - tri.verts[0].position;
					let bc = tri.verts[2].position - tri.verts[1].position;
					let ca = tri.verts[0].position - tri.verts[2].position;

					let n1 = vec2<f32>(-ab.y, ab.x);
					let n2 = vec2<f32>(-bc.y, bc.x);
					let n3 = vec2<f32>(-ca.y, ca.x);

					// Get triangle bounds.
					let boundsMin = min(min(tri.verts[0].position.xy, tri.verts[1].position.xy), tri.verts[2].position.xy);
					let boundsMax = max(max(tri.verts[0].position.xy, tri.verts[1].position.xy), tri.verts[2].position.xy);

					let boundsMinPx = vec2<u32>(boundsMin * vec2<f32>(${SCREEN_WIDTH}, ${SCREEN_HEIGHT}));
					let boundsMaxPx = vec2<u32>(boundsMax * vec2<f32>(${SCREEN_WIDTH}, ${SCREEN_HEIGHT}));

					// Clamp triangle to tile.
					let actualTilePxStart = max(tilePxStart, boundsMinPx);
					let actualTilePxEnd = min(tilePxEnd, boundsMaxPx);


					// NOTE: Dynamic loop is ~2x slower than static loop, but culling here improves perf overall.
					
					// for (var i: u32 = 0; i < ${TILE_SIZE}; i = i + 1) {
					for (var pixelX: u32 = actualTilePxStart.x; pixelX <= actualTilePxEnd.x; pixelX = pixelX + 1) {
						// let pixelX = invokeId.x * ${TILE_SIZE} + i;
						let pixelX_u = f32(pixelX) / 512.0;

						for (var pixelY: u32 = actualTilePxStart.y; pixelY <= actualTilePxEnd.y; pixelY = pixelY + 1) {
							// let pixelY = invokeId.y * ${TILE_SIZE} + j;
							let pixelY_v = f32(pixelY) / 384.0;
							let p = vec2f(pixelX_u, pixelY_v);

							let ap = p - tri.verts[0].position.xy;
							let bp = p - tri.verts[1].position.xy;
							let cp = p - tri.verts[2].position.xy;

							let dot1 = dot(ap, n1);
							let dot2 = dot(bp, n2);
							let dot3 = dot(cp, n3);

							var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

							if (dot1 >= 0.0 && dot2 >= 0.0 && dot3 >= 0.0) {
								// color = vec4<f32>(pixelX_u, pixelY_v, 0.0, 1.0);
								color = triCol;
								textureStore(screenBuffer, vec2<u32>(pixelX, pixelY), color);
							}

							// let color = vec4<f32>(f32(tileIdx) / ${TILES_COUNT.toFixed(0)}, 0, 0, 1);
							// let color = vec4<f32>(f32(invokeId.x) / ${TILES_X}, f32(invokeId.y) / ${TILES_Y}, 0, 1);
						}
					}

				}
				
				// Tile border, debug.
				for (var p: u32 = 0; p < ${TILE_SIZE}; p = p + 1) {
					textureStore(screenBuffer, vec2<u32>(tilePxStart.x + p, tilePxStart.y), vec4<f32>(0.2, 0.2, 0.2, 1.0));
					textureStore(screenBuffer, vec2<u32>(tilePxStart.x, tilePxStart.y + p), vec4<f32>(0.2, 0.2, 0.2, 1.0));
				}
			}
		`,
	});

	// const bindGroupLayout = device.createBindGroupLayout({
	// 	label: 'Bind group layout',
	// 	entries: [
	// 		{
	// 			binding: 0,
	// 			visibility: GPUShaderStage.COMPUTE,
	// 			buffer: { type: 'storage' },
	// 		},
	// 	],
	// });

	// const screenBuffer = device.createBuffer({
	// 	size: SCREEN_PIXELS_COUNT * 4,
	// 	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
	// });

	// const stagingBuffer = device.createBuffer({
	// 	size: SCREEN_PIXELS_COUNT * 4,
	// 	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	// });

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
		],
	});

	device.queue.writeBuffer(state.sceneData, 0, state.sceneDataRaw);
	device.queue.writeBuffer(state.triangleBuffer, 0, state.tempTriBuffer);

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
