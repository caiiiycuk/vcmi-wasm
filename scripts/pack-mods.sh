set -ex

~/sdk/emsdk/emsdk_env.sh
python3 "${EMSDK}/upstream/emscripten/tools/file_packager.py" \
  vcmi.mods.data --no-node --from-emcc \
  --preload ~/.local/share/vcmi/Maps@/Maps \
  --preload ~/.local/share/vcmi/Mods@/Mods \
  --preload ~/.config/vcmi/modSettings.json@/home/web_user/.config/vcmi/modSettings.json \
  --js-output=vcmi.mods.data.js