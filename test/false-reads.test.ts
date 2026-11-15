// Symbols damaged beyond correction, and frames with no symbol at all, must
// read as nothing or as the symbol's own text: never as other text. The
// damaged symbols keep their finders, timing and format information, so the
// ordinary read fails and the second look runs on them too. The Kotlin port
// builds the same frames from the same generator (FalseReadsTest.kt).
import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { correctable } from '../src/symbol.js'
import { blocksFor, encode, Grid, type ErrorCorrection } from '../src/encode.js'
import { binarise, invert, shrink, toLuminance } from '../src/binarise.js'
import { estimateSize, finderTriples, findFinders, type Work } from '../src/locate.js'
import { bent, prng } from './photo.js'

interface Frame { data: Uint8Array; width: number; height: number }

const LEVELS: ErrorCorrection[] = ['L', 'M', 'Q', 'H']
const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Module positions of each codeword of each block, in the order readSymbol takes them. */
function codewordModules(version: number, ecc: ErrorCorrection): [number, number][][][] {
  const grid = new Grid(version)
  const size = 17 + 4 * version
  const [ec, g1, d1, g2] = blocksFor(version, ecc)
  const count = g1 + g2
  const total = g1 * d1 + g2 * (d1 + 1) + count * ec
  const bits: [number, number][] = []
  let upward = true
  for (let right = size - 1; right >= 1 && bits.length < total * 8; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step
      for (let i = 0; i < 2; i++) {
        const x = right - i
        if (!grid.isReserved(x, y) && bits.length < total * 8) bits.push([x, y])
      }
    }
    upward = !upward
  }
  const blocks: [number, number][][][] = Array.from({ length: count }, () => [])
  let k = 0
  const take = () => bits.slice(8 * k, 8 * ++k)
  for (let i = 0; i <= d1; i++) for (let b = 0; b < count; b++) if (i < (b < g1 ? d1 : d1 + 1)) blocks[b]!.push(take())
  for (let i = 0; i < ec; i++) for (let b = 0; b < count; b++) blocks[b]!.push(take())
  return blocks
}

/** Draws modules straight, `scale` pixels a module, four modules of quiet zone, with additive noise. */
function draw(modules: Uint8Array, size: number, scale: number, invert: boolean, noise: number, random: () => number): Frame {
  const side = (size + 8) * scale
  const data = new Uint8Array(side * side)
  for (let py = 0; py < side; py++) {
    for (let px = 0; px < side; px++) {
      const mx = Math.floor(px / scale) - 4
      const my = Math.floor(py / scale) - 4
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx] === 1
      const v = dark !== invert ? 30 : 225
      data[py * side + px] = Math.max(0, Math.min(255, v + Math.floor((random() * 2 - 1) * noise)))
    }
  }
  return { data, width: side, height: side }
}

type Kind = 'codewords' | 'burst' | 'flips'

