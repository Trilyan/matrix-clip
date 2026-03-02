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

// --- NEW: Ripple Uniforms ---
uniform float rippleSpeed;
uniform float seedRippleTime;
uniform vec2 seedRipplePos;
uniform float sysTime;
// ----------------------------

uniform bool loops;
uniform bool showDebugView;
uniform float glyphSequenceLength;

highp float randomFloat( const in vec2 uv ) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
    return fract(sin(sn) * c);
}

vec4 computeResult(float simTime, bool isFirstFrame, vec2 glyphPos, vec2 uvPos, vec4 previous, vec4 raindrop) {
    vec2 cellPos = floor(glyphPos);
    
    float previousSymbol = previous.r;
    float previousAge = previous.g;
    float storedCharVal = previous.b; // The current ACTIVE seed for this pixel

    // Read the TARGET clipboard texture (what you just copied)
    float safeLen = max(clipboardLen, 1.0);
    float charIndex = mod(floor(glyphPos.x * 12.34) + glyphPos.y, safeLen);
    float targetCharVal = texture2D(clipboardTex, vec2((charIndex + 0.5) / safeLen, 0.5)).r;
    
    // ---- THE RIPPLE LOGIC ----
    float activeCharVal = storedCharVal;
    
    // Adjust for screen width/height so the ripple is a perfect circle, not an oval
    vec2 aspect = vec2(numColumns / numRows, 1.0);
    float distToClick = distance(uvPos * aspect, seedRipplePos * aspect);
    
    // Calculate the expanding circle's radius based on elapsed time
    float elapsedTime = sysTime - seedRippleTime;
    float currentRippleRadius = elapsedTime * max(rippleSpeed, 1.0) * 1.5; 
    
    // If the ripple boundary has washed over this pixel, upgrade to the target seed!
    if (distToClick < currentRippleRadius) {
        activeCharVal = targetCharVal;
    }
    // --------------------------

    vec2 seedOffset = fract(vec2(activeCharVal * 12.345, activeCharVal * 98.765)) * 100.0;
    
    // Did this pixel just get hit by the ripple *this exact frame*?
    bool clipboardChanged = abs(activeCharVal - storedCharVal) > 0.001;
    bool resetGlyph = isFirstFrame || (previousAge != raindrop.g);

    if (resetGlyph || clipboardChanged) {
        previousAge = raindrop.g;
        previousSymbol = floor(glyphSequenceLength * randomFloat(cellPos + seedOffset));
    } else if (cycleSpeed > 0.0 && mod(tick, cycleFrameSkip) < 1.0) {
        previousSymbol = floor(glyphSequenceLength * randomFloat(cellPos + vec2(tick, tick) + seedOffset));
    }

    // Save the ACTIVE character value into the Blue channel
    return vec4(previousSymbol, previousAge, activeCharVal, 1.0);
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