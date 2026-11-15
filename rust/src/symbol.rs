//! Reading a module grid: format and version information, bit placement,
//! unmasking, de-interleaving, Reed-Solomon, and the segments (SPEC.md decoder
//! steps 6 and 7).
//!
//! Text follows "Text for kanji and other ECIs" in SPEC.md for a platform with
//! no character-set decoders, which this port is: ECI 26, 1, 3, 27, 170 and 23
//! are done by hand, and kanji, hanzi and every other ECI behave as for a
//! platform lacking the set. `bytes` never depends on a character set.

use crate::tables::{ALIGNMENT_CENTRES, EC_BLOCKS};
use std::sync::OnceLock;

/// The error correction level of a symbol.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ecc {
    L,
    M,
    Q,
    H,
}

impl Ecc {
    /// L, M, Q, H in the order of Table 9.
    pub const ORDER: [Ecc; 4] = [Ecc::L, Ecc::M, Ecc::Q, Ecc::H];

    pub fn letter(self) -> char {
        match self {
            Ecc::L => 'L',
            Ecc::M => 'M',
            Ecc::Q => 'Q',
            Ecc::H => 'H',
        }
    }

    fn index(self) -> usize {
        self as usize
    }
}

/// The header of a structured-append symbol.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StructuredAppend {
    /// This symbol's place in the set, counting from 0.
    pub index: u32,
    /// How many symbols the set has, 1 to 16.
    pub total: u32,
    /// The parity byte: the XOR of every byte of the whole message.
    pub parity: u32,
}

/// An FNC1 indicator. In alphanumeric segments `%` then reads as the group
/// separator U+001D and `%%` as `%`, in `text` and `bytes` alike.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Fnc1 {
    /// The GS1 format.
    First,
    /// An industry application: one letter or two digits.
    Second(String),
}

/// What a symbol says, once read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payload {
    pub text: String,
    /// Byte-mode data as stored, numeric and alphanumeric as ASCII, kanji as
    /// Shift_JIS pairs and hanzi as GB2312 pairs.
    pub bytes: Vec<u8>,
    pub version: usize,
    pub ecc: Ecc,
    pub mask: u8,
    /// ECI assignment numbers in the order they appeared; empty if none.
    pub eci: Vec<u32>,
    /// Codewords Reed-Solomon had to correct.
    pub corrected: usize,
    /// Present when the symbol is one of a structured-append set; `text` and
    /// `bytes` then hold this symbol's part only.
    pub structured_append: Option<StructuredAppend>,
    /// Present when the symbol carries an FNC1 indicator.
    pub fnc1: Option<Fnc1>,
}

// GF(256) with 0x11D.

const fn exp_table() -> [u8; 512] {
    let mut exp = [0u8; 512];
    let mut x: u32 = 1;
    let mut i = 0;
    while i < 255 {
        exp[i] = x as u8;
        x <<= 1;
        if x & 0x100 != 0 {
            x ^= 0x11d;
        }
        i += 1;
    }
    while i < 512 {
        exp[i] = exp[i - 255];
        i += 1;
    }
    exp
}

const fn log_table() -> [u8; 256] {
    let exp = exp_table();
    let mut log = [0u8; 256];
    let mut i = 0;
    while i < 255 {
        log[exp[i] as usize] = i as u8;
        i += 1;
    }
    log
}

const EXP: [u8; 512] = exp_table();
const LOG: [u8; 256] = log_table();

fn gf_mul(a: u8, b: u8) -> u8 {
    if a == 0 || b == 0 {
        0
    } else {
        EXP[LOG[a as usize] as usize + LOG[b as usize] as usize]
    }
}

/// `a / b`; `b` is never zero where this is used.
fn gf_div(a: u8, b: u8) -> u8 {
    debug_assert!(b != 0);
    if a == 0 {
        0
    } else {
        EXP[(LOG[a as usize] as usize + 255 - LOG[b as usize] as usize) % 255]
    }
}

/// `poly` is lowest power first.
fn evaluate(poly: &[u8], x: u8) -> u8 {
    let mut y = 0u8;
    for &c in poly.iter().rev() {
        y = gf_mul(y, x) ^ c;
    }
    y
}

