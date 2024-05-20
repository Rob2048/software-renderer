async function mainWebGpu() {
	// https://codelabs.developers.google.com/your-first-webgpu-app#6
	if (!navigator.gpu) {
		throw new Error('WebGPU not supported');
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error('No adapter found');
	}

	const device = await adapter.requestDevice();

	const context = canvas.getContext('webgpu');
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: device,
		format: canvasFormat,
	});

	const vertices = new Float32Array([
		-0.8, -0.8, 0.8, -0.8, 0.8, 0.8,

		-0.8, -0.8, 0.8, 0.8, -1.0, 1.0,
	]);

	const vertexBuffer = device.createBuffer({
		label: 'Cell vertices',
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});

	device.queue.writeBuffer(vertexBuffer, 0, vertices);

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [
			{
				format: 'float32x2',
				offset: 0,
				shaderLocation: 0,
			},
		],
	};

	const cellShaderModule = device.createShaderModule({
		label: 'Cell shader',
		code: `
			@vertex
			fn vertexMain(@location(0) pos: vec2f) -> @builtin(position) vec4f {
				return vec4(pos, 0, 1);
			}

			@fragment
			fn fragmentMain() -> @location(0) vec4f {
				return vec4f(1, 0, 0, 1);
			}
		`,
	});

	const cellPipeline = device.createRenderPipeline({
		label: 'Cell pipeline',
		layout: 'auto',
		vertex: {
			module: cellShaderModule,
			entryPoint: 'vertexMain',
			buffers: [vertexBufferLayout],
		},
		fragment: {
			module: cellShaderModule,
			entryPoint: 'fragmentMain',
			targets: [{ format: canvasFormat }],
		},
	});

	const encoder = device.createCommandEncoder();

	const contextTextureView = context.getCurrentTexture().createView();

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view: contextTextureView,
				loadOp: 'clear',
				clearValue: { r: 0.3, g: 0.3, b: 0.4, a: 1 },
				storeOp: 'store',
			},
		],
	});

	pass.setPipeline(cellPipeline);
	pass.setVertexBuffer(0, vertexBuffer);
	pass.draw(vertices.length / 2);

	pass.end();

	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);
}

// mainWebGpu();