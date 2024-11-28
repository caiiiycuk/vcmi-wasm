//
// Created by caiiiycuk on 28.11.24.
//
#ifdef EMSCRIPTEN

#include "html5.h"
#include <emscripten.h>

VCMI_LIB_NAMESPACE_BEGIN

EM_JS(void, emFsUpdate, (const char *path), {
	if (Module.fsUpdate) {
		Module.fsUpdate(path);
	}
});

void html5::fsUpdate(const char* path) {
  emFsUpdate(path);
}


VCMI_LIB_NAMESPACE_END

#endif