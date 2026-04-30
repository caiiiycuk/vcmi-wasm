#!/bin/bash

set -ex
if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION="$1"

pushd emscripten

# build vcmi-wasm
ninja -j32 html5

# compress wasm
rm -rf tmp
mkdir -p tmp

brotli -Z html5/vcmilauncher.wasm -o tmp/vcmilauncher.wasm
brotli -Z html5/vcmiclient.wasm -o tmp/vcmiclient.wasm
brotli -Z html5/vcmiclient.data -o tmp/vcmiclient.data

rm html5/vcmiclient.wasm html5/vcmilauncher.wasm html5/vcmiclient.data 

# publish wasm
aws s3 --endpoint-url=https://storage.yandexcloud.net sync --acl public-read \
    tmp s3://br-bundles/vcmi/dosvcmi-$VERSION --delete
rm -rf tmp

sed -i "s|window.VCMI_WASM_URL\s*=.*|window.VCMI_WASM_URL = 'https://br.cdn.dos.zone/vcmi/dosvcmi-$VERSION/vcmilauncher.wasm';|g" html5/launcher.html
sed -i "s|window.VCMI_DATA_URL\s*=.*|window.VCMI_DATA_URL = 'https://br.cdn.dos.zone/vcmi/dosvcmi-$VERSION/vcmiclient.data';|g" html5/launcher.html

sed -i "s|vcmiclient-v[0-9]\+|dosvcmi-$VERSION|g" html5/game.html

# publish js
aws s3 --endpoint-url=https://storage.yandexcloud.net sync --acl public-read \
    html5 s3://dos.zone/vcmi/dosvcmi-$VERSION --delete

popd