/// Corrects `block` (data codewords then `ec_count` check codewords) in
/// place. Returns the number of codewords corrected, or `None` when the block
/// has more errors than the code can correct.
pub fn correct(block: &mut [u8], ec_count: usize) -> Option<usize> {
    let n = block.len();
    let mut syndromes: Vec<u8> = Vec::with_capacity(ec_count);
    let mut clean = true;
    for j in 0..ec_count {
        let mut s = 0u8;
        let x = EXP[j];
        for &b in block.iter() {
            s = gf_mul(s, x) ^ b;
        }
        syndromes.push(s);
        if s != 0 {
            clean = false;
        }
    }
    if clean {
        return Some(0);
    }

    // Berlekamp-Massey: the error locator.
    let mut locator: Vec<u8> = vec![1];
    let mut previous: Vec<u8> = vec![1];
    let mut errors = 0usize;
    let mut shift = 1usize;
    let mut last_discrepancy = 1u8;
    for k in 0..ec_count {
        let mut d = syndromes[k];
        for i in 1..=errors {
            d ^= gf_mul(locator.get(i).copied().unwrap_or(0), syndromes[k - i]);
        }
        if d == 0 {
            shift += 1;
            continue;
        }
        let factor = gf_div(d, last_discrepancy);
        let mut next = locator.clone();
        for (i, &p) in previous.iter().enumerate() {
            let at = i + shift;
            while next.len() <= at {
                next.push(0);
            }
            next[at] ^= gf_mul(factor, p);
        }
        if 2 * errors <= k {
            previous = locator;
            errors = k + 1 - errors;
            last_discrepancy = d;
            shift = 1;
        } else {
            shift += 1;
        }
        locator = next;
    }
    while locator.len() > 1 && locator[locator.len() - 1] == 0 {
        locator.pop();
    }
    if errors * 2 > ec_count || locator.len() - 1 != errors {
        return None;
    }

    // Chien search: a root at alpha^-p marks an error at power p, index n - 1 - p.
    let mut powers: Vec<usize> = Vec::new();
    for p in 0..n {
        if evaluate(&locator, EXP[(255 - p % 255) % 255]) == 0 {
            powers.push(p);
        }
    }
    if powers.len() != errors {
        return None;
    }

    // Forney: omega = S * locator mod x^ec_count; e = X * omega(1/X) / locator'(1/X) for first root alpha^0.
    let mut omega = vec![0u8; ec_count];
    for i in 0..ec_count {
        let mut j = 0;
        while j < locator.len() && i + j < ec_count {
            omega[i + j] ^= gf_mul(syndromes[i], locator[j]);
            j += 1;
        }
    }
    let mut derivative: Vec<u8> = Vec::new();
    for i in 1..locator.len() {
        derivative.push(if i % 2 == 1 { locator[i] } else { 0 });
    }
    for &p in &powers {
        let x = EXP[p % 255];
        let x_inverse = EXP[(255 - p % 255) % 255];
        let denominator = evaluate(&derivative, x_inverse);
        if denominator == 0 {
            return None;
        }
        block[n - 1 - p] ^= gf_mul(x, gf_div(evaluate(&omega, x_inverse), denominator));
    }
    Some(errors)
}

// Format and version information.

const FORMAT_COORDS: [(usize, usize); 15] = [
    (8, 0),
    (8, 1),
    (8, 2),
    (8, 3),
    (8, 4),
    (8, 5),
    (8, 7),
    (8, 8),
    (7, 8),
    (5, 8),
    (4, 8),
    (3, 8),
    (2, 8),
    (1, 8),
    (0, 8),
];

const fn format_bits_of(ecc_bits: u32, mask: u32) -> u32 {
    let data = (ecc_bits << 3) | mask;
    let mut rem = data;
    let mut i = 0;
    while i < 10 {
        rem = (rem << 1) ^ ((rem >> 9) * 0x537);
        i += 1;
    }
    ((data << 10) | rem) ^ 0x5412
}

const fn version_bits_of(version: u32) -> u32 {
    let mut rem = version;
    let mut i = 0;
    while i < 12 {
        rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
        i += 1;
    }
    (version << 12) | rem
}

/// Every (level, mask) with its 15 format bits, in the order L, M, Q, H and masks 0 to 7.
const fn formats() -> [(u32, Ecc, u8); 32] {
    let mut out = [(0u32, Ecc::L, 0u8); 32];
    let mut e = 0;
    while e < 4 {
        let (ecc, bits) = match e {
            0 => (Ecc::L, 1),
            1 => (Ecc::M, 0),
            2 => (Ecc::Q, 3),
            _ => (Ecc::H, 2),
        };
        let mut m = 0;
        while m < 8 {
            out[e * 8 + m] = (format_bits_of(bits, m as u32), ecc, m as u8);
            m += 1;
        }
        e += 1;
    }
    out
}

