#!/bin/zsh
cd "${0:A:h}" || exit 1
for app in "$HOME/Applications/Pingboard.app" /Applications/Pingboard.app "$PWD/src-tauri/target/release/bundle/macos/Pingboard.app"; do
  if [[ -d "$app" ]]; then
    exec open "$app"
  fi
done
echo 'Установите Pingboard.app из DMG. Для сборки из исходников выполните npm run build.' >&2
exit 1
