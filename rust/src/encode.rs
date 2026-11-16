//! The encoder, written from SPEC.md (Input to Output): mode and segment
//! choice, version choice, the bit stream, padding, Reed-Solomon, the matrix,
//! masks and their penalties, format and version information.
//!
//! The function-pattern grid, the order of the data modules, the mask
//! conditions, the format and version codes, GF(256) and Table 9 are the
//! decoder's own (`symbol`, `tables`); only drawing the function patterns,
//! Reed-Solomon encoding and the penalty scoring are here.

use crate::symbol::{
    format_bits_of, gf_mul, mask_bit, placement, reserved, version_bits_of, Ecc, ALPHANUMERIC, EXP, FORMAT_COORDS,
};
use crate::tables::{ALIGNMENT_CENTRES, EC_BLOCKS};
use std::fmt;

/// Data mode of a segment.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Mode {
    Numeric,
    Alphanumeric,
    Byte,
}

impl Mode {
    pub const ALL: [Mode; 3] = [Mode::Numeric, Mode::Alphanumeric, Mode::Byte];

    /// The name the vectors and the TypeScript use.
    pub fn name(self) -> &'static str {
        match self {
            Mode::Numeric => "numeric",
            Mode::Alphanumeric => "alphanumeric",
            Mode::Byte => "byte",
        }
    }

    fn indicator(self) -> u32 {
        match self {
            Mode::Numeric => 1,
            Mode::Alphanumeric => 2,
            Mode::Byte => 4,
        }
    }

    /// Count field widths for versions 1-9, 10-26 and 27-40.
    fn count_bits(self, band: usize) -> usize {
        match self {
            Mode::Numeric => [10, 12, 14][band],
            Mode::Alphanumeric => [9, 11, 13][band],
            Mode::Byte => [8, 16, 16][band],
        }
    }
}

/// One data segment of a symbol, in stream order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Segment {
    pub mode: Mode,
    /// Characters in numeric and alphanumeric mode, bytes in byte mode.
    pub count: usize,
}

/// What the caller may ask of the encoder. `Options::default()` is level M,
/// the smallest version that fits, the best mask, the cheapest mix of
/// segments and no ECI designator.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Options {
    /// Error correction level. Default M.
    pub ecc: Ecc,
    /// Exact version, 1 to 40, not below `min_version`. Default: the smallest that fits.
    pub version: Option<usize>,
    /// Smallest version to consider when choosing one. Default 1.
    pub min_version: Option<usize>,
    /// Mask pattern, 0 to 7. Default: the one with the lowest penalty.
    pub mask: Option<usize>,
    /// Encode the whole text as one segment of this mode. Bytes are always byte mode.
    pub mode: Option<Mode>,
    /// Start a stream that has a byte segment with an ECI designator for UTF-8.
    pub eci: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options { ecc: Ecc::M, version: None, min_version: None, mask: None, mode: None, eci: false }
    }
}

/// What is wrong with a call to the encoder.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Error {
    /// The data does not fit the requested version, or any version
    /// (`version` is `None` then). The TypeScript's `QrCapacityError`.
    Capacity { ecc: Ecc, version: Option<usize> },
    /// `version` is not from 1 to 40.
    InvalidVersion(usize),
    /// `min_version` is not from 1 to 40.
    InvalidMinVersion(usize),
    /// `mask` is not from 0 to 7.
    InvalidMask(usize),
    /// A requested version below `min_version`.
    VersionBelowMinimum { version: usize, min_version: usize },
    /// Bytes were given with a mode other than byte.
    BytesNeedByteMode(Mode),
    /// A named mode that cannot hold a character of the text.
    NotInMode { mode: Mode, found: char },
}

