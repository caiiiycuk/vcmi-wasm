//
// Created by caiiiycuk on 28.11.24.
//
#include "html5.h"
#ifdef EMSCRIPTEN
#include <emscripten.h>
#endif

VCMI_LIB_NAMESPACE_BEGIN

void html5::fsUpdate(const char* path) {
	std::ifstream infile(path);
   	if (!infile.is_open()) {
          assert(false);
   	}
	infile.seekg(0, std::ios::end);
	size_t length = infile.tellg();
	infile.seekg(0, std::ios::beg);

    char* buffer = (char*) malloc(length);
	infile.read(buffer, length);

#ifdef EMSCRIPTEN
 	MAIN_THREAD_EM_ASM((
		if (Module.fsUpdate) {
			Module.fsUpdate($0, $1, $2);
		}
  	), path, buffer, length);
#endif
}

VCMI_LIB_NAMESPACE_END