/** One damaged symbol: its text and the frame. */
function damaged(kind: Kind, random: () => number): { text: string; frame: Frame } {
  // A third are short and have no prefix, so version 1 symbols are drawn too.
  const short = random() < 1 / 3
  const length = 1 + Math.floor(random() * (short ? 12 : 120))
  let text = short ? '' : 'https://example.com/t/'
  for (let i = 0; i < length; i++) text += CHARS[Math.floor(random() * CHARS.length)]
  const ecc = LEVELS[Math.floor(random() * 4)]!
  const mask = Math.floor(random() * 8)
  const qr = encode(text, { ecc, mask })
  const { size, version } = qr
  const modules = Uint8Array.from(qr.modules)
  const grid = new Grid(version)
  if (kind === 'codewords') {
    // One block, a few codewords past what its parity corrects.
    const blocks = codewordModules(version, ecc)
    const block = blocks[Math.floor(random() * blocks.length)]!
    const ec = blocksFor(version, ecc)[0]
    const errors = Math.min(block.length, Math.floor(ec / 2) + 1 + Math.floor(random() * 3))
    const order = block.map((_, i) => i)
    for (let i = 0; i < errors; i++) {
      const j = i + Math.floor(random() * (order.length - i))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
      const flip = 1 + Math.floor(random() * 255)
      block[order[i]!]!.forEach(([x, y], bit) => {
        if ((flip >>> (7 - bit)) & 1) modules[y * size + x]! ^= 1
      })
    }
  } else if (kind === 'burst') {
    // A rectangle of the data region turned over.
    const w = 3 + Math.floor(random() * (size / 2))
    const h = 3 + Math.floor(random() * (size / 2))
    const left = Math.floor(random() * (size - w))
    const top = Math.floor(random() * (size - h))
    for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) if (!grid.isReserved(x, y)) modules[y * size + x]! ^= 1
  } else {
    // Flips anywhere, finders and format included.
    const rate = 0.08 + random() * 0.25
    for (let i = 0; i < modules.length; i++) if (random() < rate) modules[i]! ^= 1
  }
  const mirror = random() < 0.2
  const grid2 = mirror ? Uint8Array.from({ length: size * size }, (_, i) => modules[(i % size) * size + Math.floor(i / size)]!) : modules
  const scale = 2 + Math.floor(random() * 3)
  const invert = random() < 0.2
  const noise = Math.floor(random() * 40)
  return { text, frame: draw(grid2, size, scale, invert, noise, random) }
}

/** Frames with no symbol in them. */
function empty(random: () => number): Frame[] {
  const fill = (width: number, height: number, f: (x: number, y: number) => number): Frame => {
    const data = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = f(x, y)
    return { data, width, height }
  }
  const frames: Frame[] = []
  for (let i = 0; i < 4; i++) frames.push(fill(320, 240, () => Math.floor(random() * 256)))
  frames.push(fill(320, 240, () => (random() < 0.5 ? 0 : 255)))
  frames.push(fill(320, 240, () => 200))
  frames.push(fill(320, 240, (x) => (Math.floor(x / 4) % 2 ? 20 : 230)))
  frames.push(fill(320, 240, (x, y) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 20 : 230)))
  // Finder patterns at 2 px a module on a 20 px pitch, nothing between.
  frames.push(
    fill(320, 240, (x, y) => {
      const i = Math.floor((x % 20) / 2)
      const j = Math.floor((y % 20) / 2)
      return i < 7 && j < 7 && Math.max(Math.abs(i - 3), Math.abs(j - 3)) !== 2 ? 20 : 230
    }),
  )
  return frames
}

/**
 * A symbol of a version with an alignment lattice (7 to 40), one block a few
 * codewords past its parity, finders, timing and format whole, drawn through
 * a lens bent by 0, 0.01 or 0.02, so the second look reads it through a mesh.
 */
function damagedLarge(random: () => number, only?: number, lens: readonly number[] = [0, 0.01, 0.02]): { text: string; frame: Frame } {
  const version = only ?? 7 + Math.floor(random() * 34)
  const ecc = LEVELS[Math.floor(random() * 4)]!
  const mask = Math.floor(random() * 8)
  const length = 1 + Math.floor(random() * 60)
  let text = 'https://example.com/t/'
  for (let i = 0; i < length; i++) text += CHARS[Math.floor(random() * CHARS.length)]
  const qr = encode(text, { ecc, mask, version })
  const { size } = qr
  const modules = Uint8Array.from(qr.modules)
  const blocks = codewordModules(version, ecc)
  const block = blocks[Math.floor(random() * blocks.length)]!
  const ec = blocksFor(version, ecc)[0]
  const errors = Math.min(block.length, Math.floor(ec / 2) + 1 + Math.floor(random() * 3))
  const order = block.map((_, i) => i)
  for (let i = 0; i < errors; i++) {
    const j = i + Math.floor(random() * (order.length - i))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
    const flip = 1 + Math.floor(random() * 255)
    block[order[i]!]!.forEach(([x, y], bit) => {
      if ((flip >>> (7 - bit)) & 1) modules[y * size + x]! ^= 1
    })
  }
  const mirror = random() < 0.2
  const drawn = mirror ? Uint8Array.from({ length: size * size }, (_, i) => modules[(i % size) * size + Math.floor(i / size)]!) : modules
  const k = lens[Math.floor(random() * lens.length)]!
  const invert = random() < 0.2
  return { text, frame: bent(drawn, size, 3, k, invert) }
}

