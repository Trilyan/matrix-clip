precision highp float;

#define PI 3.14159265359

uniform sampler2D previousSymbolState;
uniform sampler2D raindropState;
uniform sampler2D clipboardTex;

uniform float clipboardLen;
uniform float numColumns;
uniform float numRows;
uniform float time;
uniform float tick;
uniform float cycleFrameSkip;
uniform float animationSpeed;
uniform float cycleSpeed;
uniform bool loops;
uniform bool showDebugView;
uniform float glyphSequenceLength;

highp float randomFloat( const in vec2 uv ) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
    return fract(sin(sn) * c);
}

// Kept unflattened, matching the 6 arguments passed from main exactly
vec4 computeResult(float simTime, bool isFirstFrame, vec2 glyphPos, vec2 uvPos, vec4 previous, vec4 raindrop) {
    // Isolate the integer pixel position for distinct random seeds
    vec2 cellPos = floor(glyphPos);
    
    float previousSymbol = previous.r;
    float previousAge = previous.g;
    float storedCharVal = previous.b;

    // Safely read the clipboard texture
    float safeLen = max(clipboardLen, 1.0);
    float charIndex = mod(floor(glyphPos.x * 12.34) + glyphPos.y, safeLen);
    float charVal = texture2D(clipboardTex, vec2((charIndex + 0.5) / safeLen, 0.5)).r;
    
    // Keep numbers small so the GPU random generator doesn't overflow
    vec2 seedOffset = fract(vec2(charVal * 12.345, charVal * 98.765)) * 100.0;
    
    bool clipboardChanged = abs(charVal - storedCharVal) > 0.001;
    bool resetGlyph = isFirstFrame || (previousAge != raindrop.g);

    if (resetGlyph || clipboardChanged) {
        previousAge = raindrop.g;
        previousSymbol = floor(glyphSequenceLength * randomFloat(cellPos + seedOffset));
    } else if (cycleSpeed > 0.0 && mod(tick, cycleFrameSkip) < 1.0) {
        // STRICT CASTING: vec2(tick, tick) ensures the GPU compiler doesn't choke on type mismatches
        previousSymbol = floor(glyphSequenceLength * randomFloat(cellPos + vec2(tick, tick) + seedOffset));
    }

    return vec4(previousSymbol, previousAge, charVal, 1.0);
}

void main() {
    float simTime = time * animationSpeed;
    bool isFirstFrame = (tick <= 1.0);
    vec2 glyphPos = gl_FragCoord.xy;
    vec2 uvPos = glyphPos / vec2(numColumns, numRows);
    
    vec4 previous = texture2D(previousSymbolState, uvPos);
    vec4 raindrop = texture2D(raindropState, uvPos);
    
    gl_FragColor = computeResult(simTime, isFirstFrame, glyphPos, uvPos, previous, raindrop);
}