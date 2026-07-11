#!/usr/bin/env bash
# Comprime as capas de frontend/public/images para no máximo 200KB cada.
# Uso: ./compress-covers.sh
# Requer ImageMagick (magick). Redimensiona para no máx 480x720 (as capas
# renderizam a 88-110px CSS; 480px cobre retina com folga) e usa
# jpeg:extent para garantir o teto de 200KB. Modifica os arquivos in-place.
set -euo pipefail

MAX_BYTES=$((200 * 1024))
IMAGES_DIR="$(cd "$(dirname "$0")/../public/images" && pwd)"

command -v magick >/dev/null || { echo "erro: ImageMagick (magick) não encontrado"; exit 1; }

shopt -s nullglob
total=0
compressed=0
for f in "$IMAGES_DIR"/*.jpg "$IMAGES_DIR"/*.jpeg; do
  total=$((total + 1))
  before=$(stat -f%z "$f")
  if [ "$before" -le "$MAX_BYTES" ]; then
    echo "ok      $(basename "$f") ($((before / 1024))KB)"
    continue
  fi
  magick "$f" -resize '480x720>' -strip -define jpeg:extent=200kb "$f"
  after=$(stat -f%z "$f")
  compressed=$((compressed + 1))
  echo "reduzido $(basename "$f") ($((before / 1024))KB -> $((after / 1024))KB)"
done

echo "---"
echo "$total arquivos, $compressed comprimidos (teto: 200KB)"
