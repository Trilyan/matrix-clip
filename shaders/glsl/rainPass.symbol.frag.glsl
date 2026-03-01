precision highp float;

// This shader governs the glyphs appearing in the rain.
// It writes each glyph's state to the channels of a data texture:
// 		R: symbol
// 		G: age
// 		B: stored clipboard seed
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

// Main function matching the 6 arguments passed from main()
vec4 computeResult(float simTime, bool isFirstFrame, vec2 glyphPos, vec2 screenPos, vec4 previous, vec4 raindrop) {
    float previousSymbol = previous.r;
    float previousAge = previous.g;
    float storedCharVal = previous.b; // We use the 'blue' channel to store the last seed

    // Get current clipboard data
    float safeLen = max(clipboardLen, 1.0);
    float charIndex = mod(floor(glyphPos.x * 12.34) + glyphPos.y, safeLen);
    float charVal = texture2D(clipboardTex, vec2((charIndex + 0.5) / safeLen, 0.5)).r;
    
    // Use fract() to keep the numbers small so the GPU doesn't panic
    vec2 seedOffset = fract(vec2(charVal * 12.345, charVal * 98.765)) * 100.0;
    
    // Check if the clipboard data has changed since the last frame
    bool clipboardChanged = abs(charVal - storedCharVal) > 0.001;

    // Define when a glyph naturally resets (first frame or if the falling drop loops)
    bool resetGlyph = isFirstFrame || (previousAge > raindrop.g);

    // Normal logic: reset if the glyph is new OR if the clipboard just changed
    if (resetGlyph || clipboardChanged) {
        previousAge = raindrop.g; // Sync age
        previousSymbol = floor(glyphSequenceLength * randomFloat(screenPos + seedOffset));
    } else if (cycleSpeed > 0.0 && mod(tick, cycleFrameSkip) < 1.0) {
        previousSymbol = floor(glyphSequenceLength * randomFloat(screenPos + tick + seedOffset));
    }

    // Save the current character value into the Blue channel and RETURN it
    return vec4(previousSymbol, previousAge, charVal, 1.0);
}

void main()	{
	float simTime = time * animationSpeed;
	bool isFirstFrame = tick <= 1.;
	vec2 glyphPos = gl_FragCoord.xy;
	vec2 screenPos = glyphPos / vec2(numColumns, numRows);
	
	vec4 previous = texture2D( previousSymbolState, screenPos );
	vec4 raindrop = texture2D( raindropState, screenPos );
	
	// Pass all 6 arguments to computeResult
	gl_FragColor = computeResult(simTime, isFirstFrame, glyphPos, screenPos, previous, raindrop);
}