const FORMATS: [(u32, Ecc, u8); 32] = formats();

const fn versions() -> [u32; 34] {
    let mut out = [0u32; 34];
    let mut i = 0;
    while i < 34 {
        out[i] = version_bits_of(i as u32 + 7);
        i += 1;
    }
    out
}

const VERSIONS: [u32; 34] = versions();

/// The entry whose bits are nearest (within three bit errors) to either read:
/// the first read, then the first entry, wins a tie.
fn nearest(table: &[u32], reads: &[u32]) -> Option<usize> {
    let mut best = None;
    let mut distance = 4; // both codes correct up to three bit errors
    for &read in reads {
        for (i, &bits) in table.iter().enumerate() {
            let d = (bits ^ read).count_ones();
            if d < distance {
                distance = d;
                best = Some(i);
            }
        }
    }
    best
}

/// The reserved (function pattern) modules of a version: finders and
/// separators, timing, alignment, format and version information, and the dark module.
fn reserved(version: usize) -> Vec<bool> {
    let s = 17 + 4 * version;
    let mut reserved = vec![false; s * s];
    for (left, top) in [(0i32, 0i32), (s as i32 - 7, 0), (0, s as i32 - 7)] {
        // The finder and its separator, clipped to the grid.
        for dy in -1..=7 {
            for dx in -1..=7 {
                let (x, y) = (left + dx, top + dy);
                if x >= 0 && y >= 0 && x < s as i32 && y < s as i32 {
                    reserved[y as usize * s + x as usize] = true;
                }
            }
        }
    }
    reserved[(s - 8) * s + 8] = true;
    // Alignment centres that fall inside a finder are skipped.
    let centres = ALIGNMENT_CENTRES[version - 1];
    for &cy in centres {
        for &cx in centres {
            let (cx, cy) = (cx as usize, cy as usize);
            if reserved[cy * s + cx] {
                continue;
            }
            for dy in 0..5 {
                for dx in 0..5 {
                    reserved[(cy + dy - 2) * s + cx + dx - 2] = true;
                }
            }
        }
    }
    for i in 8..s - 8 {
        reserved[6 * s + i] = true;
        reserved[i * s + 6] = true;
    }
    for (i, &(x, y)) in FORMAT_COORDS.iter().enumerate() {
        reserved[y * s + x] = true;
        if i < 8 {
            reserved[8 * s + s - 1 - i] = true;
        } else {
            reserved[(s - 7 + (i - 8)) * s + 8] = true;
        }
    }
    if version >= 7 {
        for i in 0..6 {
            for j in 0..3 {
                reserved[(s - 11 + j) * s + i] = true;
                reserved[i * s + s - 11 + j] = true;
            }
        }
    }
    reserved
}

static PLACEMENTS: [OnceLock<Vec<u16>>; 41] = [const { OnceLock::new() }; 41];

/// The modules of a version that carry the bit stream, in the order the
/// standard places it: two columns at a time from the right, snaking up and
/// down, skipping the function patterns. Each is `y * 256 + x`. Worked out
/// once a version and kept.
fn placement(version: usize) -> &'static [u16] {
    PLACEMENTS[version].get_or_init(|| {
        let size = 17 + 4 * version;
        let reserved = reserved(version);
        let mut found: Vec<u16> = Vec::new();
        let mut upward = true;
        let mut right = size as i32 - 1;
        while right >= 1 {
            if right == 6 {
                right = 5;
            }
            for step in 0..size {
                let y = if upward { size - 1 - step } else { step };
                for i in 0..2 {
                    let x = (right - i) as usize;
                    if !reserved[y * size + x] {
                        found.push(((y << 8) | x) as u16);
                    }
                }
            }
            upward = !upward;
            right -= 2;
        }
        found
    })
}

fn mask_bit(mask: u8, x: usize, y: usize) -> bool {
    match mask {
        0 => (x + y) % 2 == 0,
        1 => y % 2 == 0,
        2 => x % 3 == 0,
        3 => (x + y) % 3 == 0,
        4 => (y / 2 + x / 3) % 2 == 0,
        5 => (x * y) % 2 + (x * y) % 3 == 0,
        6 => ((x * y) % 2 + (x * y) % 3) % 2 == 0,
        _ => (((x + y) % 2) + ((x * y) % 3)) % 2 == 0,
    }
}

