#!/bin/bash
# Renders the /about hero stills (six per cut: day and night, desktop 16:9 and phone 9:16)
# with headless Blender, then compresses each to AVIF (~25-60 KB) for the scroll crossfade.
# Run from the repo root; textures are read from .blender/textures.
#   bash scripts/blender/render-all.sh              # everything
#   ONLY=0,4 THEMES=night bash scripts/blender/render-all.sh   # just some stills
set -euo pipefail
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 4.5/blender.exe}"
FRAMES=.blender/frames
OUT=public/about
mkdir -p "$FRAMES" "$OUT"
for theme in ${THEMES:-day night}; do
  for variant in "" "--portrait"; do
    suffix=$([ -n "$variant" ] && echo "-m" || echo "")
    width=$([ -n "$variant" ] && echo 720 || echo 1280)
    "$BLENDER" -b --factory-startup -P scripts/blender/build-beacon.py -- \
      --theme "$theme" $variant --render "$(pwd -W)/$FRAMES" ${ONLY:+--only "$ONLY"} \
      >"$FRAMES/$theme$suffix.log" 2>&1
    for i in 0 1 2 3 4 5; do
      ffmpeg -y -loglevel error -i "$FRAMES/$theme$suffix-$i.png" -vf "scale=$width:-2" \
        -c:v libaom-av1 -still-picture 1 -crf 34 -cpu-used 4 -pix_fmt yuv420p \
        "$OUT/beacon-$theme$suffix-$i.avif"
    done
    echo "done: $theme$suffix"
  done
done
