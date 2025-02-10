//
// Created by caiiiycuk on 28.11.24.
//

#pragma once

#include "../StdInc.h"
#include <SDL2/SDL_surface.h>

#ifdef EMSCRIPTEN
#include "Point.h"
#endif

VCMI_LIB_NAMESPACE_BEGIN

namespace html5 {
    void fsUpdate(const char* path);
    bool isPngImage(unsigned char* data, int length);
    SDL_Surface* loadPng(unsigned char* data, int length, const char* filename);
    void savePng(SDL_Surface *surf, const char* filename);
    bool isMobile();
    bool isMainThread();
#ifdef EMSCRIPTEN
    Point getPreferredWindowResolution();
#endif
}

VCMI_LIB_NAMESPACE_END

