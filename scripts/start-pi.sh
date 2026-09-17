#!/usr/bin/env bash
set -euo pipefail
package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$package_root"
if [[ -x "$package_root/.local/node/bin/node" ]]; then
    export PATH="$package_root/.local/node/bin:$PATH"
fi
if [[ ! -x build/screening-room ]]; then
    echo "Build the application first: bash scripts/build-pi.sh" >&2
    exit 1
fi
default_library=/mnt/movies
if [[ -z "${SCREENING_ROOM_LIBRARY_DIR:-}" && -f "$package_root/.local/library-path" ]]; then
    default_library=$(cat -- "$package_root/.local/library-path")
    if [[ -z "$default_library" ]]; then
        echo "The local library-path file must contain a movie folder." >&2
        exit 1
    fi
fi
export SCREENING_ROOM_STREAM_CONFIG="$package_root/.local/stream-providers.env"
exec ./build/screening-room \
    --library "${SCREENING_ROOM_LIBRARY_DIR:-$default_library}" \
    --data-dir "${SCREENING_ROOM_DATA_DIR:-$package_root/.local}" "$@"