impl Error {
    /// True for data that does not fit, false for a bad option.
    pub fn is_capacity(&self) -> bool {
        matches!(self, Error::Capacity { .. })
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Capacity { ecc, version: None } => write!(f, "Data does not fit any version at level {}", ecc.letter()),
            Error::Capacity { ecc, version: Some(v) } => write!(f, "Data does not fit version {v} at level {}", ecc.letter()),
            Error::InvalidVersion(_) => f.write_str("Version must be an integer from 1 to 40"),
            Error::InvalidMinVersion(_) => f.write_str("minVersion must be an integer from 1 to 40"),
            Error::InvalidMask(_) => f.write_str("Mask must be an integer from 0 to 7"),
            Error::VersionBelowMinimum { .. } => f.write_str("Version is below minVersion"),
            Error::BytesNeedByteMode(_) => f.write_str("Bytes can only be encoded in byte mode"),
            Error::NotInMode { mode: Mode::Numeric, .. } => f.write_str("Numeric mode takes digits only"),
            Error::NotInMode { found, .. } => write!(f, "Not in the alphanumeric set: {found}"),
        }
    }
}

impl std::error::Error for Error {}

/// A finished symbol.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QrCode {
    pub version: usize,
    pub ecc: Ecc,
    pub mask: u8,
    /// The widest mode among the segments: byte, else alphanumeric, else numeric.
    pub mode: Mode,
    /// The data segments in order.
    pub segments: Vec<Segment>,
    /// Modules per side, 17 + 4 * version. Excludes the quiet zone.
    pub size: usize,
    /// Row-major modules, `size * size` entries, 1 for dark.
    pub modules: Vec<u8>,
    /// Length of the bit stream before the terminator (the vectors' `bits`).
    pub bits: usize,
}

impl QrCode {
    /// True if the module at column `x`, row `y` is dark; false outside the symbol.
    pub fn is_dark(&self, x: i64, y: i64) -> bool {
        is_dark(self, x, y)
    }
}

/// True if the module at column `x`, row `y` is dark; false outside the symbol
/// (the quiet zone is light).
pub fn is_dark(qr: &QrCode, x: i64, y: i64) -> bool {
    let size = qr.size as i64;
    x >= 0 && y >= 0 && x < size && y < size && qr.modules[(y * size + x) as usize] == 1
}

/// What can be encoded: text (a `&str`, which cannot hold a lone surrogate) or bytes.
#[derive(Clone, Copy, Debug)]
pub enum Data<'a> {
    Text(&'a str),
    Bytes(&'a [u8]),
}

impl<'a> From<&'a str> for Data<'a> {
    fn from(v: &'a str) -> Self {
        Data::Text(v)
    }
}
impl<'a> From<&'a String> for Data<'a> {
    fn from(v: &'a String) -> Self {
        Data::Text(v)
    }
}
impl<'a> From<&'a [u8]> for Data<'a> {
    fn from(v: &'a [u8]) -> Self {
        Data::Bytes(v)
    }
}
impl<'a> From<&'a Vec<u8>> for Data<'a> {
    fn from(v: &'a Vec<u8>) -> Self {
        Data::Bytes(v)
    }
}
impl<'a, const N: usize> From<&'a [u8; N]> for Data<'a> {
    fn from(v: &'a [u8; N]) -> Self {
        Data::Bytes(v)
    }
}

/// Segment data: ASCII characters in numeric and alphanumeric mode, the bytes in byte mode.
struct Part {
    mode: Mode,
    data: Vec<u8>,
}

fn count_band(version: usize) -> usize {
    if version <= 9 {
        0
    } else if version <= 26 {
        1
    } else {
        2
    }
}

fn blocks_for(version: usize, ecc: Ecc) -> [usize; 4] {
    EC_BLOCKS[version - 1][ecc.index()].map(|v| v as usize)
}

fn data_codewords(version: usize, ecc: Ecc) -> usize {
    let [_, g1, d1, g2] = blocks_for(version, ecc);
    g1 * d1 + g2 * (d1 + 1)
}

fn valid_version(v: usize) -> bool {
    (1..=40).contains(&v)
}

