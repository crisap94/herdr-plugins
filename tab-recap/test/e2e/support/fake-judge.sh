#!/bin/sh
dir="$1"
text=$(cat)
case "$text" in
    *"You judge a recap"*) task=score ;;
    *"You compare a recap"*) task=cover ;;
    *"You are handed over"*) task=readback ;;
    *"You grade six"*) task=grade ;;
    *) task=writer ;;
esac
printf '%s\n' "$task" >> "$dir/asked.log"
n=$(grep -c "^$task\$" "$dir/asked.log")
printf '%s' "$text" > "$dir/doc.$task.$n"
if [ -f "$dir/$task.$n" ]; then
    cat "$dir/$task.$n"
elif [ -f "$dir/$task" ]; then
    cat "$dir/$task"
else
    exit 1
fi
