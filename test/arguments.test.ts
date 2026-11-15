import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { encode, QrCapacityError, type EncodeOptions } from '../src/index.js'

// The wrong-typed calls a JavaScript caller can make.
const call = encode as (data: unknown, options?: unknown) => unknown

describe('encode arguments', () => {
  it('treats null and undefined options as no options', () => {
    const plain = encode('hello')
    for (const options of [null, undefined, {}]) expect(call('hello', options)).toEqual(plain)
    expect(encode('hello', null)).toEqual(plain)
  })

  it('rejects data that is neither a string nor a Uint8Array', () => {
    const wrong = [undefined, null, 123, true, {}, [1, 2, 3], new ArrayBuffer(4), new Uint16Array(4), new String('abc'), () => 'a']
    for (const data of wrong) {
      expect(() => call(data), String(data)).toThrow(TypeError)
      expect(() => call(data)).toThrow(/encode takes a string or a Uint8Array/)
    }
    expect(() => call(undefined)).toThrow('not undefined')
    expect(() => call(null)).toThrow('not null')
    expect(() => call([1])).toThrow('not an array')
    expect(() => call(7)).toThrow('not a number')
    expect(() => call(new ArrayBuffer(1))).toThrow('not an ArrayBuffer')
  })

  it('still takes strings, Uint8Arrays and their subclasses', () => {
    expect(encode('')).toMatchObject({ version: 1 })
    expect(encode(new Uint8Array(0))).toMatchObject({ version: 1 })
    expect(encode(Buffer.from('abc'))).toEqual(encode(new Uint8Array([97, 98, 99])))
    class Bytes extends Uint8Array {}
    expect(encode(new Bytes([1, 2, 3]))).toEqual(encode(new Uint8Array([1, 2, 3])))
  })

  it('takes a Uint8Array from another realm, where instanceof says no', () => {
    const foreign = runInNewContext('new Uint8Array([97, 98, 99])') as Uint8Array
    expect(foreign instanceof Uint8Array).toBe(false)
    expect(encode(foreign)).toEqual(encode(new Uint8Array([97, 98, 99])))
    expect(() => call(runInNewContext('new Uint16Array(3)'))).toThrow(TypeError)
  })

  it('names the data error before an option error, and options before capacity', () => {
    expect(() => call(null, { ecc: 'x' })).toThrow(TypeError)
    expect(() => call('a', { ecc: 'x' })).toThrow(RangeError)
    expect(() => call('a'.repeat(50_000_000), { version: 99 })).not.toThrow(QrCapacityError)
  })

  it('rejects an unknown level, mode, version, minVersion or mask with a RangeError', () => {
    const bad: [EncodeOptions, RegExp][] = [
      [{ ecc: 'l' as never }, /Unknown error correction level: l/],
      [{ ecc: 1 as never }, /Unknown error correction level: 1/],
      [{ mode: 'kanji' as never }, /Unknown mode: kanji/],
      [{ mode: null as never }, /Unknown mode: null/],
      [{ version: 0 }, /Version must be an integer from 1 to 40/],
      [{ version: 41 }, /Version must be an integer from 1 to 40/],
      [{ version: 1.5 }, /Version must be an integer from 1 to 40/],
      [{ version: '5' as never }, /Version must be an integer from 1 to 40/],
      [{ version: NaN }, /Version must be an integer from 1 to 40/],
      [{ minVersion: 0 }, /minVersion must be an integer from 1 to 40/],
      [{ minVersion: 41 }, /minVersion must be an integer from 1 to 40/],
      [{ minVersion: 2.5 }, /minVersion must be an integer from 1 to 40/],
      [{ minVersion: '3' as never }, /minVersion must be an integer from 1 to 40/],
      [{ mask: 8 }, /Mask must be an integer from 0 to 7/],
      [{ mask: -1 }, /Mask must be an integer from 0 to 7/],
      [{ mask: 1.5 }, /Mask must be an integer from 0 to 7/],
      [{ mask: '3' as never }, /Mask must be an integer from 0 to 7/],
      [{ mask: NaN }, /Mask must be an integer from 0 to 7/],
      [{ version: 3, minVersion: 5 }, /Version is below minVersion/],
    ]
    for (const [options, message] of bad) {
      expect(() => encode('a', options), JSON.stringify(options)).toThrow(RangeError)
      expect(() => encode('a', options)).toThrow(message)
      expect(() => encode('a', options)).not.toThrow(QrCapacityError)
    }
  })
})
