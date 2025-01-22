//
// Created by caiiiycuk on 22.01.25.
//

#ifndef PARALLEL_FOR_H
#define PARALLEL_FOR_H

#ifdef VCMI_HTML5_BUILD
namespace vcmi {
    template<typename Value>
    class blocked_range {
        Value _begin;
        Value _end;

    public:
        blocked_range(const Value& begin, const Value& end, int grain_size = 1):
            _begin(begin), _end(end) {}

        const Value& begin() const { return _begin; }
        const Value& end() const { return _end; }


    };
    template<typename R, typename B>
    void parallel_for(R r, B fn) {
        fn(r);
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