/**
 * A symbol of version 1 to 4 drawn with large modules, 16, 24 or 32 pixels,
 * so the reduced-size pass finds it at every factor. `codewords` damages one
 * block one to three codewords past what it may correct, finders, timing
 * and format whole; `flips` turns over modules anywhere.
 */
function damagedClose(kind: 'codewords' | 'flips', random: () => number): { text: string; frame: Frame } {
  const version = 1 + Math.floor(random() * 4)
  const ecc = LEVELS[Math.floor(random() * 4)]!
  const mask = Math.floor(random() * 8)
  // Up to the bytes the version holds at level H, so the text fits at any level.
  const length = 1 + Math.floor(random() * [7, 14, 24, 34][version - 1]!)
  let text = ''
  for (let i = 0; i < length; i++) text += CHARS[Math.floor(random() * CHARS.length)]
  const qr = encode(text, { ecc, mask, version })
  const { size } = qr
  const modules = Uint8Array.from(qr.modules)
  if (kind === 'codewords') {
    const blocks = codewordModules(qr.version, ecc)
    const block = blocks[Math.floor(random() * blocks.length)]!
    // One to three errors past what Table 9 lets the block correct.
    const errors = Math.min(block.length, correctable(qr.version, ecc) + 1 + Math.floor(random() * 3))
    const order = block.map((_, i) => i)
    for (let i = 0; i < errors; i++) {
      const j = i + Math.floor(random() * (order.length - i))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
      const flip = 1 + Math.floor(random() * 255)
      block[order[i]!]!.forEach(([x, y], bit) => {
        if ((flip >>> (7 - bit)) & 1) modules[y * size + x]! ^= 1
      })
    }
  } else {
    const rate = 0.04 + random() * 0.12
    for (let i = 0; i < modules.length; i++) if (random() < rate) modules[i]! ^= 1
  }
  const mirror = random() < 0.2
  const drawn = mirror ? Uint8Array.from({ length: size * size }, (_, i) => modules[(i % size) * size + Math.floor(i / size)]!) : modules
  const scale = [16, 24, 32][Math.floor(random() * 3)]!
  const invert = random() < 0.2
  const noise = Math.floor(random() * 40)
  return { text, frame: draw(drawn, size, scale, invert, noise, random) }
}