fn blocks_for(version: usize, ecc: Ecc) -> [usize; 4] {
    EC_BLOCKS[version - 1][ecc.index()].map(|v| v as usize)
}

/// The version a symbol of `size` modules declares: from the size below
/// version 7, else from its version blocks, or `None` when neither copy decodes.
pub fn read_version<R: Fn(usize, usize) -> bool>(read: &R, size: usize) -> Option<usize> {
    if size < 45 {
        return Some((size - 17) / 4);
    }
    let mut bottom_left = 0u32;
    let mut top_right = 0u32;
    for k in (0..=17).rev() {
        let i = k / 3;
        let j = k % 3;
        bottom_left = (bottom_left << 1) | read(i, size - 11 + j) as u32;
        top_right = (top_right << 1) | read(size - 11 + j, i) as u32;
    }
    nearest(&VERSIONS, &[bottom_left, top_right]).map(|i| i + 7)
}

/// The errors a block of this symbol may have had corrected: half of its check
/// codewords once the p of Table 9 is withheld to catch a misdecode. Only
/// versions 1 to 3 withhold any.
pub fn correctable(version: usize, ecc: Ecc) -> usize {
    let p = match (version, ecc) {
        (1, Ecc::L) => 3,
        (1, Ecc::M) => 2,
        (1, _) => 1,
        (2, Ecc::L) => 2,
        (3, Ecc::L) => 1,
        _ => 0,
    };
    (blocks_for(version, ecc)[0] - p) >> 1
}

/// Decodes a symbol from its modules (`read(x, y)` is true for dark). `size`
/// must be 17 + 4v. From version 7 a version block that decodes decides, and a
/// size that disagrees fails; if neither decodes, the size decides. Returns
/// `None` when the symbol cannot be read.
pub fn read_symbol<R: Fn(usize, usize) -> bool>(read: R, size: usize) -> Option<Payload> {
    if !(21..=177).contains(&size) || (size - 17) % 4 != 0 {
        return None;
    }
    // When neither version copy decodes, the size says which version it is.
    let version = read_version(&read, size).unwrap_or((size - 17) / 4);
    if 17 + 4 * version != size {
        return None;
    }

    let mut first = 0u32;
    let mut second = 0u32;
    for i in (0..15).rev() {
        let (x, y) = FORMAT_COORDS[i];
        first = (first << 1) | read(x, y) as u32;
        let (sx, sy) = if i < 8 { (size - 1 - i, 8) } else { (8, size - 7 + (i - 8)) };
        second = (second << 1) | read(sx, sy) as u32;
    }
    let format = nearest(&FORMATS.map(|f| f.0), &[first, second])?;
    let (_, ecc, mask) = FORMATS[format];

    let [ec_per_block, g1, d1, g2] = blocks_for(version, ecc);
    let block_count = g1 + g2;
    let total = g1 * d1 + g2 * (d1 + 1) + block_count * ec_per_block;
    let mut stream = vec![0u8; total];
    let places = placement(version);
    let bits = places.len().min(total * 8);
    for bit in 0..bits {
        let x = (places[bit] & 255) as usize;
        let y = (places[bit] >> 8) as usize;
        if read(x, y) != mask_bit(mask, x, y) {
            stream[bit >> 3] |= 0x80 >> (bit & 7);
        }
    }

    let data_len = |b: usize| if b < g1 { d1 } else { d1 + 1 };
    let mut blocks: Vec<Vec<u8>> = (0..block_count).map(|b| vec![0u8; data_len(b) + ec_per_block]).collect();
    let mut k = 0;
    for i in 0..=d1 {
        for (b, block) in blocks.iter_mut().enumerate() {
            if i < data_len(b) {
                block[i] = stream[k];
                k += 1;
            }
        }
    }
    for i in 0..ec_per_block {
        for (b, block) in blocks.iter_mut().enumerate() {
            block[data_len(b) + i] = stream[k];
            k += 1;
        }
    }
    let mut data: Vec<u8> = Vec::with_capacity(g1 * d1 + g2 * (d1 + 1));
    let mut corrected = 0;
    let limit = correctable(version, ecc);
    for (b, block) in blocks.iter_mut().enumerate() {
        let fixed = correct(block, ec_per_block)?;
        if fixed > limit {
            return None;
        }
        corrected += fixed;
        data.extend_from_slice(&block[..data_len(b)]);
    }

    // Zero in every data codeword is what a texture matching the mask pattern
    // corrects to, and it parses as a terminator: no symbol holds it.
    if data.iter().all(|&w| w == 0) {
        return None;
    }

    let parsed = parse(&data, version)?;
    Some(Payload {
        text: parsed.text,
        bytes: parsed.bytes,
        version,
        ecc,
        mask,
        eci: parsed.eci,
        corrected,
        structured_append: parsed.structured_append,
        fnc1: parsed.fnc1,
    })
}

