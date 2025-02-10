//
// Created by caiiiycuk on 28.11.24.
//
#include "html5.h"
#ifdef EMSCRIPTEN
#include <emscripten.h>
#endif

#define STB_IMAGE_IMPLEMENTATION
#include <SDL2/SDL_surface.h>

#include "./stb_image.h"

VCMI_LIB_NAMESPACE_BEGIN

namespace {
    SDL_Surface *copySurface(SDL_Surface *surf) {
        SDL_Surface *copy = SDL_CreateRGBSurfaceWithFormat(0, surf->w, surf->h, surf->format->BitsPerPixel,
                                                           surf->format->format);
        if (surf->format->palette) {
            SDL_SetSurfacePalette(copy, surf->format->palette);
        }

        SDL_BlitSurface(surf, NULL, copy, NULL);
        return copy;
    }
}

void html5::fsUpdate(const char *path) {
    std::ifstream infile(path);
    if (!infile.is_open()) {
        assert(false);
    }
    infile.seekg(0, std::ios::end);
    size_t length = infile.tellg();
    infile.seekg(0, std::ios::beg);

    char *buffer = (char *) malloc(length);
    infile.read(buffer, length);

#ifdef EMSCRIPTEN
 	MAIN_THREAD_EM_ASM((
		if (Module.fsUpdate) {
			Module.fsUpdate($0, $1, $2);
		}
  	), path, buffer, length);
#endif
}

stbi_uc *vcmi_png_palette_indexes;
stbi_uc *vcmi_png_palette;
int vcmi_png_palette_len;
int vcmi_png_palette_n;

std::unordered_map<std::string, SDL_Surface *> generatedSurfaces;

SDL_Surface *html5::loadPng(unsigned char *bytes, int length, const char *filename) {
    if (generatedSurfaces.find(filename) != generatedSurfaces.end()) {
        return copySurface(generatedSurfaces[filename]);
    }
    int width, height, n;
    vcmi_png_palette_indexes = nullptr;
    vcmi_png_palette = nullptr;
    vcmi_png_palette_len = 0;
    vcmi_png_palette_n = 0;
    unsigned char *data = stbi_load_from_memory((stbi_uc const *) bytes, length,
                                                &width, &height, &n, 0);
    if (vcmi_png_palette_indexes) {
        stbi_image_free(data);

        SDL_Surface *surface = SDL_CreateRGBSurfaceWithFormat(0, width, height, 8, SDL_PIXELFORMAT_INDEX8);
        for (int y = 0; y < height; y++) {
            memcpy((unsigned char *) surface->pixels + y * surface->pitch, vcmi_png_palette_indexes + width * y, width);
        }

        SDL_Color colors[vcmi_png_palette_len];
        for (int i = 0; i < vcmi_png_palette_len; i++) {
            int base = i * 4;
            colors[i].r = vcmi_png_palette[base];
            colors[i].g = vcmi_png_palette[base + 1];
            colors[i].b = vcmi_png_palette[base + 2];
        }
        SDL_SetPaletteColors(surface->format->palette, colors, 0, vcmi_png_palette_len);

        free(vcmi_png_palette_indexes);
        free(vcmi_png_palette);
        return surface;
    } else {
        if (n == 1) {
            // grey
            stbi_image_free(data);

            data = stbi_load_from_memory((stbi_uc const *) bytes, length, &width,
                                         &height, &n, 3);
            n = 3;
        } else if (n == 2) {
            // grey + alpha
            stbi_image_free(data);

            data = stbi_load_from_memory((stbi_uc const *) bytes, length, &width,
                                         &height, &n, 4);
            n = 4;
        }
        SDL_Surface *surface = nullptr;
        if (n > 2) {
            surface = SDL_CreateRGBSurface(0,
                                           width, height, n * 8,
                                           0x000000FF, 0x0000FF00, 0x00FF0000, 0xFF000000);
            for (int y = 0; y < height; y++) {
                memcpy((unsigned char *) surface->pixels + y * surface->pitch, data + width * y * n, width * n);
            }
        } else {
            assert(false);
        }
        stbi_image_free(data);
        return surface;
    }
}

void html5::savePng(SDL_Surface *surf, const char *filename) {
    if (generatedSurfaces.find(filename) != generatedSurfaces.end()) {
        delete generatedSurfaces[filename];
    } else {
        FILE *f = fopen(filename, "wb");
        if (f) {
            unsigned char pngMagic[] = {
                // png magic
                0x89, 0x50, 0x4E, 0x47,
                // is pcx test
                0, 0, 0, 0, 0, 0, 0, 0
            };
            fwrite(pngMagic, 1, sizeof(pngMagic), f);
            fclose(f);
        }
    }
    generatedSurfaces[filename] = copySurface(surf);
}

bool html5::isPngImage(unsigned char *data, int length) {
    return length > 3 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4e && data[3] == 0x47;
}

#ifdef EMSCRIPTEN
EM_JS(bool, jsMainThread, (), {
    return typeof importScripts === 'function';
});
EM_JS(bool, jsMobile, (), {
    return typeof importScripts === 'function';
});
#endif

bool html5::isMainThread() {
#ifdef EMSCRIPTEN
    return jsMainThread();
#else
    return false;
#endif
}

bool html5::isMobile() {
#ifdef EMSCRIPTEN
    return jsMobile();
#else
    return false;
#endif
}

#ifdef EMSCRIPTEN
Point html5::getPreferredWindowResolution() {
    auto width = EM_ASM_INT((
        return Module.getWidth();
    ));
    auto height = EM_ASM_INT((
        return Module.getHeight();
    ));
    return Point(width, height);
}
#endif


VCMI_LIB_NAMESPACE_END