/** Larger frames with no symbol in them, whose shapes survive shrinking. */
function emptyLarge(random: () => number): Frame[] {
  const fill = (width: number, height: number, f: (x: number, y: number) => number): Frame => {
    const data = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = f(x, y)
    return { data, width, height }
  }
  const frames: Frame[] = []
  frames.push(fill(640, 480, () => Math.floor(random() * 256)))
  // Noise in 8 px squares, and in 16 px squares of black and white.
  const coarse = Array.from({ length: 80 * 60 }, () => Math.floor(random() * 256))
  frames.push(fill(640, 480, (x, y) => coarse[Math.floor(y / 8) * 80 + Math.floor(x / 8)]!))
  const blocks = Array.from({ length: 40 * 30 }, () => (random() < 0.5 ? 20 : 230))
  frames.push(fill(640, 480, (x, y) => blocks[Math.floor(y / 16) * 40 + Math.floor(x / 16)]!))
  // Finder patterns at 8 and at 16 px a module, nothing between.
  for (const [m, pitch, width, height] of [[8, 80, 640, 480], [16, 160, 960, 640]] as const) {
    frames.push(
      fill(width, height, (x, y) => {
        const i = Math.floor((x % pitch) / m)
        const j = Math.floor((y % pitch) / m)
        return i < 7 && j < 7 && Math.max(Math.abs(i - 3), Math.abs(j - 3)) !== 2 ? 20 : 230
      }),
    )
  }
  // Lines of text-like glyphs: 4 x 6 cells of 3 px, each dark at random.
  const glyphs = Array.from({ length: 50 * 16 * 24 }, () => random() < 0.4)
  frames.push(
    fill(800, 600, (x, y) => {
      const line = Math.floor(y / 36)
      const row = y % 36
      const letter = Math.floor(x / 16)
      const col = x % 16
      if (line >= 16 || row >= 18 || col >= 12) return 235
      return glyphs[(line * 50 + letter) * 24 + Math.floor(row / 3) * 4 + Math.floor(col / 3)] ? 25 : 235
    }),
  )
  // A 24 px checkerboard.
  frames.push(fill(640, 480, (x, y) => ((Math.floor(x / 24) + Math.floor(y / 24)) % 2 ? 20 : 230)))
  return frames
}

/** The mesh's points probed a frame, at most, as in test/work.test.ts. */
const MESH_PROBES = 4 * 46 * 25 * 25 * 25

/** Whether a triple the search locates estimates the size past 177, by no more than 8. */
function over(frame: Frame): boolean {
  const bits = binarise(toLuminance(frame.data, frame.width, frame.height, 1, frame.width))
  for (const image of [bits, invert(bits)]) {
    for (const tolerance of [0.5, 0.8]) {
      for (const triple of finderTriples(image, findFinders(image, tolerance)).slice(0, 6)) {
        const size = estimateSize(image, triple)
        if (size !== undefined && size > 177 && size <= 185) return true
      }
    }
  }
  return false
}

/**
 * A symbol of nothing but zero codewords, as test/zero.test.ts builds it: the
 * mask pattern alone in the data region, finders, timing and format whole.
 */
function zeroSymbol(version: number, ecc: ErrorCorrection, mask: number): { modules: Uint8Array; size: number } {
  const [ec, g1, d1, g2] = blocksFor(version, ecc)
  const grid = new Grid(version)
  grid.placeData(new Uint8Array(g1 * d1 + g2 * (d1 + 1) + ec * (g1 + g2)))
  return { modules: grid.render(ecc, mask), size: grid.size }
}

/** Of the reduced sizes 8, 4 and 2, how many hold a finder triple in either polarity. */
function factorsWithTriples(frame: Frame): number {
  const luminance = toLuminance(frame.data, frame.width, frame.height, 1, frame.width)
  let count = 0
  for (const f of [8, 4, 2]) {
    const bits = binarise(shrink(luminance, f))
    if ([bits, invert(bits)].some((image) => finderTriples(image, findFinders(image, 0.8)).length > 0)) count++
  }
  return count
}

const counter = (): Work => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 })

/** Maps sampled at reduced size a frame, at most: three factors, 30 each. */
const REDUCED_MAPS = 3 * 30

/**
 * Frames with no symbol whose sides sit at the smallest reduced size: 21
 * pixels times each factor, one more and one fewer, as squares and as strips,
 * and strips too thin for any factor. Each as noise, as blank paper and as
 * finder patterns at 2 pixels a module.
 */
