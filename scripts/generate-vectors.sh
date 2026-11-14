#!/bin/sh
# Regenerates vectors/encode-vectors.json with ZXing core 3.5.3 as the oracle.
# Needs a JDK (17 or later). The jar is fetched once and checked by SHA-256;
# it is a development tool only and is never part of the package.
set -eu
cd "$(dirname "$0")/.."
cache=vectors/generator/.cache
jar=$cache/core-3.5.3.jar
sum=8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82
mkdir -p "$cache"
if [ ! -f "$jar" ]; then
  curl -sSfL -o "$jar.part" https://repo1.maven.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar
  mv "$jar.part" "$jar"
fi
echo "$sum  $jar" | shasum -a 256 -c - >/dev/null
javac -d "$cache/classes" -cp "$jar" vectors/generator/GenerateVectors.java
java -cp "$jar:$cache/classes" GenerateVectors > vectors/encode-vectors.json.part
mv vectors/encode-vectors.json.part vectors/encode-vectors.json
echo "wrote vectors/encode-vectors.json"