/// Encodes text (as UTF-8 where byte mode is needed) or bytes as one QR code.
pub fn encode<'a>(data: impl Into<Data<'a>>, options: &Options) -> Result<QrCode, Error> {
    let data = data.into();
    let ecc = options.ecc;
    if let Some(m) = options.mask {
        if m > 7 {
            return Err(Error::InvalidMask(m));
        }
    }
    if let Some(v) = options.version {
        if !valid_version(v) {
            return Err(Error::InvalidVersion(v));
        }
    }
    let min_version = options.min_version.unwrap_or(1);
    if !valid_version(min_version) {
        return Err(Error::InvalidMinVersion(min_version));
    }
    if let Some(v) = options.version {
        if v < min_version {
            return Err(Error::VersionBelowMinimum { version: v, min_version });
        }
    }
    if let (Data::Bytes(_), Some(m)) = (data, options.mode) {
        if m != Mode::Byte {
            return Err(Error::BytesNeedByteMode(m));
        }
    }
    // Input no version can hold is refused before anything is built from it.
    let length = match data {
        Data::Text(t) => t.encode_utf16().count(),
        Data::Bytes(b) => b.len(),
    };
    if length > max_input(data, options.mode, ecc, options.version.unwrap_or(40)) {
        return Err(Error::Capacity { ecc, version: options.version });
    }

    // One segment for bytes or a named mode; otherwise the cheapest mix, which
    // can differ by count field band, so it is worked out per band as needed.
    let single = single_part(data, options.mode)?;
    let text: Option<Vec<char>> = match (&single, data) {
        (None, Data::Text(t)) => Some(t.chars().collect()),
        _ => None,
    };
    let mut planner = Planner { text, single, plans: [None, None, None] };
    let eci = options.eci;
    let fits = |planner: &mut Planner, version: usize| {
        stream_length(planner.parts(version), version, eci) <= data_codewords(version, ecc) * 8
    };

    let version = match options.version {
        None => match (min_version..=40).find(|&v| fits(&mut planner, v)) {
            Some(v) => v,
            None => return Err(Error::Capacity { ecc, version: None }),
        },
        Some(v) => {
            if !fits(&mut planner, v) {
                return Err(Error::Capacity { ecc, version: Some(v) });
            }
            v
        }
    };

    let band = count_band(version);
    let parts = planner.parts(version);
    let capacity = data_codewords(version, ecc) * 8;
    let mut bits: Vec<u8> = Vec::with_capacity(capacity);
    if eci && parts.iter().any(|p| p.mode == Mode::Byte) {
        push(&mut bits, 7, 4);
        push(&mut bits, 26, 8);
    }
    for part in parts {
        push(&mut bits, part.mode.indicator(), 4);
        push(&mut bits, part.data.len() as u32, part.mode.count_bits(band));
        append_data(&mut bits, part);
    }
    let stream_bits = bits.len();
    for _ in 0..4 {
        if bits.len() < capacity {
            bits.push(0);
        }
    }
    while bits.len() % 8 != 0 {
        bits.push(0);
    }
    let mut codewords: Vec<u8> = bits.chunks(8).map(|c| c.iter().fold(0u8, |a, &b| (a << 1) | b)).collect();
    let mut pad = 0xecu8;
    while codewords.len() < capacity / 8 {
        codewords.push(pad);
        pad ^= 0xec ^ 0x11;
    }

    let stream = interleave(&codewords, version, ecc);
    let grid = Grid::new(version, &stream);
    let size = grid.size;
    let (chosen, modules) = match options.mask {
        Some(m) => (m as u8, grid.render(ecc, m as u8)),
        None => {
            let mut best = u32::MAX;
            let mut chosen = 0u8;
            let mut best_modules = Vec::new();
            for m in 0..8u8 {
                let candidate = grid.render(ecc, m);
                let score = penalty(&candidate, size, best);
                if score < best {
                    best = score;
                    chosen = m;
                    best_modules = candidate;
                }
            }
            (chosen, best_modules)
        }
    };
    let segments: Vec<Segment> = parts.iter().map(|p| Segment { mode: p.mode, count: p.data.len() }).collect();
    let mode = parts.iter().map(|p| p.mode).max().unwrap_or(Mode::Byte);
    Ok(QrCode { version, ecc, mask: chosen, mode, segments, size, modules, bits: stream_bits })
}

/// The segments for each count field band, worked out when first needed.
struct Planner {
    text: Option<Vec<char>>,
    single: Option<Part>,
    plans: [Option<Vec<Part>>; 3],
}

