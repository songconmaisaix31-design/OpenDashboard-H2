#!/usr/bin/env sh
case "$0" in
  */*) script_path=$0 ;;
  *) script_path=$(command -v -- "$0") || exit 1 ;;
esac
script_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd) || exit 1
exec node "$script_dir/scripts/h2-sentinel/launch.mjs" "$@"
