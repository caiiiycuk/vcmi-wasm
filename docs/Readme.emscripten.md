# Web version of VCMI

This file was created to cover the special steps needed to build the web version.
The current cmake build supports only a Linux environment.

1. You need to install [emsdk](https://github.com/emscripten-core/emsdk)
2. Install Emscripten following the emsdk guide
3. Create a directory `emscripten` in the vcmi root and cd into it
4. Use emsdk and cmake to configure build script:

    ```
    emcmake cmake -GNinja -DCMAKE_BUILD_TYPE=MinSizeRel ..
    ```
   
    **NOTE**: Long story short, you must use MinSizeRel for optimal performance

5. Build some ports required by vcmi (this step is not required but because of an Emscripten bug you should do it before building vcmi)
   
   ```
   embuilder build sdl2 sdl2_ttf sdl2_image sdl2_mixer
   ```
   
6. Now build the required libraries

   ```
   ninja boost-lib tbb-lib minizip-ng-lib squish-lib
   ```
   
7. Finally, it is time to build vcmiclient.js:

   ```
   ninja -j<n> html5
   ```
   
   **NOTE**: Compilation will fail on boost/qvm/quat_traits.hpp; just add <Q> in the problematic lines.

Your build is now in the emscripten/html5 folder:

* **vcmiclient.[js,wasm]** - the game itself
* **vcmiclient.[data,data.js]** - data files required by the game + vcmi-extras