impl Planner {
    fn parts(&mut self, version: usize) -> &[Part] {
        let band = count_band(version);
        let (text, single) = (&self.text, &self.single);
        self.plans[band].get_or_insert_with(|| match (text, single) {
            (Some(chars), _) => optimal_parts(chars, band),
            (None, Some(part)) => vec![Part { mode: part.mode, data: part.data.clone() }],
            (None, None) => Vec::new(), // not reached: there is text whenever there is no single part
        })
    }
}

/// The most bytes (bytes) or UTF-16 code units (text) that any version up to
/// `highest` can hold at this level (SPEC.md, Version and level).
fn max_input(data: Data, requested: Option<Mode>, ecc: Ecc, highest: usize) -> usize {
    let available = (data_codewords(highest, ecc) * 8) as i64 - 4;
    let band = count_band(highest);
    let mode = match data {
        Data::Text(_) => requested,
        Data::Bytes(_) => Some(Mode::Byte),
    };
    let n = match mode {
        Some(Mode::Byte) => (available - Mode::Byte.count_bits(band) as i64) / 8,
        Some(Mode::Numeric) => (available - Mode::Numeric.count_bits(band) as i64) * 3 / 10,
        Some(Mode::Alphanumeric) => (available - Mode::Alphanumeric.count_bits(band) as i64) * 2 / 11,
        None => {
            let narrowest = Mode::ALL.iter().map(|m| m.count_bits(band)).min().unwrap_or(0) as i64;
            (available - narrowest) * 3 / 10
        }
    };
    n.max(0) as usize
}

/// The one segment for bytes or a named mode; `None` when the encoder should choose.
fn single_part(data: Data, requested: Option<Mode>) -> Result<Option<Part>, Error> {
    let text = match data {
        Data::Bytes(b) => return Ok(Some(Part { mode: Mode::Byte, data: b.to_vec() })),
        Data::Text(t) => t,
    };
    match requested {
        Some(Mode::Numeric) => {
            if let Some(c) = text.chars().find(|c| !c.is_ascii_digit()) {
                return Err(Error::NotInMode { mode: Mode::Numeric, found: c });
            }
            Ok(Some(Part { mode: Mode::Numeric, data: text.as_bytes().to_vec() }))
        }
        Some(Mode::Alphanumeric) => {
            if let Some(c) = text.chars().find(|c| !(c.is_ascii() && ALPHANUMERIC.contains(&(*c as u8)))) {
                return Err(Error::NotInMode { mode: Mode::Alphanumeric, found: c });
            }
            Ok(Some(Part { mode: Mode::Alphanumeric, data: text.as_bytes().to_vec() }))
        }
        Some(Mode::Byte) => Ok(Some(Part { mode: Mode::Byte, data: text.as_bytes().to_vec() })),
        None if text.is_empty() => Ok(Some(Part { mode: Mode::Byte, data: Vec::new() })),
        None => Ok(None),
    }
}

/// Bits of the whole stream before the terminator: one ECI designator if any, then each segment.
fn stream_length(parts: &[Part], version: usize, eci: bool) -> usize {
    let band = count_band(version);
    let mut total = if eci && parts.iter().any(|p| p.mode == Mode::Byte) { 12 } else { 0 };
    for part in parts {
        let count_bits = part.mode.count_bits(band);
        if part.data.len() >= 1usize << count_bits {
            return usize::MAX;
        }
        total += 4 + count_bits + data_length(part.mode, part.data.len());
    }
    total
}

fn data_length(mode: Mode, n: usize) -> usize {
    match mode {
        Mode::Numeric => n / 3 * 10 + [0, 4, 7][n % 3],
        Mode::Alphanumeric => n / 2 * 11 + (n % 2) * 6,
        Mode::Byte => n * 8,
    }
}

fn push(bits: &mut Vec<u8>, value: u32, length: usize) {
    for i in (0..length).rev() {
        bits.push(((value >> i) & 1) as u8);
    }
}

