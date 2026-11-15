#!/bin/sh
# Fetches the photographs listed in vectors/photos.json into vectors/photos-cache/
# (not committed), checks every file against its SHA-256, and converts the images to
# 8-bit greyscale PNG with the JDK's javax.imageio so both ports read the same pixels.
# Needs node, curl and a JDK (17 or later). Development only; nothing here is packaged.
set -eu
cd "$(dirname "$0")/.."
manifest=vectors/photos.json
cache=vectors/photos-cache
mkdir -p "$cache/raw" "$cache/grey" "$cache/classes"

# One line a photo: id, extension, image hash, text file hash, pixel hash, image URL, text URL.
node -e '
const fs = require("fs")
const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const src = new Map(m.sources.map((s) => [s.id, s]))
const enc = (p) => p.split("/").map(encodeURIComponent).join("/")
for (const p of m.photos) {
  const s = src.get(p.source)
  console.log([p.id, p.ext, p.sha256, p.textSha256, p.pixelsSha256 || "-", s.url + enc(p.set + "/" + p.file), s.url + enc(p.set + "/" + p.textFile.split("/").pop())].join("\t"))
}' "$manifest" > "$cache/list.tsv"

fetch() { # url file sum
  if [ -f "$2" ] && echo "$3  $2" | shasum -a 256 -c - >/dev/null 2>&1; then return; fi
  curl -sSfL --retry 3 -A fetch-client -o "$2.part" "$1"
  mv "$2.part" "$2"
  echo "$3  $2" | shasum -a 256 -c - >/dev/null || { echo "checksum mismatch: $2" >&2; rm -f "$2"; exit 1; }
}

count=0
tab=$(printf '\t')
while IFS="$tab" read -r id ext sha tsha psha url turl; do
  fetch "$url" "$cache/raw/$id.$ext" "$sha"
  fetch "$turl" "$cache/raw/$id.txt" "$tsha"
  count=$((count + 1))
done < "$cache/list.tsv"
echo "fetched and verified $count photographs"

# The converter only reads the id, extension and pixel hash columns.
cut -f1,2,5 "$cache/list.tsv" > "$cache/convert.tsv"
javac -d "$cache/classes" vectors/generator/PhotoGrey.java
java -cp "$cache/classes" PhotoGrey "$cache/convert.tsv" "$cache/raw" "$cache/grey" > "$cache/pixels.txt"
echo "converted $(wc -l < "$cache/pixels.txt" | tr -d ' ') to greyscale in $cache/grey"
