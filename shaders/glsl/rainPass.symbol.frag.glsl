precision highp float;

// This shader governs the glyphs appearing in the rain.
// It writes each glyph's state to the channels of a data texture:
// 		R: symbol
// 		G: age
// 		B: unused
// 		A: unused

#define PI 3.14159265359

uniform sampler2D previousSymbolState, raindropState;

// --- NEW: Our Clipboard Uniforms ---
uniform sampler2D clipboardTex;
uniform float clipboardLen;

uniform float numColumns, numRows;
uniform float time, tick, cycleFrameSkip;
uniform float animationSpeed, cycleSpeed;
uniform bool loops, showDebugView;
uniform float glyphSequenceLength;

// Helper functions for generating randomness, borrowed from elsewhere
highp float randomFloat( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}

// Main function
vec4 computeResult(float simTime, bool isFirstFrame, vec2 glyphPos, vec2 screenPos, vec4 previous, vec4 raindrop) {

	float previousSymbol = previous.r;
	float previousAge = previous.g;
	bool resetGlyph = isFirstFrame;
	if (loops) {
		resetGlyph = resetGlyph || raindrop.r <= 0.;
	}

	// --- NEW: Extract a seed from the clipboard texture ---
	// Safely wrap the index based on clipboard length
	float safeLen = max(clipboardLen, 1.0);
	
	// Sample a different letter of the clipboard for different parts of the screen
	float charIndex = mod(floor(glyphPos.x * 12.34) + glyphPos.y, safeLen);
	float u = (charIndex + 0.5) / safeLen;
	
	// Get the ASCII value from the texture (0.0 to 1.0)
	float charVal = texture2D(clipboardTex, vec2(u, 0.5)).r;
	
	// Multiply by large numbers to create drastically different "seed offsets" 
	// based on the specific text in the clipboard.
	// If charVal is 0 (no clipboard read yet), seedOffset is vec2(0, 0).
	vec2 seedOffset = vec2(charVal * 123.456, charVal * 987.654);

	if (resetGlyph) {
		// Inject the clipboard seed offset into the randomness
		previousAge = randomFloat(screenPos + 0.5 + seedOffset);
		previousSymbol = floor(glyphSequenceLength * randomFloat(screenPos + seedOffset));
	}
	
	float cycleSpeed = animationSpeed * cycleSpeed;
	float age = previousAge;
	float symbol = previousSymbol;
	
	if (mod(tick, cycleFrameSkip) == 0.) {
		age += cycleSpeed * cycleFrameSkip;
		if (age >= 1.) {
			// Inject the clipboard seed offset here as well
			symbol = floor(glyphSequenceLength * randomFloat(screenPos + simTime + seedOffset));
			age = fract(age);
		}
	}

	vec4 result = vec4(symbol, age, 0., 0.);
	return result;
}

void main()	{
	float simTime = time * animationSpeed;
	bool isFirstFrame = tick <= 1.;
	vec2 glyphPos = gl_FragCoord.xy;
	vec2 screenPos = glyphPos / vec2(numColumns, numRows);
	vec4 previous = texture2D( previousSymbolState, screenPos );
	vec4 raindrop = texture2D( raindropState, screenPos );
	gl_FragColor = computeResult(simTime, isFirstFrame, glyphPos, screenPos, previous, raindrop);
}