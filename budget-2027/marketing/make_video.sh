#!/usr/bin/env bash
# Builds MP4s from the rendered scene stills: slow zoom per scene + crossfades, no audio.
# Usage: bash make_video.sh   (after node render.js)
set -euo pipefail
cd "$(dirname "$0")/video"
FPS=30; XF=0.5
build() { # lang tag W H per-scene-seconds
  local lang=$1 tag=$2 W=$3 H=$4 D=$5 n=6 inputs="" filters="" i
  local frames; frames=$(python3 -c "print(int($D*$FPS))")
  for i in $(seq 0 $((n-1))); do
    inputs+=" -i scenes/${lang}-${tag}-${i}.png"  # one frame in; zoompan stretches it to D seconds
    filters+="[$i:v]scale=$((W*2)):$((H*2)),zoompan=z='min(zoom+0.0007,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[v$i];"
  done
  local prev="v0" off
  for i in $(seq 1 $((n-1))); do
    off=$(python3 -c "print(round($i*($D-$XF),3))")
    filters+="[$prev][v$i]xfade=transition=fade:duration=${XF}:offset=${off}[x$i];"
    prev="x$i"
  done
  ffmpeg -y -loglevel error $inputs -filter_complex "${filters%;}" -map "[$prev]" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an "${lang}-${tag}.mp4"
  echo "video/${lang}-${tag}.mp4"
}
for lang in en ar; do
  build "$lang" landscape 1920 1080 2.9   # ~15s, fits Etsy's 5–15s listing video
  build "$lang" vertical 1080 1920 3.6    # ~19s, Reels / TikTok / Shorts
done