struct Bits<'a> {
    data: &'a [u8],
    position: usize,
}

impl Bits<'_> {
    fn available(&self) -> usize {
        self.data.len() * 8 - self.position
    }

    /// `count` bits, most significant first, or `None` past the end.
    fn read(&mut self, count: usize) -> Option<u32> {
        if count > self.available() {
            return None;
        }
        let mut value = 0u32;
        for _ in 0..count {
            value = (value << 1) | ((self.data[self.position >> 3] >> (7 - (self.position & 7))) & 1) as u32;
            self.position += 1;
        }
        Some(value)
    }
}

struct Run {
    eci: Option<u32>,
    bytes: Vec<u8>,
    /// Text already decided, for a kanji or hanzi character.
    fixed: Option<String>,
}

const ALPHANUMERIC: &[u8; 45] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const KANJI_COUNT_BITS: [usize; 3] = [8, 10, 12];

struct Parsed {
    text: String,
    bytes: Vec<u8>,
    eci: Vec<u32>,
    structured_append: Option<StructuredAppend>,
    fnc1: Option<Fnc1>,
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

/// ISO 18004 7.4.8.3: 0-99 are two digits, ASCII + 100 gives a letter.
fn application_indicator(value: u32) -> Option<String> {
    if value <= 99 {
        return Some(format!("{value:02}"));
    }
    if (165..=190).contains(&value) || (197..=222).contains(&value) {
        return Some(((value - 100) as u8 as char).to_string());
    }
    None
}

fn parse(data: &[u8], version: usize) -> Option<Parsed> {
    let mut bits = Bits { data, position: 0 };
    let band = count_band(version);
    let mut runs: Vec<Run> = vec![Run { eci: None, bytes: Vec::new(), fixed: None }];
    let mut eci: Vec<u32> = Vec::new();
    let mut out: Vec<u8> = Vec::new();
    let mut structured_append: Option<StructuredAppend> = None;
    let mut fnc1: Option<Fnc1> = None;
    fn emit(runs: &mut [Run], out: &mut Vec<u8>, byte: u8) {
        runs.last_mut().unwrap().bytes.push(byte);
        out.push(byte);
    }
    // Running out of data mid-segment is no read.
    while bits.available() >= 4 {
        let mode = bits.read(4)?;
        if mode == 0 {
            break;
        }
        match mode {
            1 => {
                let mut count = bits.read([10, 12, 14][band])?;
                while count >= 3 {
                    let v = bits.read(10)?;
                    if v > 999 {
                        return None;
                    }
                    for c in format!("{v:03}").bytes() {
                        emit(&mut runs, &mut out, c);
                    }
                    count -= 3;
                }
                if count > 0 {
                    let v = bits.read(if count == 2 { 7 } else { 4 })?;
                    if v >= if count == 2 { 100 } else { 10 } {
                        return None;
                    }
                    for c in format!("{:0width$}", v, width = count as usize).bytes() {
                        emit(&mut runs, &mut out, c);
                    }
                }
            }
            2 => {
                let mut count = bits.read([9, 11, 13][band])?;
                let mut segment: Vec<u8> = Vec::new();
                while count >= 2 {
                    let v = bits.read(11)?;
                    if v >= 45 * 45 {
                        return None;
                    }
                    segment.push(ALPHANUMERIC[(v / 45) as usize]);
                    segment.push(ALPHANUMERIC[(v % 45) as usize]);
                    count -= 2;
                }
                if count == 1 {
                    let v = bits.read(6)?;
                    if v >= 45 {
                        return None;
                    }
                    segment.push(ALPHANUMERIC[v as usize]);
                }
                // Under FNC1, within one segment: %% is %, and a lone % is the group separator.
                let mut i = 0;
                while i < segment.len() {
                    if fnc1.is_some() && segment[i] == 0x25 {
                        if segment.get(i + 1) == Some(&0x25) {
                            i += 1;
                        } else {
                            emit(&mut runs, &mut out, 0x1d);
                            i += 1;
                            continue;
                        }
                    }
                    emit(&mut runs, &mut out, segment[i]);
                    i += 1;
                }
            }
            4 => {
                let count = bits.read([8, 16, 16][band])?;
                for _ in 0..count {
                    let b = bits.read(8)? as u8;
                    emit(&mut runs, &mut out, b);
                }
            }
            8 => {
                // Kanji: kept as its Shift_JIS bytes; each character's text is the platform's
                // Shift_JIS, and this port has none, so each is a single U+FFFD (SPEC.md).
                let count = bits.read(KANJI_COUNT_BITS[band])?;
                for _ in 0..count {
                    let v = bits.read(13)?;
                    let mut sjis = ((v / 0xc0) << 8) | (v % 0xc0);
                    sjis += if sjis < 0x1f00 { 0x8140 } else { 0xc140 };
                    out.push((sjis >> 8) as u8);
                    out.push((sjis & 0xff) as u8);
                    let current = runs.last().unwrap().eci;
                    runs.push(Run { eci: current, bytes: Vec::new(), fixed: Some(kanji_text()) });
                    runs.push(Run { eci: current, bytes: Vec::new(), fixed: None });
                }
            }
            13 => {
                // Hanzi (GB/T 18284): subset 1 is GB2312, kept as its bytes; any other subset, or a
                // value outside the GB2312 rows or on a cell the editions disagree on, rejects the symbol.
                //
                // The reference ports also refuse a pair their GB 18030 decoder makes nothing of (an
                // empty GB2312 cell). This port has no such decoder and cannot tell, so with
                // `HANZI` false it refuses every hanzi symbol sooner than read one they would not.
                if !HANZI {
                    return None;
                }
                if bits.read(4)? != 1 {
                    return None;
                }
                let count = bits.read(KANJI_COUNT_BITS[band])?;
                for _ in 0..count {
                    let v = bits.read(13)?;
                    let row = v / 0x60;
                    let lead = row + if row < 0x0a { 0xa1 } else { 0xa6 };
                    let low = (v % 0x60) + 0xa1;
                    let text = hanzi_text(lead, low)?;
                    out.push(lead as u8);
                    out.push(low as u8);
                    let current = runs.last().unwrap().eci;
                    runs.push(Run { eci: current, bytes: Vec::new(), fixed: Some(text) });
                    runs.push(Run { eci: current, bytes: Vec::new(), fixed: None });
                }
            }
            7 => {
                let first = bits.read(8)?;
                let value = if first & 0x80 == 0 {
                    first
                } else if first & 0xc0 == 0x80 {
                    ((first & 0x3f) << 8) | bits.read(8)?
                } else if first & 0xe0 == 0xc0 {
                    ((first & 0x1f) << 16) | bits.read(16)?
                } else {
                    return None;
                };
                eci.push(value);
                runs.push(Run { eci: Some(value), bytes: Vec::new(), fixed: None });
            }
            3 => {
                let sequence = bits.read(8)?;
                let parity = bits.read(8)?;
                if structured_append.is_none() {
                    structured_append = Some(StructuredAppend { index: sequence >> 4, total: (sequence & 15) + 1, parity });
                }
            }
            5 => {
                if fnc1.is_none() {
                    fnc1 = Some(Fnc1::First);
                }
            }
            9 => {
                let indicator = application_indicator(bits.read(8)?)?;
                if fnc1.is_none() {
                    fnc1 = Some(Fnc1::Second(indicator));
                }
            }
            _ => return None,
        }
    }
    let mut text = String::new();
    for run in &runs {
        text.push_str(&decode_run(run));
    }
    Some(Parsed { text, bytes: out, eci, structured_append, fnc1 })
}

// Text, by hand. No character-set tables are bundled but the 32 bytes of Windows 1252.

/// Whether hanzi-mode symbols are read at all. Off: without a GB 18030 decoder
/// an empty GB2312 cell cannot be told from a character, and the reference
/// ports refuse a symbol that holds one. A host that can check the pairs may
/// turn this on once the port gives it the means.
const HANZI: bool = false;

/// A kanji-mode character on a platform with no Shift_JIS: a single U+FFFD.
fn kanji_text() -> String {
    "\u{fffd}".to_string()
}

/// Whether a hanzi pair names a character on a platform with a GB 18030
/// decoder: the pair must lie in the GB2312 rows and cells, and not be one of
/// the twelve cells that editions disagree on. With no decoder here, a valid
/// pair reads as a single U+FFFD, as for kanji. `None` rejects the symbol.
fn hanzi_text(lead: u32, low: u32) -> Option<String> {
    if !(0xa1..=0xfe).contains(&low) || !(0xa1..=0xf7).contains(&lead) || (lead > 0xa9 && lead < 0xb0) {
        return None;
    }
    if edition_dependent(lead, low) {
        return None;
    }
    Some("\u{fffd}".to_string())
}

/// Twelve cells GB2312 leaves empty that GBK and older GB 18030 tables make
/// private-use and newer GB 18030 tables make characters.
fn edition_dependent(lead: u32, low: u32) -> bool {
    if lead == 0xa6 {
        return (0xd9..=0xdf).contains(&low) || low == 0xec || low == 0xed || low == 0xf3;
    }
    lead == 0xa8 && (low == 0xbc || low == 0xbf)
}

/// Length of the well-formed UTF-8 sequence at `i`, or 0 if it is not one.
fn sequence(bytes: &[u8], i: usize) -> usize {
    let b = bytes[i];
    if b < 0x80 {
        return 1;
    }
    let length = if (0xc2..=0xdf).contains(&b) {
        2
    } else if (0xe0..=0xef).contains(&b) {
        3
    } else if (0xf0..=0xf4).contains(&b) {
        4
    } else {
        0
    };
    if length == 0 || i + length > bytes.len() {
        return 0;
    }
    let second = bytes[i + 1];
    let low = if b == 0xe0 {
        0xa0
    } else if b == 0xf0 {
        0x90
    } else {
        0x80
    };
    let high = if b == 0xed {
        0x9f
    } else if b == 0xf4 {
        0x8f
    } else {
        0xbf
    };
    if second < low || second > high {
        return 0;
    }
    for k in 2..length {
        if bytes[i + k] & 0xc0 != 0x80 {
            return 0;
        }
    }
    length
}

/// True when `bytes` is entirely well-formed UTF-8.
pub fn is_utf8(bytes: &[u8]) -> bool {
    let mut i = 0;
    while i < bytes.len() {
        let n = sequence(bytes, i);
        if n == 0 {
            return false;
        }
        i += n;
    }
    true
}

/// Decodes UTF-8, replacing each ill-formed byte with U+FFFD.
pub fn from_utf8(bytes: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let n = sequence(bytes, i);
        if n == 0 {
            out.push('\u{fffd}');
            i += 1;
            continue;
        }
        let b = bytes[i] as u32;
        let mut cp = if n == 1 { b } else { b & (0xff >> (n + 1)) };
        for k in 1..n {
            cp = (cp << 6) | (bytes[i + k] as u32 & 0x3f);
        }
        out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
        i += n;
    }
    out
}

fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| b as char).collect()
}

/// Windows 1252 at bytes 0x80 to 0x9F, 0 where the code page leaves the byte undefined.
const WINDOWS_1252: [u32; 32] = [
    0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c,
    0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/// Text for a run under an ECI the hand-written sets cover (27, 170 and 23),
/// or `None`: every other ECI is, here, a set the platform lacks.
fn from_eci(eci: u32, bytes: &[u8]) -> Option<String> {
    match eci {
        27 | 170 => Some(bytes.iter().map(|&b| if b < 0x80 { b as char } else { '\u{fffd}' }).collect()),
        23 => Some(
            bytes
                .iter()
                .map(|&b| {
                    if !(0x80..=0x9f).contains(&b) {
                        b as char
                    } else {
                        let cp = WINDOWS_1252[b as usize - 0x80];
                        char::from_u32(if cp == 0 { 0xfffd } else { cp }).unwrap()
                    }
                })
                .collect(),
        ),
        _ => None,
    }
}

/// ECI 26 is UTF-8; 3 and 1 are Latin-1; 27, 170 and 23 by hand. Every other
/// ECI is read as a set the platform lacks, so as if there were none: valid
/// UTF-8 is UTF-8, else Latin-1. The no-ECI Shift_JIS rule needs a Shift_JIS
/// decoder and, with none, ends in Latin-1 all the same, so it is left out.
fn decode_run(run: &Run) -> String {
    if let Some(text) = &run.fixed {
        return text.clone();
    }
    let bytes = &run.bytes;
    if run.eci == Some(3) || run.eci == Some(1) {
        return latin1(bytes);
    }
    if run.eci == Some(26) {
        return from_utf8(bytes);
    }
    if let Some(eci) = run.eci {
        if !bytes.is_empty() {
            if let Some(text) = from_eci(eci, bytes) {
                return text;
            }
        }
    }
    if is_utf8(bytes) {
        return from_utf8(bytes);
    }
    latin1(bytes)
}

/// A symbol read from a module grid, with whether the grid was read transposed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Decoded {
    pub payload: Payload,
    pub mirrored: bool,
}