fn append_data(bits: &mut Vec<u8>, part: &Part) {
    match part.mode {
        Mode::Byte => {
            for &b in &part.data {
                push(bits, b as u32, 8);
            }
        }
        Mode::Numeric => {
            for group in part.data.chunks(3) {
                let value = group.iter().fold(0u32, |a, &d| a * 10 + (d - b'0') as u32);
                push(bits, value, group.len() * 3 + 1);
            }
        }
        Mode::Alphanumeric => {
            let index = |c: u8| ALPHANUMERIC.iter().position(|&a| a == c).unwrap_or(0) as u32;
            for pair in part.data.chunks(2) {
                if pair.len() == 2 {
                    push(bits, index(pair[0]) * 45 + index(pair[1]), 11);
                } else {
                    push(bits, index(pair[0]), 6);
                }
            }
        }
    }
}

// Optimal segmentation (SPEC.md, Mode). The state before a character is the
// open segment: 0 none, 1-3 numeric holding 3k, 3k+1 or 3k+2 digits, 4-5
// alphanumeric holding an even or odd count, 6 byte. Costs are whole bits
// with the segment count in the low bits, so totals and ties are exact. A
// backward pass gives each state's cheapest (bits, segments) to the end; the
// forward walk takes the first mode, in the order numeric, alphanumeric,
// byte, that keeps that optimum.
const STATE_MODE: [i8; 7] = [-1, 0, 0, 0, 1, 1, 2];
/// Bits for one more character in each state's segment (times the UTF-8 length in byte mode).
const STEP_BITS: [u64; 7] = [0, 4, 3, 3, 6, 5, 8];
const STEP_NEXT: [usize; 7] = [0, 2, 3, 1, 5, 4, 6];
/// The state whose step a new segment's first character takes, per mode.
const OPENING: [usize; 3] = [1, 4, 6];
/// Cost is bits * SEGMENTS + segments; a symbol never has this many segments.
const SEGMENTS: u64 = 1 << 20;

fn optimal_parts(chars: &[char], band: usize) -> Vec<Part> {
    let n = chars.len();
    let kinds: Vec<usize> = chars
        .iter()
        .map(|&c| {
            if c.is_ascii_digit() {
                0
            } else if c.is_ascii() && ALPHANUMERIC.contains(&(c as u8)) {
                1
            } else {
                2
            }
        })
        .collect();
    let lengths: Vec<u64> = chars.iter().map(|c| c.len_utf8() as u64).collect();
    let head: [u64; 3] = [0, 1, 2].map(|m| 4 + Mode::ALL[m].count_bits(band) as u64);
    let mut cost = vec![0u64; (n + 1) * 7];
    let via = |cost: &[u64], i: usize, s: usize, m: usize| -> u64 {
        let open = STATE_MODE[s] != m as i8;
        let t = if open { OPENING[m] } else { s };
        let step = STEP_BITS[t] * if m == 2 { lengths[i] } else { 1 } + if open { head[m] } else { 0 };
        step * SEGMENTS + open as u64 + cost[(i + 1) * 7 + STEP_NEXT[t]]
    };
    for i in (0..n).rev() {
        for s in 0..7 {
            let mut best = u64::MAX;
            for m in kinds[i]..3 {
                best = best.min(via(&cost, i, s, m));
            }
            cost[i * 7 + s] = best;
        }
    }
    let mut parts: Vec<Part> = Vec::new();
    let close = |parts: &mut Vec<Part>, start: usize, end: usize, m: usize| {
        let mut data = Vec::new();
        for &c in &chars[start..end] {
            if m == 2 {
                let mut buf = [0u8; 4];
                data.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
            } else {
                data.push(c as u8);
            }
        }
        parts.push(Part { mode: Mode::ALL[m], data });
    };
    let mut state = 0usize;
    let mut start = 0usize;
    for i in 0..n {
        let m = (kinds[i]..3).find(|&m| via(&cost, i, state, m) == cost[i * 7 + state]).unwrap_or(2);
        let open = STATE_MODE[state] != m as i8;
        if open {
            if i > 0 {
                close(&mut parts, start, i, STATE_MODE[state] as usize);
            }
            start = i;
        }
        state = STEP_NEXT[if open { OPENING[m] } else { state }];
    }
    if n > 0 {
        close(&mut parts, start, n, STATE_MODE[state] as usize);
    }
    parts
}

