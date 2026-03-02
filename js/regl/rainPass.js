import { loadImage, loadText, makePassFBO, makeDoubleBuffer, makePass, make1DTexture, makePassTexture } from "./utils.js";

const extractEntries = (src, keys) => Object.fromEntries(Array.from(Object.entries(src)).filter(([key]) => keys.includes(key)));

const rippleTypes = {
	box: 0,
	circle: 1,
};

const makeComputeDoubleBuffer = (regl, height, width) =>
	makeDoubleBuffer(regl, {
		width,
		height,
		wrapT: "clamp",
		type: "half float",
		data: Array(width * height * 4).fill(0) // The 'blue' channel starts at 0 for our static seed check
	});

const numVerticesPerQuad = 2 * 3;
const tlVert = [0, 0];
const trVert = [0, 1];
const blVert = [1, 0];
const brVert = [1, 1];
const quadVertices = [tlVert, trVert, brVert, tlVert, brVert, blVert];

export default ({ regl, config, lkg }) => {
// --- Universal Clipboard Integration ---
	let clipboardLength = 1;
	let clipboardTexture = makePassTexture(regl, false); 
	
	let seedRippleTime = -9999.0;
	let seedRipplePos = [0.5, 0.5];
	
	// NEW: Store the pasted text until the user clicks
	let stagedText = null;

	const updateClipboardTexture = (text, event) => {
		if (text && text.length > 0) {
			clipboardLength = text.length;
			const data = new Uint8Array(text.length * 4);
			for (let i = 0; i < text.length; i++) {
				data[i * 4] = text.charCodeAt(i);
				data[i * 4 + 1] = 0;
				data[i * 4 + 2] = 0;
				data[i * 4 + 3] = 255;
			}
			clipboardTexture = regl.texture({
				width: text.length,
				height: 1,
				data: data,
				format: "rgba",
				type: "uint8"
			});
			
			// Start the ripple timer and grab the click coordinates
			seedRippleTime = performance.now() / 1000.0;
			if (event && event.clientX !== undefined) {
				seedRipplePos = [event.clientX / window.innerWidth, 1.0 - (event.clientY / window.innerHeight)];
			} else {
				seedRipplePos = [0.5, 0.5]; 
			}
		}
	};

	// 1. Listen for manual pasting, but ONLY STAGE the text
	window.addEventListener("paste", (event) => {
		try {
			stagedText = (event.clipboardData || window.clipboardData).getData('text');
			console.log("Matrix Seed Staged! Click the screen to unleash the ripple.");
		} catch (err) {
			console.error("Paste failed", err);
		}
	});

	// 2. Detect Safari vs Chrome
	const isChrome = navigator.userAgent.includes("Chrome");
	const isSafari = navigator.userAgent.includes("Safari") && !isChrome;

	// 3. Universal Click Listener (The Trigger)
	window.addEventListener("click", async (event) => {
		// If we have text waiting from a Cmd+V paste, use it immediately
		if (stagedText) {
			console.log("Unleashing Staged Seed:", stagedText);
			updateClipboardTexture(stagedText, event);
			stagedText = null; // Clear it so we don't re-trigger it on the next click
		} 
		// Otherwise, if we are in Chrome and nothing is staged, auto-read the clipboard
		else if (!isSafari) {
			try {
				const text = await navigator.clipboard.readText();
				console.log("Matrix Seeded via Auto-Click:", text);
				updateClipboardTexture(text, event);
			} catch (err) {
				console.warn("Clipboard access denied. Ensure page is focused.", err);
			}
		}
	});
	// --- END Clipboard Integration ---
	
	const { mat2, mat4, vec2, vec3 } = glMatrix;

	const volumetric = config.volumetric;
	const density = volumetric && config.effect !== "none" ? config.density : 1;
	const [numRows, numColumns] = [config.numColumns, Math.floor(config.numColumns * density)];

	const [numQuadRows, numQuadColumns] = volumetric ? [numRows, numColumns] : [1, 1];
	const numQuads = numQuadRows * numQuadColumns;
	const quadSize = [1 / numQuadColumns, 1 / numQuadRows];

	const rippleType = config.rippleTypeName in rippleTypes ? rippleTypes[config.rippleTypeName] : -1;
	const slantVec = [Math.cos(config.slant), Math.sin(config.slant)];
	const slantScale = 1 / (Math.abs(Math.sin(2 * config.slant)) * (Math.sqrt(2) - 1) + 1);
	const showDebugView = config.effect === "none";

	const glyphTransform = mat2.fromScaling(mat2.create(), vec2.fromValues(config.glyphFlip ? -1 : 1, 1));
	mat2.rotate(glyphTransform, glyphTransform, (config.glyphRotation * Math.PI) / 180);

	const commonUniforms = {
		...extractEntries(config, ["animationSpeed", "glyphHeightToWidth", "glyphSequenceLength", "glyphTextureGridSize"]),
		numColumns,
		numRows,
		showDebugView,
	};

	const introDoubleBuffer = makeComputeDoubleBuffer(regl, 1, numColumns);
	const rainPassIntro = loadText("shaders/glsl/rainPass.intro.frag.glsl");
	const introUniforms = {
		...commonUniforms,
		...extractEntries(config, ["fallSpeed", "skipIntro"]),
	};
	const intro = regl({
		frag: regl.prop("frag"),
		uniforms: {
			...introUniforms,
			previousIntroState: introDoubleBuffer.back,
		},
		framebuffer: introDoubleBuffer.front,
	});

	const raindropDoubleBuffer = makeComputeDoubleBuffer(regl, numRows, numColumns);
	const rainPassRaindrop = loadText("shaders/glsl/rainPass.raindrop.frag.glsl");
	const raindropUniforms = {
		...commonUniforms,
		...extractEntries(config, ["brightnessDecay", "fallSpeed", "raindropLength", "loops", "skipIntro"]),
	};
	const raindrop = regl({
		frag: regl.prop("frag"),
		uniforms: {
			...raindropUniforms,
			introState: introDoubleBuffer.front,
			previousRaindropState: raindropDoubleBuffer.back,
		},
		framebuffer: raindropDoubleBuffer.front,
	});

	const symbolDoubleBuffer = makeComputeDoubleBuffer(regl, numRows, numColumns);
	const rainPassSymbol = loadText("shaders/glsl/rainPass.symbol.frag.glsl");
	
	const symbolUniforms = {
		...commonUniforms,
		// ADD "rippleSpeed" to this array so we can sync the math
		...extractEntries(config, ["cycleSpeed", "cycleFrameSkip", "loops", "rippleSpeed"]),
		clipboardTex: () => clipboardTexture,
		clipboardLen: () => clipboardLength,
		// ADD our new ripple tracking uniforms
		seedRippleTime: () => seedRippleTime,
		seedRipplePos: () => seedRipplePos,
		sysTime: () => performance.now() / 1000.0
	};
	const symbol = regl({
		frag: regl.prop("frag"),
		uniforms: {
			...symbolUniforms,
			raindropState: raindropDoubleBuffer.front,
			previousSymbolState: symbolDoubleBuffer.back,
		},
		framebuffer: symbolDoubleBuffer.front,
	});

	const effectDoubleBuffer = makeComputeDoubleBuffer(regl, numRows, numColumns);
	const rainPassEffect = loadText("shaders/glsl/rainPass.effect.frag.glsl");
	const effectUniforms = {
		...commonUniforms,
		...extractEntries(config, ["hasThunder", "rippleScale", "rippleSpeed", "rippleThickness", "loops"]),
		rippleType,
	};
	const effect = regl({
		frag: regl.prop("frag"),
		uniforms: {
			...effectUniforms,
			raindropState: raindropDoubleBuffer.front,
			previousEffectState: effectDoubleBuffer.back,
		},
		framebuffer: effectDoubleBuffer.front,
	});

	const quadPositions = Array(numQuadRows)
		.fill()
		.map((_, y) =>
			Array(numQuadColumns)
				.fill()
				.map((_, x) => Array(numVerticesPerQuad).fill([x, y]))
		);

	const glyphMSDF = loadImage(regl, config.glyphMSDFURL);
	const glintMSDF = loadImage(regl, config.glintMSDFURL);
	const baseTexture = loadImage(regl, config.baseTextureURL, true);
	const glintTexture = loadImage(regl, config.glintTextureURL, true);
	const rainPassVert = loadText("shaders/glsl/rainPass.vert.glsl");
	const rainPassFrag = loadText("shaders/glsl/rainPass.frag.glsl");
	const output = makePassFBO(regl, config.useHalfFloat);
	const renderUniforms = {
		...commonUniforms,
		...extractEntries(config, [
			"forwardSpeed",
			"glyphVerticalSpacing",
			"baseBrightness",
			"baseContrast",
			"glintBrightness",
			"glintContrast",
			"hasBaseTexture",
			"hasGlintTexture",
			"brightnessThreshold",
			"brightnessOverride",
			"isolateCursor",
			"isolateGlint",
			"glyphEdgeCrop",
			"isPolar",
		]),
		glyphTransform,
		density,
		numQuadColumns,
		numQuadRows,
		quadSize,
		slantScale,
		slantVec,
		volumetric,
	};
	const render = regl({
		blend: {
			enable: true,
			func: {
				src: "one",
				dst: "one",
			},
		},
		vert: regl.prop("vert"),
		frag: regl.prop("frag"),

		uniforms: {
			...renderUniforms,
			raindropState: raindropDoubleBuffer.front,
			symbolState: symbolDoubleBuffer.front,
			effectState: effectDoubleBuffer.front,
			glyphMSDF: glyphMSDF.texture,
			glintMSDF: glintMSDF.texture,
			baseTexture: baseTexture.texture,
			glintTexture: glintTexture.texture,
			msdfPxRange: 4.0,
			glyphMSDFSize: () => [glyphMSDF.width(), glyphMSDF.height()],
			glintMSDFSize: () => [glintMSDF.width(), glintMSDF.height()],
			camera: regl.prop("camera"),
			transform: regl.prop("transform"),
			screenSize: regl.prop("screenSize"),
		},
		viewport: regl.prop("viewport"),
		attributes: {
			aPosition: quadPositions,
			aCorner: Array(numQuads).fill(quadVertices),
		},
		count: numQuads * numVerticesPerQuad,
		framebuffer: output,
	});

	const screenSize = [1, 1];
	const transform = mat4.create();
	if (volumetric && config.isometric) {
		mat4.rotateX(transform, transform, (Math.PI * 1) / 8);
		mat4.rotateY(transform, transform, (Math.PI * 1) / 4);
		mat4.translate(transform, transform, vec3.fromValues(0, 0, -1));
		mat4.scale(transform, transform, vec3.fromValues(1, 1, 2));
	} else if (lkg.enabled) {
		mat4.translate(transform, transform, vec3.fromValues(0, 0, -1.1));
		mat4.scale(transform, transform, vec3.fromValues(1, 1, 1));
		mat4.scale(transform, transform, vec3.fromValues(0.15, 0.15, 0.15));
	} else {
		mat4.translate(transform, transform, vec3.fromValues(0, 0, -1));
	}
	const camera = mat4.create();

	const vantagePoints = [];

	return makePass(
		{
			primary: output,
		},
		Promise.all([
			glyphMSDF.loaded,
			glintMSDF.loaded,
			baseTexture.loaded,
			glintTexture.loaded,
			rainPassIntro.loaded,
			rainPassRaindrop.loaded,
			rainPassSymbol.loaded,
			rainPassVert.loaded,
			rainPassFrag.loaded,
		]),
		(w, h) => {
			output.resize(w, h);
			const aspectRatio = w / h;

			const [numTileColumns, numTileRows] = [lkg.tileX, lkg.tileY];
			const numVantagePoints = numTileRows * numTileColumns;
			const tileWidth = Math.floor(w / numTileColumns);
			const tileHeight = Math.floor(h / numTileRows);
			vantagePoints.length = 0;
			for (let row = 0; row < numTileRows; row++) {
				for (let column = 0; column < numTileColumns; column++) {
					const index = column + row * numTileColumns;
					const camera = mat4.create();

					if (volumetric && config.isometric) {
						if (aspectRatio > 1) {
							mat4.ortho(camera, -1.5 * aspectRatio, 1.5 * aspectRatio, -1.5, 1.5, -1000, 1000);
						} else {
							mat4.ortho(camera, -1.5, 1.5, -1.5 / aspectRatio, 1.5 / aspectRatio, -1000, 1000);
						}
					} else if (lkg.enabled) {
						mat4.perspective(camera, (Math.PI / 180) * lkg.fov, lkg.quiltAspect, 0.0001, 1000);

						const distanceToTarget = -1;
						let vantagePointAngle = (Math.PI / 180) * lkg.viewCone * (index / (numVantagePoints - 1) - 0.5);
						if (isNaN(vantagePointAngle)) {
							vantagePointAngle = 0;
						}
						const xOffset = distanceToTarget * Math.tan(vantagePointAngle);

						mat4.translate(camera, camera, vec3.fromValues(xOffset, 0, 0));

						camera[8] = -xOffset / (distanceToTarget * Math.tan((Math.PI / 180) * 0.5 * lkg.fov) * lkg.quiltAspect);
					} else {
						mat4.perspective(camera, (Math.PI / 180) * 90, aspectRatio, 0.0001, 1000);
					}

					const viewport = {
						x: column * tileWidth,
						y: row * tileHeight,
						width: tileWidth,
						height: tileHeight,
					};
					vantagePoints.push({ camera, viewport });
				}
			}
			[screenSize[0], screenSize[1]] = aspectRatio > 1 ? [1, aspectRatio] : [1 / aspectRatio, 1];
		},
		(shouldRender) => {
			intro({ frag: rainPassIntro.text() });
			raindrop({ frag: rainPassRaindrop.text() });
			symbol({ frag: rainPassSymbol.text() });
			effect({ frag: rainPassEffect.text() });

			if (shouldRender) {
				regl.clear({
					depth: 1,
					color: [0, 0, 0, 1],
					framebuffer: output,
				});

				for (const vantagePoint of vantagePoints) {
					render({ ...vantagePoint, transform, screenSize, vert: rainPassVert.text(), frag: rainPassFrag.text() });
				}
			}
		}
	);
};