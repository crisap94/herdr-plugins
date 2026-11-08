# Source this to point hc and herdr-app at a throwaway session, never the live one.
# The socket path must stay under 107 bytes, so the directories are short.
S="$HOME/.cache/hcs"; mkdir -p "$S"/{r,s,c,d,app}; chmod 700 "$S/r"
export HC_SESSION=sp XDG_RUNTIME_DIR="$S/r" XDG_STATE_HOME="$S/s" XDG_CONFIG_HOME="$S/c" XDG_DATA_HOME="$S/d" HERDR_APP_HOME="$S/app"
# a window needs the compositor and the bus from the real runtime dir
for f in wayland-1 bus; do ln -sf "/run/user/$(id -u)/$f" "$S/r/$f"; done
