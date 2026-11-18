import { decode, drawCanvas, encode } from './qr-module/index.js'

const sample = document.getElementById('qr-demo-sample')
const generate = document.getElementById('qr-demo-generate')
const file = document.getElementById('qr-demo-file')
const canvas = document.getElementById('qr-demo-image')
const status = document.getElementById('qr-demo-status')
const output = document.getElementById('qr-demo-result')
const context = canvas.getContext('2d', { willReadFrequently: true })
const example = 'https://example.com/qr-demo'
let reading = 0

function showResult() {
  canvas.hidden = false
  const result = decode(context.getImageData(0, 0, canvas.width, canvas.height))
  status.textContent = result ? 'Read one QR code.' : 'No readable QR code found.'
  output.hidden = !result
  output.textContent = result?.text ?? ''
}

async function readImage(getImage) {
  const request = ++reading
  canvas.hidden = true
  output.hidden = true
  status.textContent = 'Reading image…'

  try {
    const image = await createImageBitmap(await getImage())
    try {
      if (request !== reading) return
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      showResult()
    } finally {
      image.close()
    }
  } catch {
    if (request === reading) status.textContent = 'Could not read this image.'
  }
}

if (context) {
  sample.addEventListener('click', () => readImage(async () => {
    const response = await fetch(new URL('./faint-qr.png', import.meta.url))
    if (!response.ok) throw new Error('Sample unavailable')
    return response.blob()
  }))
  generate.addEventListener('click', () => {
    reading++
    drawCanvas(canvas, encode(example))
    showResult()
  })
  file.addEventListener('change', () => {
    const image = file.files[0]
    if (image) void readImage(() => image)
    file.value = ''
  })
  for (const control of [sample, generate, file]) control.disabled = false
} else {
  status.textContent = 'This browser could not open a canvas.'
}
