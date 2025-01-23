#!/bin/bash

set -ex

# build vcmi-wasm
ninja -j32 html5

# cleanup
rm -rf ../../vcmi-html5-launcher/public/vcmi/
mkdir ../../vcmi-html5-launcher/public/vcmi/

cp html5/vcmi* ../../vcmi-html5-launcher/public/vcmi/

#copy Mp3
cp -r ../data/Mp3 ../../vcmi-html5-launcher/public/vcmi/Mp3/

#copy additional data
cp -rf *.data* ../../vcmi-html5-launcher/public/vcmi/