// Reed-Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1, roots alpha^0 .. alpha^(n-1).

/// Monic generator polynomial of the given degree, highest coefficient first.
fn generator(degree: usize) -> Vec<u8> {
    let mut poly = vec![1u8];
    for i in 0..degree {
        let mut next = vec![0u8; poly.len() + 1];
        for (j, &c) in poly.iter().enumerate() {
            next[j] ^= c;
            next[j + 1] ^= gf_mul(c, EXP[i]);
        }
        poly = next;
    }
    poly
}

fn remainder(data: &[u8], gen: &[u8]) -> Vec<u8> {
    let degree = gen.len() - 1;
    let mut out = vec![0u8; degree];
    for &byte in data {
        let factor = byte ^ out[0];
        out.copy_within(1.., 0);
        out[degree - 1] = 0;
        for i in 0..degree {
            out[i] ^= gf_mul(gen[i + 1], factor);
        }
    }
    out
}

/// Data codewords interleaved by index across blocks, then the check codewords the same way.
fn interleave(codewords: &[u8], version: usize, ecc: Ecc) -> Vec<u8> {
    let [ec_per_block, g1, d1, g2] = blocks_for(version, ecc);
    let gen = generator(ec_per_block);
    let mut data: Vec<&[u8]> = Vec::new();
    let mut checks: Vec<Vec<u8>> = Vec::new();
    let mut offset = 0;
    for b in 0..g1 + g2 {
        let length = if b < g1 { d1 } else { d1 + 1 };
        let block = &codewords[offset..offset + length];
        offset += length;
        data.push(block);
        checks.push(remainder(block, &gen));
    }
    let mut out = Vec::with_capacity(codewords.len() + (g1 + g2) * ec_per_block);
    for i in 0..=d1 {
        for block in &data {
            if i < block.len() {
                out.push(block[i]);
            }
        }
    }
    for i in 0..ec_per_block {
        for block in &checks {
            out.push(block[i]);
        }
    }
    out
}

/// The symbol before masking: function patterns drawn, data placed.
struct Grid {
    size: usize,
    version: usize,
    base: Vec<u8>,
    reserved: Vec<bool>,
}

impl Grid {
    fn new(version: usize, stream: &[u8]) -> Grid {
        let s = 17 + 4 * version;
        let mut base = vec![0u8; s * s];
        // What has been drawn so far: alignment patterns win over timing where they cross.
        let mut done = vec![false; s * s];
        fn put(base: &mut [u8], done: &mut [bool], s: usize, x: usize, y: usize, dark: u8) {
            base[y * s + x] = dark;
            done[y * s + x] = true;
        }
        for (left, top) in [(0i32, 0i32), (s as i32 - 7, 0), (0, s as i32 - 7)] {
            for dy in -1..=7i32 {
                for dx in -1..=7i32 {
                    let (x, y) = (left + dx, top + dy);
                    if x < 0 || y < 0 || x >= s as i32 || y >= s as i32 {
                        continue;
                    }
                    let ring = (dx - 3).abs().max((dy - 3).abs());
                    put(&mut base, &mut done, s, x as usize, y as usize, (ring != 2 && ring != 4) as u8);
                }
            }
        }
        put(&mut base, &mut done, s, 8, s - 8, 1);
        let in_finder = |x: usize, y: usize| (x < 8 && y < 8) || (x >= s - 8 && y < 8) || (x < 8 && y >= s - 8);
        let centres = ALIGNMENT_CENTRES[version - 1];
        for &cy in centres {
            for &cx in centres {
                let (cx, cy) = (cx as usize, cy as usize);
                if in_finder(cx, cy) {
                    continue;
                }
                for dy in -2i32..=2 {
                    for dx in -2i32..=2 {
                        let dark = dx.abs().max(dy.abs()) != 1;
                        put(&mut base, &mut done, s, (cx as i32 + dx) as usize, (cy as i32 + dy) as usize, dark as u8);
                    }
                }
            }
        }
        for i in 8..s - 8 {
            if !done[6 * s + i] {
                put(&mut base, &mut done, s, i, 6, (i % 2 == 0) as u8);
            }
            if !done[i * s + 6] {
                put(&mut base, &mut done, s, 6, i, (i % 2 == 0) as u8);
            }
        }
        // The data modules, in the order the standard places them; remainder bits stay light.
        let reserved = reserved(version);
        for (k, &at) in placement(version).iter().enumerate() {
            let (x, y) = ((at & 0xff) as usize, (at >> 8) as usize);
            if k < stream.len() * 8 {
                base[y * s + x] = (stream[k >> 3] >> (7 - (k & 7))) & 1;
            }
        }
        Grid { size: s, version, base, reserved }
    }

