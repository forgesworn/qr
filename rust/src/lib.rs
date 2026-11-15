//! The QR decoder, ported from the TypeScript reference: greyscale,
//! binarisation, reduction and the finder scan (SPEC.md, decoder steps 1, 2, 3
//! and 9), finder triples, size estimates and sampling maps (steps 4 and 5),
//! and reading a module grid (steps 6 and 7). `decode::decode_ordinary` is the
//! ordinary search at full size. The second look and the reduced-size pass are
//! not ported.

pub mod binarise;
pub mod decode;
pub mod locate;
pub mod place;
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

    /// Runs the ordinary search on `width` x `height` pixels at `ptr`,
    /// `channels` bytes each (1 or 4). Returns 0 when nothing reads, else the
    /// number of payload bytes read plus 1.
    ///
    /// # Safety
    /// `ptr` must address `width * height * channels` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn ordinary(ptr: *const u8, width: u32, height: u32, channels: u32) -> u32 {
        let len = width as usize * height as usize * channels as usize;
        let pixels = std::slice::from_raw_parts(ptr, len);
        match super::decode::decode_ordinary(pixels, width as usize, height as usize, channels as usize, None) {
            Some(reading) => reading.payload.bytes.len() as u32 + 1,
            None => 0,
        }
    }
}
