# Source from the repository root; all tool writes stay beside the checkout.
SOAK_RUNTIME="$(pwd)/../runtime"
export TEMP="$SOAK_RUNTIME/tmp" TMPDIR="$SOAK_RUNTIME/tmp"
export npm_config_cache="$SOAK_RUNTIME/npm"
export XDG_CONFIG_HOME="$SOAK_RUNTIME/config" XDG_CACHE_HOME="$SOAK_RUNTIME/cache"
export FIREBASE_EMULATORS_PATH="$SOAK_RUNTIME/emulators"
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
export PLAYWRIGHT_BROWSERS_PATH="$SOAK_RUNTIME/browsers"
export JAVA_HOME="$(find "$SOAK_RUNTIME" -maxdepth 1 -type d -name 'jdk-21*' | head -n 1)"
export PATH="$JAVA_HOME/bin:$PATH"
export CI=1 FIREBASE_CLI_DISABLE_USAGE_REPORTING=true NO_UPDATE_NOTIFIER=1
mkdir -p "$TEMP" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$FIREBASE_EMULATORS_PATH"
