#!/bin/bash

set -ex

servez emscripten/html5 --port 443 -S --shared-array-buffers
