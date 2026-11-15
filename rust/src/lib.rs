//! The QR decoder, ported from the TypeScript reference: greyscale,
//! binarisation, reduction and the finder scan (SPEC.md, decoder steps 1, 2, 3
//! and 9), finder triples, size estimates and sampling maps (steps 4 and 5),
//! reading a module grid (steps 6 and 7), the second look with its alignment
//! mesh (step 8) and the reduced-size pass (step 9). `decode::decode` is the
//! whole decoder. `encode::encode` is the encoder and `render` holds the SVG
//! and terminal renderers; there is no canvas renderer.

pub mod binarise;
pub mod decode;
pub mod encode;
pub mod locate;
pub mod place;
pub mod refine;
pub mod render;
pub mod symbol;
pub mod tables;

use binarise::{binarise, invert, thresholds, to_luminance, BitImage, Luminance, Reductions};
use locate::{find_finders, Edges};

/// The two tolerances of the finder scan, strict then looser.
pub const TOLERANCES: [f64; 2] = [0.5, 0.8];
/// The reduction factors, coarse to fine.
pub const REDUCTIONS: [usize; 3] = [8, 4, 2];
/// A reduced picture narrower or shorter than this cannot hold a version 1 symbol.
pub const MIN_REDUCED: usize = 21;

/// The finder candidates found in a binarised picture and in its inverse, at both tolerances.
fn candidates(luminance: &Luminance) -> u32 {
    let t = thresholds(luminance);
    let bits: BitImage = binarise(luminance, &t);
    // The inverse changes colour where the picture does, so one set of edges serves both.
    let mut edges = Edges::new(&bits);
    let mut total = 0usize;
    for tolerance in TOLERANCES {
        total += find_finders(&bits, tolerance, None, &mut edges).len();
    }
    let inverse = invert(&bits);
    for tolerance in TOLERANCES {
        total += find_finders(&inverse, tolerance, None, &mut edges).len();
    }
    total as u32
}

/// What the decoder does on a frame that yields no finder triple: greyscale,
/// then the scan at full size and at each reduced size that can hold a symbol.
/// Returns the number of finder candidates found in all.
/// `channels` is 4 (RGBA) or 1 (grey); rows are `width` pixels apart.
pub fn front(data: &[u8], width: usize, height: usize, channels: usize) -> u32 {
    let luminance = to_luminance(data, width, height, channels, width);
    let mut total = candidates(&luminance);
    let mut shrunk = Reductions::new(&luminance);
    for f in REDUCTIONS {
        if width / f < MIN_REDUCED || height / f < MIN_REDUCED {
            continue;
        }
        total += candidates(&shrunk.get(f));
    }
    total
}

#[cfg(target_arch = "wasm32")]
mod exports {
    /// Reserves `len` bytes of WebAssembly memory and returns their address.
    #[no_mangle]
    pub extern "C" fn alloc(len: usize) -> *mut u8 {
        let mut v = Vec::<u8>::with_capacity(len);
        let ptr = v.as_mut_ptr();
        std::mem::forget(v);
        ptr
    }

    /// Gives back what `alloc(len)` returned.
    ///
    /// # Safety
    /// `ptr` must come from `alloc(len)` with the same `len`, and not have been freed.
    #[no_mangle]
    pub unsafe extern "C" fn free(ptr: *mut u8, len: usize) {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }

    /// Runs the front end on `width` x `height` pixels at `ptr`, `channels`
    /// bytes each (1 or 4), and returns the finder candidates found.
    ///
    /// # Safety
    /// `ptr` must address `width * height * channels` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn front(ptr: *const u8, width: u32, height: u32, channels: u32) -> u32 {
        let len = width as usize * height as usize * channels as usize;
        super::front(std::slice::from_raw_parts(ptr, len), width as usize, height as usize, channels as usize)
    }

    /// Runs the whole decoder on `width` x `height` pixels at `ptr`, `channels`
    /// bytes each (1 or 4), rows `width` pixels apart, dark on light and then
    /// light on dark. Returns 0 when nothing reads, else the number of payload
    /// bytes read plus 1.
    ///
    /// # Safety
    /// `ptr` must address `width * height * channels` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn decode(ptr: *const u8, width: u32, height: u32, channels: u32) -> u32 {
        let len = width as usize * height as usize * channels as usize;
        let pixels = std::slice::from_raw_parts(ptr, len);
        match super::decode::decode(pixels, width as usize, height as usize, channels as usize, width as usize, super::decode::Inversion::Both, None) {
            Some(reading) => reading.payload.bytes.len() as u32 + 1,
            None => 0,
        }
    }

    // The encoder. Argument encoding, shared by `encode_text` and `encode_bytes`:
    //
    //   ecc          0 L, 1 M, 2 Q, 3 H
    //   version      0 for "the smallest that fits", else 1 to 40
    //   min_version  0 for 1, else 1 to 40
    //   mask         0xFFFFFFFF (-1) for "the best", else 0 to 7
    //   mode         0 for "the cheapest mix", 1 numeric, 2 alphanumeric, 3 byte
    //                (`encode_bytes` has no mode: bytes are one byte segment)
    //   eci          0 for none, nonzero for a UTF-8 ECI designator
    //
    // Both return a handle (never 0) for a finished symbol, or 0 on failure;
    // `encode_error()` then says why. Read the symbol with `qr_size`,
    // `qr_version`, `qr_mask`, `qr_mode` and `qr_modules` (the address of
    // `size * size` bytes, 1 for dark, row by row, no quiet zone, valid until
    // `qr_free`), then give the handle back with `qr_free`. Text is UTF-8;
    // bytes that are not valid UTF-8 become U+FFFD as TextEncoder would have
    // made them, so the JavaScript side need not check.

    use crate::encode::{encode, Error, Mode, Options, QrCode};
    use crate::symbol::Ecc;
    use std::cell::Cell;

    thread_local! {
        static LAST_ERROR: Cell<u32> = const { Cell::new(0) };
    }

    /// Why the last `encode_text` or `encode_bytes` returned 0: 1 data does not
    /// fit, 2 version out of range, 3 min_version out of range, 4 mask out of
    /// range, 5 version below min_version, 6 mode other than byte for bytes,
    /// 7 text outside the named mode, 8 unknown level, 9 unknown mode.
    #[no_mangle]
    pub extern "C" fn encode_error() -> u32 {
        LAST_ERROR.with(|e| e.get())
    }

    fn options(ecc: u32, version: u32, min_version: u32, mask: u32, mode: u32, eci: u32) -> Result<Options, u32> {
        let ecc = *Ecc::ORDER.get(ecc as usize).ok_or(8u32)?;
        let mode = match mode {
            0 => None,
            1 => Some(Mode::Numeric),
            2 => Some(Mode::Alphanumeric),
            3 => Some(Mode::Byte),
            _ => return Err(9),
        };
        Ok(Options {
            ecc,
            version: (version != 0).then_some(version as usize),
            min_version: (min_version != 0).then_some(min_version as usize),
            mask: (mask != u32::MAX).then_some(mask as usize),
            mode,
            eci: eci != 0,
        })
    }

    fn finish(result: Result<QrCode, Error>) -> u32 {
        match result {
            Ok(qr) => {
                LAST_ERROR.with(|e| e.set(0));
                Box::into_raw(Box::new(qr)) as usize as u32
            }
            Err(e) => {
                LAST_ERROR.with(|c| {
                    c.set(match e {
                        Error::Capacity { .. } => 1,
                        Error::InvalidVersion(_) => 2,
                        Error::InvalidMinVersion(_) => 3,
                        Error::InvalidMask(_) => 4,
                        Error::VersionBelowMinimum { .. } => 5,
                        Error::BytesNeedByteMode(_) => 6,
                        Error::NotInMode { .. } => 7,
                    })
                });
                0
            }
        }
    }

    /// Encodes the UTF-8 text of `len` bytes at `ptr`. See above for the other arguments.
    ///
    /// # Safety
    /// `ptr` must address `len` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn encode_text(ptr: *const u8, len: usize, ecc: u32, version: u32, min_version: u32, mask: u32, mode: u32, eci: u32) -> u32 {
        let bytes = if len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
        let text = String::from_utf8_lossy(bytes);
        match options(ecc, version, min_version, mask, mode, eci) {
            Ok(o) => finish(encode(&*text, &o)),
            Err(code) => {
                LAST_ERROR.with(|e| e.set(code));
                0
            }
        }
    }

    /// Encodes the `len` bytes at `ptr` as one byte segment. See above for the other arguments.
    ///
    /// # Safety
    /// `ptr` must address `len` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn encode_bytes(ptr: *const u8, len: usize, ecc: u32, version: u32, min_version: u32, mask: u32, eci: u32) -> u32 {
        let bytes = if len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
        match options(ecc, version, min_version, mask, 0, eci) {
            Ok(o) => finish(encode(bytes, &o)),
            Err(code) => {
                LAST_ERROR.with(|e| e.set(code));
                0
            }
        }
    }

    /// Modules per side of the symbol behind `handle`.
    ///
    /// # Safety
    /// `handle` must come from `encode_text` or `encode_bytes` and not have been freed.
    #[no_mangle]
    pub unsafe extern "C" fn qr_size(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).size as u32
    }

    /// The version, 1 to 40.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_version(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).version as u32
    }

    /// The mask, 0 to 7.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_mask(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).mask as u32
    }

    /// The widest mode: 1 numeric, 2 alphanumeric, 3 byte.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_mode(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).mode as u32 + 1
    }

    /// The address of the modules: `size * size` bytes, 1 for dark, valid until `qr_free`.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_modules(handle: u32) -> *const u8 {
        (*(handle as usize as *const QrCode)).modules.as_ptr()
    }

    /// Gives back a symbol. The handle is not valid afterwards.
    ///
    /// # Safety
    /// As `qr_size`, and each handle is freed once.
    #[no_mangle]
    pub unsafe extern "C" fn qr_free(handle: u32) {
        drop(Box::from_raw(handle as usize as *mut QrCode));
    }
}
