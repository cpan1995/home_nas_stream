#!/bin/bash
set -euo pipefail
cinepro_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cinepro_mode="${1:-start}"
cinepro_node="$(readlink -f "$(command -v node)")"
cinepro_mounts=()
case "$cinepro_mode" in
  start) cinepro_entry=local-server.mjs ;;
  test|media-check|movie-check|providers-check)
    case "$cinepro_mode" in
      test) cinepro_entry=local-test.mjs ;;
      media-check) cinepro_entry=local-media-check.mjs ;;
      movie-check) cinepro_entry=local-movie-check.mjs ;;
      providers-check) cinepro_entry=local-providers-check.mjs ;;
    esac
    mkdir -p "$cinepro_dir/local-test-results"
    cinepro_mounts=(--bind "$cinepro_dir/local-test-results" /results)
    ;;
  *) echo 'Usage: bash run-local.sh [start|test|media-check|movie-check|providers-check] [movie-id]' >&2; exit 2 ;;
esac
# ARM64 installations may not have the x86-specific /lib64 directory.
cinepro_library_mounts=()
for cinepro_lib in /lib /lib64; do
  if [[ -e "$cinepro_lib" ]]; then
    cinepro_library_mounts+=(--ro-bind "$cinepro_lib" "$cinepro_lib")
  fi
done
exec bwrap --ro-bind /usr /usr "${cinepro_library_mounts[@]}" \
  --ro-bind /etc/ssl /etc/ssl --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/hosts /etc/hosts --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
  --ro-bind "$cinepro_node" /runtime-node \
  --ro-bind "$cinepro_dir" /app \
  --ro-bind "$cinepro_dir/../stream-providers.env" /stream-providers.env "${cinepro_mounts[@]}" \
  --proc /proc --dev /dev --tmpfs /tmp \
  --unshare-pid --unshare-uts --unshare-ipc --die-with-parent \
  --clearenv --setenv PATH /usr/bin:/bin --setenv NODE_ENV production \
  --chdir /app /runtime-node --env-file=/stream-providers.env --max-old-space-size=384 "$cinepro_entry" "${@:2}"