    /// A copy with the data masked and the format and version information drawn.
    fn render(&self, ecc: Ecc, mask: u8) -> Vec<u8> {
        let s = self.size;
        let mut out = self.base.clone();
        for y in 0..s {
            for x in 0..s {
                if !self.reserved[y * s + x] && mask_bit(mask, x, y) {
                    out[y * s + x] ^= 1;
                }
            }
        }
        let level = match ecc {
            Ecc::L => 1,
            Ecc::M => 0,
            Ecc::Q => 3,
            Ecc::H => 2,
        };
        let format = format_bits_of(level, mask as u32);
        for (i, &(x, y)) in FORMAT_COORDS.iter().enumerate() {
            let bit = ((format >> i) & 1) as u8;
            out[y * s + x] = bit;
            if i < 8 {
                out[8 * s + (s - 1 - i)] = bit;
            } else {
                out[(s - 7 + (i - 8)) * s + 8] = bit;
            }
        }
        if self.version >= 7 {
            let info = version_bits_of(self.version as u32);
            for k in 0..18 {
                let bit = ((info >> k) & 1) as u8;
                let (i, j) = (k / 3, k % 3);
                out[(s - 11 + j) * s + i] = bit;
                out[i * s + (s - 11 + j)] = bit;
            }
        }
        out
    }
}

/// Mask penalty per ISO/IEC 18004 section 7.8.3, scoring the finished symbol.
fn penalty(m: &[u8], size: usize, limit: u32) -> u32 {
    let mut score = 0u32;
    let mut dark = 0u32;
    for y in 0..size {
        let (mut row_run, mut col_run) = (0u32, 0u32);
        let (mut row_bits, mut col_bits) = (0u32, 0u32);
        for x in 0..size {
            let here = m[y * size + x];
            dark += here as u32;
            if x > 0 && here == m[y * size + x - 1] {
                row_run += 1;
            } else {
                if row_run >= 5 {
                    score += row_run - 2;
                }
                row_run = 1;
            }
            let down = m[x * size + y];
            if x > 0 && down == m[(x - 1) * size + y] {
                col_run += 1;
            } else {
                if col_run >= 5 {
                    score += col_run - 2;
                }
                col_run = 1;
            }
            if x < size - 1 && y < size - 1 && here == m[y * size + x + 1] && here == m[(y + 1) * size + x] && here == m[(y + 1) * size + x + 1]
            {
                score += 3;
            }
            row_bits = (row_bits << 1) | here as u32;
            col_bits = (col_bits << 1) | down as u32;
            // Count each finder-like core once, even with quiet runs on both sides.
            if x >= 10 {
                for bits in [row_bits, col_bits] {
                    if bits & 0x7ff == 0x05d { score += 40; }
                    if bits & 0x7ff == 0x5d0 && (x < 14 || bits & 0x7800 != 0) { score += 40; }
                }
            }
        }
        if row_run >= 5 {
            score += row_run - 2;
        }
        if col_run >= 5 {
            score += col_run - 2;
        }
        // Every remaining penalty is non-negative; ties keep the earlier mask.
        if score >= limit { return score; }
    }
    let total = (size * size) as u32;
    score + (dark * 2).abs_diff(total) * 10 / total * 10
}