/// Reads a symbol from its module grid, `size` by `size`, row by row, nonzero
/// for dark, with no quiet zone. Mirrored grids read too. `None` when the
/// symbol cannot be read, or when `modules` holds fewer than `size * size`
/// (the TypeScript throws a RangeError there).
pub fn decode_modules(modules: &[u8], size: usize) -> Option<Decoded> {
    if modules.len() < size * size {
        return None;
    }
    if let Some(payload) = read_symbol(|x, y| modules[y * size + x] != 0, size) {
        return Some(Decoded { payload, mirrored: false });
    }
    read_symbol(|x, y| modules[x * size + y] != 0, size).map(|payload| Decoded { payload, mirrored: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds data codewords from (value, bit count) pairs, zero padded to a whole byte.
    fn words(fields: &[(u32, usize)]) -> Vec<u8> {
        let mut bits: Vec<u8> = Vec::new();
        for &(value, count) in fields {
            for i in (0..count).rev() {
                bits.push(((value >> i) & 1) as u8);
            }
        }
        while bits.len() % 8 != 0 {
            bits.push(0);
        }
        bits.chunks(8).map(|c| c.iter().fold(0u8, |a, &b| (a << 1) | b)).collect()
    }

    fn alnum(c: char) -> u32 {
        ALPHANUMERIC.iter().position(|&b| b as char == c).unwrap() as u32
    }

    #[test]
    fn structured_append_is_reported() {
        // Mode 3, index 2 of 5, parity 0xA5, then the byte segment "A".
        let data = words(&[(3, 4), (0x24, 8), (0xa5, 8), (4, 4), (1, 8), (b'A' as u32, 8), (0, 4)]);
        let parsed = parse(&data, 1).unwrap();
        assert_eq!(parsed.structured_append, Some(StructuredAppend { index: 2, total: 5, parity: 0xa5 }));
        assert_eq!(parsed.text, "A");
        assert_eq!(parsed.bytes, b"A");
    }

    #[test]
    fn fnc1_first_position_rewrites_percent() {
        // FNC1 first position, then alphanumeric "A%B%%C": A, a group separator, B, a percent sign, C.
        let data = words(&[(5, 4), (2, 4), (6, 9), (alnum('A') * 45 + alnum('%'), 11), (alnum('B') * 45 + alnum('%'), 11), (alnum('%') * 45 + alnum('C'), 11), (0, 4)]);
        let parsed = parse(&data, 1).unwrap();
        assert_eq!(parsed.fnc1, Some(Fnc1::First));
        assert_eq!(parsed.bytes, b"A\x1dB%C");
        assert_eq!(parsed.text, "A\u{1d}B%C");
    }

    #[test]
    fn fnc1_second_position_carries_its_indicator() {
        let data = words(&[(9, 4), (165, 8), (4, 4), (1, 8), (b'x' as u32, 8), (0, 4)]);
        let parsed = parse(&data, 1).unwrap();
        assert_eq!(parsed.fnc1, Some(Fnc1::Second("A".to_string())));
        let bad = words(&[(9, 4), (150, 8), (0, 4)]);
        assert!(parse(&bad, 1).is_none());
    }

    #[test]
    fn utf8_by_hand_replaces_each_ill_formed_byte() {
        assert_eq!(from_utf8(&[0x41, 0xe2, 0x82, 0x41]), "A\u{fffd}\u{fffd}A");
        assert_eq!(from_utf8("\u{20ac}".as_bytes()), "\u{20ac}");
        assert!(!is_utf8(&[0xc0, 0x80]));
    }
}
