//
// Created by caiiiycuk on 22.01.25.
//

#ifndef PARALLEL_FOR_H
#define PARALLEL_FOR_H

#ifdef VCMI_HTML5_BUILD
#include <tbb/parallel_for.h>
#include "html5/html5.h"

namespace vcmi {
    template<typename Value>
    using blocked_range = tbb::blocked_range<Value>;
    template<typename R, typename B>
    void parallel_for(R r, B fn) {
        if (html5::isMainThread()) {
            fn(r);
        } else {
            tbb::parallel_for(tbb::blocked_range(r.begin(), r.end(),
                std::max((r.end() - r.begin() / 4), r.grainsize())), fn);
        }
    }
}
#else
#include <tbb/parallel_for.h>
namespace vcmi {
    template<typename Value>
    using blocked_range = tbb::blocked_range<Value>;
    template <typename... Args>
    auto parallel_for(Args&&... args) -> decltype(tbb::parallel_for(std::forward<Args>(args)...)) {
        return tbb::parallel_for(std::forward<Args>(args)...);
    }
}
#endif


#endif //PARALLEL_FOR_H
