#!/usr/bin/env bash
set -euo pipefail
package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$package_root"
if [[ -x "$package_root/.local/node/bin/node" ]]; then
    export PATH="$package_root/.local/node/bin:$PATH"
fi
for dependency in node npm cmake ninja pkg-config; do
    command -v "$dependency" >/dev/null || { echo "Missing dependency: $dependency. See README.md." >&2; exit 1; }
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 19)) { console.error("Node.js 22.19 or newer is required."); process.exit(1); }'
npm ci --ignore-scripts
npm run setup:cinepro
npm run build
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
# A conservative default for the 4 GB Pi. Override with BUILD_JOBS if desired.
cmake --build build --parallel "${BUILD_JOBS:-2}"
echo "Built for $(uname -m). Start with: bash scripts/start-pi.sh"
