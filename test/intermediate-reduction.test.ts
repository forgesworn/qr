import { describe, expect, it } from 'vitest'
import { decode } from '../src/index.js'
import { intermediatePicture, intermediateText } from './intermediate-reduction-fixture.js'

describe('intermediate reduction', () => {
  it.each(['normal', 'inverted'] as const)('recovers a grainy mirrored %s symbol', inversion => {
    const inverted = inversion === 'inverted'
    const image = intermediatePicture(inverted)
    const input = image.data.slice()
    const result = decode(image, { inversion })
    expect(result).toMatchObject({
      text: intermediateText, bytes: new TextEncoder().encode(intermediateText),
      version: 1, ecc: 'Q', mirrored: true, inverted,
    })
    expect(decode(image, { inversion: inverted ? 'normal' : 'inverted' })).toBeUndefined()
    expect(image.data).toEqual(input)
  })
})
