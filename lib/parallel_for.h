//
// Created by caiiiycuk on 22.01.25.
//

#ifndef PARALLEL_FOR_H
#define PARALLEL_FOR_H

#ifdef VCMI_HTML5_BUILD
#include <tbb/parallel_for.h>
#include "html5/html5.h"
#include <atomic>

namespace vcmi {
    template<typename Value>
    using blocked_range = tbb::blocked_range<Value>;
    template<typename R, typename B>
    void parallel_for(R r, B fn, bool must_use_tbb = false) {
        bool mainThread = html5::isMainThread();
        if (must_use_tbb) {
            if (mainThread) {
                printf("Must use tbb::, but we are in main thread\n");
                abort();
            }

            tbb::parallel_for(tbb::blocked_range(r.begin(), r.end(),
                std::max((r.end() - r.begin() / 4), r.grainsize())), fn);
            return;
        }

        static std::atomic_bool pool_used = false;
        if (mainThread || pool_used) {
            fn(r);
        } else {
            pool_used = true;
            tbb::parallel_for(tbb::blocked_range(r.begin(), r.end(),
                std::max((r.end() - r.begin() / 4), r.grainsize())), fn);
            pool_used = false;
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
