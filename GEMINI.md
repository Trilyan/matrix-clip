Overview
  The project is a high-quality "Matrix" digital rain simulation that supports multiple renderers and
  platforms.


  Core Technologies
   * WebGPU & WebGL (regl): The project implements the effect using both modern WebGPU and the regl library for
     WebGL.
   * MSDF (Multi-channel Signed Distance Fields): Used for rendering perfectly crisp glyphs at any scale. The
     MSDF textures (like matrixcode_msdf.png) are processed in the fragment shaders to produce sharp edges.
   * GPGPU Computation: In the WebGL/WebGPU versions, the simulation state (raindrop positions, brightness,
     glyph cycling) is computed entirely on the GPU using multiple render passes that write to floating-point
     Frame Buffer Objects (FBOs).


  Render Pipeline (Web versions)
   1. Intro Pass: Manages the initial "wake up" animation of the columns.
   2. Raindrop Pass: Calculates falling brightness, "cursor" (the bright lead glyph), and trailing effects
      using fract and sine functions.
   3. Symbol Pass: Decides which glyph to display in each cell, handling the periodic cycling of characters.
   4. Effect Pass: Adds dynamic overlays like thunder flashes or ripples.
   5. Final Render: Combines all data textures to draw the actual glyphs using MSDF.


  Key Features
   * Config System: A robust system in js/config.js allows for extensive customization (fonts, colors, speeds,
     bloom, slant, etc.) via URL parameters.
   * Clipboard Seeding: A unique feature where users can "seed" the matrix with text from their clipboard,
     triggering a ripple effect that updates the glyphs with the pasted characters.
   * Volumetric Mode: A 3D mode where raindrops appear with perspective and depth.
