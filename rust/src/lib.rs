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
    /// The browser adapter's ABI version. Changes when existing exports change meaning.
    #[no_mangle]
    pub extern "C" fn qr_abi_version() -> u32 { if cfg!(feature = "host-text") { 2 } else { 1 } }

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

    // The whole result of a decode. `read_picture` and `read_grid` return a
    // handle (never 0) for a symbol read, or 0; `read_error()` then says why.
    // Give the handle back with `read_free`. Argument encoding:
    //
    //   read_picture(ptr, len, width, height, channels, row_stride, inversion)
    //     ptr, len     the pixels: `len` bytes at `ptr`, which must cover the
    //                  last row (`row_stride * (height - 1) + width` pixels of
    //                  `channels` bytes)
    //     channels     1 (grey) or 4 (RGBA)
    //     row_stride   pixels from one row to the next, at least `width`
    //     inversion    0 both (dark on light first), 1 normal, 2 inverted
    //   read_grid(ptr, len, size)
    //     the module grid of `size * size` bytes (nonzero for dark, row by
    //     row, no quiet zone) as `decode_modules` reads it; mirrored grids read
    //
    // `read_error()` after a call: 0 a symbol was read, 1 nothing read, 2
    // channels neither 1 nor 4, 3 width or height 0, 4 row_stride under
    // width, 5 fewer bytes than the picture or grid needs, 6 inversion not 0,
    // 1 or 2. Where the TypeScript `decode` throws, this is 2 to 6; where it
    // returns undefined, this is 1.
    //
    // Accessors take the handle. Pointers address bytes inside the WebAssembly
    // memory, valid until `read_free`, and are not to be read when the length
    // is 0. Booleans are 0 or 1. Coordinates are `f64`, which the host sees as
    // JavaScript numbers with the same bits.
    //
    //   read_bytes_ptr, read_bytes_len     the payload bytes
    //   read_text_ptr, read_text_len       the text as UTF-8
    //   read_version, read_level (0 L, 1 M, 2 Q, 3 H), read_mask, read_corrected
    //   read_mirrored, read_inverted
    //   read_eci_count, read_eci(h, i)     the ECI assignments, in order
    //   read_located(h)                    1 for a picture, 0 for a grid
    //   read_point_x(h, which), read_point_y(h, which)
    //                                      which 0 top-left, 1 top-right,
    //                                      2 bottom-left, 3 alignment; 0.0 for
    //                                      a grid
    //   read_has_alignment(h)
    //   read_sa_present, read_sa_index, read_sa_total, read_sa_parity
    //   read_fnc1(h)                       0 none, 1 first position, 2 second
    //   read_fnc1_ptr, read_fnc1_len       the application indicator (second
    //                                      position only), ASCII
    //
    // The eight work counters of the last `read_picture` (steps, compared,
    // scanned, maps, second, meshes, probed, reduced; all zero after a bad
    // argument or `read_grid`) are 64-bit, so they come as two unsigned 32-bit
    // halves: `work_low(i)` and `work_high(i)`, for i 0 to 7. The host joins
    // them as high * 2^32 + low. They stay readable after a call that read
    // nothing.

    use crate::decode::{decode as decode_picture, Inversion, Place};
    use crate::locate::Work;
    use crate::symbol::{decode_modules, Fnc1, Payload};

    struct Read {
        payload: Payload,
        mirrored: bool,
        inverted: bool,
        location: Option<Place>,
    }

    thread_local! {
        static LAST_READ_ERROR: Cell<u32> = const { Cell::new(0) };
        static LAST_WORK: Cell<[u64; 8]> = const { Cell::new([0; 8]) };
    }

    /// Why the last `read_picture` or `read_grid` returned 0; 0 if it read a symbol.
    #[no_mangle]
    pub extern "C" fn read_error() -> u32 {
        LAST_READ_ERROR.with(|e| e.get())
    }

    fn set_work(work: [u64; 8]) {
        LAST_WORK.with(|w| w.set(work));
    }

    fn fail(code: u32) -> u32 {
        LAST_READ_ERROR.with(|e| e.set(code));
        0
    }

    fn handle(read: Read) -> u32 {
        LAST_READ_ERROR.with(|e| e.set(0));
        Box::into_raw(Box::new(read)) as usize as u32
    }

    /// Decodes the picture. See above for the arguments.
    ///
    /// # Safety
    /// `ptr` must address `len` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn read_picture(ptr: *const u8, len: usize, width: u32, height: u32, channels: u32, row_stride: u32, inversion: u32) -> u32 {
        set_work([0; 8]);
        if channels != 1 && channels != 4 {
            return fail(2);
        }
        if width == 0 || height == 0 {
            return fail(3);
        }
        if row_stride < width {
            return fail(4);
        }
        let inversion = match inversion {
            0 => Inversion::Both,
            1 => Inversion::Normal,
            2 => Inversion::Inverted,
            _ => return fail(6),
        };
        let needed = (row_stride as u64 * (height as u64 - 1) + width as u64) * channels as u64;
        if (len as u64) < needed {
            return fail(5);
        }
        let pixels = std::slice::from_raw_parts(ptr, len);
        let mut work = Work::default();
        let found = decode_picture(pixels, width as usize, height as usize, channels as usize, row_stride as usize, inversion, Some(&mut work));
        set_work([work.steps, work.compared, work.scanned, work.maps, work.second, work.meshes, work.probed, work.reduced]);
        match found {
            Some(r) => handle(Read { payload: r.payload, mirrored: r.mirrored, inverted: r.inverted, location: Some(r.location) }),
            None => fail(1),
        }
    }

    /// Reads the module grid. See above for the arguments.
    ///
    /// # Safety
    /// `ptr` must address `len` readable bytes.
    #[no_mangle]
    pub unsafe extern "C" fn read_grid(ptr: *const u8, len: usize, size: u32) -> u32 {
        set_work([0; 8]);
        if (len as u64) < size as u64 * size as u64 {
            return fail(5);
        }
        let modules = if len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
        match decode_modules(modules, size as usize) {
            Some(d) => handle(Read { payload: d.payload, mirrored: d.mirrored, inverted: false, location: None }),
            None => fail(1),
        }
    }

    unsafe fn read<'a>(h: u32) -> &'a Read {
        &*(h as usize as *const Read)
    }

    /// Gives back a result. The handle is not valid afterwards.
    ///
    /// # Safety
    /// `h` must come from `read_picture` or `read_grid` and be freed once.
    #[no_mangle]
    pub unsafe extern "C" fn read_free(h: u32) {
        drop(Box::from_raw(h as usize as *mut Read));
    }

    macro_rules! accessors {
        ($($name:ident($r:ident) -> $t:ty $body:block)*) => {
            $(
                /// An accessor on a result handle; see the notes above.
                ///
                /// # Safety
                /// `h` must come from `read_picture` or `read_grid` and not have been freed.
                #[no_mangle]
                pub unsafe extern "C" fn $name(h: u32) -> $t {
                    let $r = read(h);
                    $body
                }
            )*
        };
    }

    accessors! {
        read_bytes_ptr(r) -> *const u8 { r.payload.bytes.as_ptr() }
        read_bytes_len(r) -> u32 { r.payload.bytes.len() as u32 }
        read_text_ptr(r) -> *const u8 { r.payload.text.as_ptr() }
        read_text_len(r) -> u32 { r.payload.text.len() as u32 }
        read_version(r) -> u32 { r.payload.version as u32 }
        read_level(r) -> u32 { r.payload.ecc as u32 }
        read_mask(r) -> u32 { r.payload.mask as u32 }
        read_corrected(r) -> u32 { r.payload.corrected as u32 }
        read_mirrored(r) -> u32 { r.mirrored as u32 }
        read_inverted(r) -> u32 { r.inverted as u32 }
        read_eci_count(r) -> u32 { r.payload.eci.len() as u32 }
        read_located(r) -> u32 { r.location.is_some() as u32 }
        read_has_alignment(r) -> u32 { r.location.is_some_and(|p| p.alignment.is_some()) as u32 }
        read_sa_present(r) -> u32 { r.payload.structured_append.is_some() as u32 }
        read_sa_index(r) -> u32 { r.payload.structured_append.map_or(0, |s| s.index) }
        read_sa_total(r) -> u32 { r.payload.structured_append.map_or(0, |s| s.total) }
        read_sa_parity(r) -> u32 { r.payload.structured_append.map_or(0, |s| s.parity) }
        read_fnc1(r) -> u32 {
            match r.payload.fnc1 {
                None => 0,
                Some(Fnc1::First) => 1,
                Some(Fnc1::Second(_)) => 2,
            }
        }
        read_fnc1_ptr(r) -> *const u8 {
            match &r.payload.fnc1 {
                Some(Fnc1::Second(s)) => s.as_ptr(),
                _ => std::ptr::NonNull::dangling().as_ptr(),
            }
        }
        read_fnc1_len(r) -> u32 {
            match &r.payload.fnc1 {
                Some(Fnc1::Second(s)) => s.len() as u32,
                _ => 0,
            }
        }
    }

    /// The `i`th ECI assignment (0 when `i` is out of range).
    ///
    /// # Safety
    /// As the other accessors.
    #[no_mangle]
    pub unsafe extern "C" fn read_eci(h: u32, i: u32) -> u32 {
        read(h).payload.eci.get(i as usize).copied().unwrap_or(0)
    }

    fn point(r: &Read, which: u32) -> Option<crate::place::Point> {
        let p = r.location?;
        match which {
            0 => Some(p.top_left),
            1 => Some(p.top_right),
            2 => Some(p.bottom_left),
            3 => p.alignment,
            _ => None,
        }
    }

    /// The x of a location point (see above for `which`); 0.0 if there is none.
    ///
    /// # Safety
    /// As the other accessors.
    #[no_mangle]
    pub unsafe extern "C" fn read_point_x(h: u32, which: u32) -> f64 {
        point(read(h), which).map_or(0.0, |p| p.x)
    }

    /// The y of a location point (see above for `which`); 0.0 if there is none.
    ///
    /// # Safety
    /// As the other accessors.
    #[no_mangle]
    pub unsafe extern "C" fn read_point_y(h: u32, which: u32) -> f64 {
        point(read(h), which).map_or(0.0, |p| p.y)
    }

    /// The low 32 bits of work counter `i` (0 to 7) of the last `read_picture`.
    #[no_mangle]
    pub extern "C" fn work_low(i: u32) -> u32 {
        LAST_WORK.with(|w| w.get().get(i as usize).map_or(0, |&v| v as u32))
    }

    /// The high 32 bits of work counter `i` (0 to 7) of the last `read_picture`.
    #[no_mangle]
    pub extern "C" fn work_high(i: u32) -> u32 {
        LAST_WORK.with(|w| w.get().get(i as usize).map_or(0, |&v| (v >> 32) as u32))
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

    /// The level: 0 L, 1 M, 2 Q, 3 H.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_level(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).ecc as u32
    }

    /// Number of data segments.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_segments(handle: u32) -> u32 {
        (*(handle as usize as *const QrCode)).segments.len() as u32
    }

    /// Segment mode: 1 numeric, 2 alphanumeric, 3 byte; 0 for an invalid index.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_segment_mode(handle: u32, index: u32) -> u32 {
        (&(*(handle as usize as *const QrCode)).segments).get(index as usize).map_or(0, |s| s.mode as u32 + 1)
    }

    /// Segment character count (byte count in byte mode); 0 for an invalid index.
    ///
    /// # Safety
    /// As `qr_size`.
    #[no_mangle]
    pub unsafe extern "C" fn qr_segment_count(handle: u32, index: u32) -> u32 {
        (&(*(handle as usize as *const QrCode)).segments).get(index as usize).map_or(0, |s| s.count as u32)
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
