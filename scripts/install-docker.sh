#!/bin/sh
# Compatibility entry point for existing local checkout instructions.
set -eu
exec sh "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/install.sh" "$@"
