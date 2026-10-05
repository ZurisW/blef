// Loads an image file (JPG/PNG), downscales it in the browser and
// returns a light dataURL. Option square crops to a square (avatars).
export function fileToDataUrl(file, { maxSize = 480, square = false, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png)$/.test(file.type)) {
      reject(new Error('Wybierz plik JPG lub PNG'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Nie udało się odczytać obrazka'))
      img.onload = () => {
        let sw = img.width
        let sh = img.height
        let sx = 0
        let sy = 0
        if (square) {
          const side = Math.min(sw, sh)
          sx = Math.round((sw - side) / 2)
          sy = Math.round((sh - side) / 2)
          sw = side
          sh = side
        }
        const scale = Math.min(1, maxSize / Math.max(sw, sh))
        const w = Math.max(1, Math.round(sw * scale))
        const h = Math.max(1, Math.round(sh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
        const isJpg = file.type === 'image/jpeg'
        resolve(canvas.toDataURL(isJpg ? 'image/jpeg' : 'image/png', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