function emptySmall(random: () => number): Frame[] {
  const sides: [number, number][] = []
  for (const f of [2, 4, 8]) {
    for (const d of [-1, 0, 1]) {
      const s = 21 * f + d
      sides.push([s, s], [s, 400], [400, s])
    }
  }
  sides.push([1, 1], [1, 500], [500, 1], [20, 20], [21, 21], [21, 1000], [1000, 21], [8, 2000], [2000, 8])
  const frames: Frame[] = []
  for (const [width, height] of sides) {
    for (const kind of [0, 1, 2]) {
      const data = new Uint8Array(width * height)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = Math.floor((x % 20) / 2)
          const j = Math.floor((y % 20) / 2)
          const tile = i < 7 && j < 7 && Math.max(Math.abs(i - 3), Math.abs(j - 3)) !== 2 ? 20 : 230
          data[y * width + x] = kind === 0 ? Math.floor(random() * 256) : kind === 1 ? 255 : tile
        }
      }
      frames.push({ data, width, height })
    }
  }
  return frames
}

describe('no false reads', () => {
  it('reads damaged symbols as nothing or their own text', () => {
    const random = prng(2718)
    const tally: Record<Kind, { trials: number; nothing: number; own: number; secondLook: number }> = {
      codewords: { trials: 0, nothing: 0, own: 0, secondLook: 0 },
      burst: { trials: 0, nothing: 0, own: 0, secondLook: 0 },
      flips: { trials: 0, nothing: 0, own: 0, secondLook: 0 },
    }
    const kinds: [Kind, number][] = [['codewords', 160], ['burst', 40], ['flips', 40]]
    for (const [kind, n] of kinds) {
      for (let i = 0; i < n; i++) {
        const { text, frame } = damaged(kind, random)
        const work = counter()
        const got = decodeCounted(frame, {}, work)
        if (got !== undefined) expect(got.text).toBe(text)
        const t = tally[kind]
        t.trials++
        if (got === undefined) t.nothing++
        else t.own++
        if (work.second > 0) t.secondLook++
        expect(work.second).toBeLessThanOrEqual(4)
      }
    }
    // Damage past the parity reads as nothing, and the second look ran on nearly every one.
    expect(tally.codewords.nothing).toBe(tally.codewords.trials)
    expect(tally.codewords.secondLook).toBeGreaterThanOrEqual(0.9 * tally.codewords.trials)
  })

  it('reads damaged large symbols through the mesh as nothing', () => {
    // A seed of its own, so the frames above stay as they were.
    const random = prng(4049)
    const trials = 30
    let meshed = 0
    for (let i = 0; i < trials; i++) {
      const { text, frame } = damagedLarge(random)
      const work = counter()
      const got = decodeCounted(frame, {}, work)
      if (got !== undefined) expect(got.text).toBe(text)
      expect(got).toBeUndefined()
      expect(work.second).toBeLessThanOrEqual(4)
      expect(work.probed).toBeLessThanOrEqual(MESH_PROBES)
      if (work.meshes > 0) meshed++
    }
    // The mesh was reached on nearly every one.
    expect(meshed).toBeGreaterThanOrEqual(0.9 * trials)
  })

  it('reads damaged version 40 symbols estimated past 177 as nothing', () => {
    // Under the lens the finders' modules look small, so the estimate runs past
    // 177 and only the retries below it are tried.
    const random = prng(4051)
    const trials = 10
    let past = 0
    let meshed = 0
    for (let i = 0; i < trials; i++) {
      const { text, frame } = damagedLarge(random, 40, [0.02])
      const work = counter()
      const got = decodeCounted(frame, {}, work)
      if (got !== undefined) expect(got.text).toBe(text)
      expect(got).toBeUndefined()
      expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
      expect(work.second).toBeLessThanOrEqual(4)
      expect(work.probed).toBeLessThanOrEqual(MESH_PROBES)
      if (over(frame)) past++
      if (work.meshes > 0) meshed++
    }
    // The estimate ran past 177 on nearly every one, and the maps from the
    // retries below it took most of them to the second look's mesh.
    expect(past).toBeGreaterThanOrEqual(0.9 * trials)
    expect(meshed).toBeGreaterThanOrEqual(0.7 * trials)
  })

  it('reads damaged close-up symbols at reduced size as nothing or their own text', () => {
    // A seed of its own. Nothing reads these at full size, so the reduced-size
    // pass runs; with maps to spare and a triple at every factor, it maps at each.
    const random = prng(6131)
    let trials = 0
    let reached = 0
    let everyFactor = 0
    for (const [kind, n] of [['codewords', 200], ['flips', 100]] as const) {
      for (let i = 0; i < n; i++) {
        const { text, frame } = damagedClose(kind, random)
        const work = counter()
        const got = decodeCounted(frame, {}, work)
        if (got !== undefined) expect(got.text).toBe(text)
        expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
        expect(work.reduced).toBeLessThanOrEqual(REDUCED_MAPS)
        expect(work.second).toBeLessThanOrEqual(4)
        expect(work.probed).toBeLessThanOrEqual(MESH_PROBES)
        if (kind === 'codewords') {
          expect(got).toBeUndefined()
          trials++
          if (work.reduced! > 0) reached++
          if (work.maps < 4 * 6 * 5 * 6 && factorsWithTriples(frame) === 3) everyFactor++
        }
      }
    }
    expect(reached).toBe(trials)
    expect(everyFactor).toBeGreaterThanOrEqual(0.9 * trials)
  }, 120_000)

  it('reads close-up symbols of nothing but zero codewords as nothing at every size', () => {
    // Nothing reads them at full size, so the reduced-size pass runs on each.
    const random = prng(6133)
    let trials = 0
    let everyFactor = 0
    for (const [version, ecc] of [[1, 'H'], [1, 'L'], [2, 'L'], [5, 'Q']] as const) {
      for (let mask = 0; mask < 8; mask++) {
        const { modules, size } = zeroSymbol(version, ecc, mask)
        for (const scale of [16, 24]) {
          const mirror = random() < 0.5
          const drawn = mirror ? Uint8Array.from({ length: size * size }, (_, i) => modules[(i % size) * size + Math.floor(i / size)]!) : modules
          const frame = draw(drawn, size, scale, random() < 0.5, Math.floor(random() * 40), random)
          const work = counter()
          expect(decodeCounted(frame, {}, work), `${version}${ecc} mask ${mask} at ${scale}`).toBeUndefined()
          expect(work.reduced).toBeGreaterThan(0)
          expect(work.reduced).toBeLessThanOrEqual(REDUCED_MAPS)
          expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
          expect(work.second).toBeLessThanOrEqual(4)
          trials++
          if (work.maps < 4 * 6 * 5 * 6 && factorsWithTriples(frame) === 3) everyFactor++
        }
      }
    }
    expect(everyFactor).toBeGreaterThanOrEqual(0.9 * trials)
  }, 60_000)

  it('reads larger frames with no symbol as nothing at every size', () => {
    let reached = 0
    for (const frame of emptyLarge(prng(37))) {
      const work = counter()
      expect(decodeCounted(frame, {}, work)).toBeUndefined()
      expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
      expect(work.reduced).toBeLessThanOrEqual(REDUCED_MAPS)
      expect(work.second).toBeLessThanOrEqual(4)
      if (work.reduced! > 0) reached++
    }
    // The finder tiles at least are mapped at reduced size.
    expect(reached).toBeGreaterThanOrEqual(2)
  })

  it('reads frames at and around the smallest reduced size as nothing', () => {
    for (const frame of emptySmall(prng(41))) {
      const work = counter()
      expect(decodeCounted(frame, {}, work), `${frame.width} x ${frame.height}`).toBeUndefined()
      expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
      expect(work.reduced).toBeLessThanOrEqual(REDUCED_MAPS)
      expect(work.second).toBeLessThanOrEqual(4)
    }
  })

  it('reads frames with no symbol as nothing', () => {
    for (const frame of empty(prng(31))) {
      const work = counter()
      expect(decodeCounted(frame, {}, work)).toBeUndefined()
      expect(work.second).toBeLessThanOrEqual(4)
    }
  })
})
