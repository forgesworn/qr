//! Greyscale, binarisation, inversion and reduction (SPEC.md decoder steps 1, 2 and 9).

/// A picture of one byte a pixel, row by row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Image {
    pub data: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

/// Greyscale: 0 black to 255 white.
pub type Luminance = Image;
/// Black and white: 1 for dark, 0 for light.
pub type BitImage = Image;

const BLOCK: usize = 8;
const MIN_DYNAMIC_RANGE: i32 = 24;

/// Greyscale from RGBA (`channels` 4) or grey (`channels` 1) data, with a row
/// stride in pixels. Alpha is blended onto white and truncated.
pub fn to_luminance(data: &[u8], width: usize, height: usize, channels: usize, row_stride: usize) -> Luminance {
    let mut out = vec![0u8; width * height];
    if channels == 1 {
        for y in 0..height {
            out[y * width..(y + 1) * width].copy_from_slice(&data[y * row_stride..y * row_stride + width]);
        }
        return Image { data: out, width, height };
    }
    for y in 0..height {
        for x in 0..width {
            let i = (y * row_stride + x) * 4;
            let a = data[i + 3] as u32;
            let grey = (data[i] as u32 * 77 + data[i + 1] as u32 * 150 + data[i + 2] as u32 * 29) >> 8;
            let blended = if a == 255 { grey } else { (grey * a + 255 * (255 - a)) / 255 };
            out[y * width + x] = blended as u8;
        }
    }
    Image { data: out, width, height }
}

/// One threshold a block of 8x8 pixels, `across` by `down`, or a single one
/// (`across` = `down` = 1) for a picture under 40 pixels a side.
#[derive(Clone, Debug)]
pub struct Thresholds {
    pub across: usize,
    pub down: usize,
    pub values: Vec<f64>,
    /// Flat local blocks and enough overall contrast to justify re-thresholding the inverse.
    pub inverted_fallback: bool,
    /// Constant luminance cannot contain a symbol at any reduction.
    pub uniform: bool,
}

/// The threshold `binarise` applied at pixel (`px`, `py`), which must be in
/// the picture. The last block in a row or column covers the last 8 pixels, so
/// it overlaps the one before it and wins where they overlap.
pub fn threshold_at(t: &Thresholds, width: usize, height: usize, px: usize, py: usize) -> f64 {
    if t.across == 1 && t.down == 1 {
        return t.values[0];
    }
    let bx = if px + BLOCK >= width { t.across - 1 } else { px / BLOCK };
    let by = if py + BLOCK >= height { t.down - 1 } else { py / BLOCK };
    t.values[by * t.across + bx]
}

pub fn thresholds(image: &Luminance) -> Thresholds {
    let (data, width, height) = (&image.data, image.width, image.height);
    if width < 40 || height < 40 {
        let mut min = 255i32;
        let mut max = 0i32;
        for &v in data.iter() {
            let v = v as i32;
            if v < min {
                min = v;
            }
            if v > max {
                max = v;
            }
        }
        let value = if max - min < MIN_DYNAMIC_RANGE { -1.0 } else { (min + max) as f64 / 2.0 };
        return Thresholds { across: 1, down: 1, values: vec![value], inverted_fallback: false, uniform: min == max };
    }
    let across = width.div_ceil(BLOCK);
    let down = height.div_ceil(BLOCK);
    let mut levels = vec![0f64; across * down];
    let mut flat = false;
    let mut picture_min = 255i32;
    let mut picture_max = 0i32;
    for by in 0..down {
        let top = (by * BLOCK).min(height - BLOCK);
        for bx in 0..across {
            let left = (bx * BLOCK).min(width - BLOCK);
            let mut sum = 0i32;
            let mut min = 255i32;
            let mut max = 0i32;
            for y in top..top + BLOCK {
                let row = y * width + left;
                // Once the range is wide enough only the sum affects the level.
                if max - min > MIN_DYNAMIC_RANGE {
                    for &v in &data[row..row + BLOCK] { sum += v as i32; }
                    continue;
                }
                for &v in &data[row..row + BLOCK] {
                    let v = v as i32;
                    sum += v;
                    min = min.min(v);
                    max = max.max(v);
                }
            }
            let mut level = sum as f64 / (BLOCK * BLOCK) as f64;
            picture_min = picture_min.min(min);
            picture_max = picture_max.max(max);
            if max - min <= MIN_DYNAMIC_RANGE {
                flat = true;
                // A flat block: background unless its neighbours say otherwise.
                level = min as f64 / 2.0;
                if bx > 0 && by > 0 {
                    let around = (levels[(by - 1) * across + bx] + 2.0 * levels[by * across + bx - 1] + levels[(by - 1) * across + bx - 1]) / 4.0;
                    if (min as f64) < around {
                        level = around;
                    }
                }
            }
            levels[by * across + bx] = level;
        }
    }
    let mut values = vec![0f64; across * down];
    for by in 0..down {
        let cy = by.max(2).min(down - 3);
        for bx in 0..across {
            let cx = bx.max(2).min(across - 3);
            let mut sum = 0f64;
            for dy in 0..5 {
                let row = (cy + dy - 2) * across + cx - 2;
                for dx in 0..5 {
                    sum += levels[row + dx];
                }
            }
            values[by * across + bx] = sum / 25.0;
        }
    }
    Thresholds { across, down, values, inverted_fallback: flat && picture_max - picture_min > MIN_DYNAMIC_RANGE, uniform: picture_min == picture_max }
}

/// Invert luminance before thresholding: flat-block background estimates depend on polarity.
pub fn invert_luminance(image: &Luminance) -> Luminance {
    Image { data: image.data.iter().map(|&v| 255 - v).collect(), width: image.width, height: image.height }
}

/// 1 where a pixel is at or below its threshold. A pixel is a whole number,
/// so that is exactly when it is under the next whole number above it.
pub fn binarise(image: &Luminance, t: &Thresholds) -> BitImage {
    let (data, width, height) = (&image.data, image.width, image.height);
    let mut out = vec![0u8; width * height];
    if width < 40 || height < 40 {
        let above = t.values[0].floor() as i32 + 1;
        for (o, &d) in out.iter_mut().zip(data.iter()) {
            *o = ((d as i32) < above) as u8;
        }
        return Image { data: out, width, height };
    }
    for by in 0..t.down {
        let top = (by * BLOCK).min(height - BLOCK);
        for bx in 0..t.across {
            let left = (bx * BLOCK).min(width - BLOCK);
            let above = t.values[by * t.across + bx].floor() as i32 + 1;
            for y in top..top + BLOCK {
                let row = y * width + left;
                for i in row..row + BLOCK {
                    out[i] = ((data[i] as i32) < above) as u8;
                }
            }
        }
    }
    Image { data: out, width, height }
}

pub fn invert(image: &BitImage) -> BitImage {
    Image { data: image.data.iter().map(|&b| b ^ 1).collect(), width: image.width, height: image.height }
}

/// The picture shrunk by `f`: `floor(width / f)` by `floor(height / f)`, each
/// pixel `(sum + floor(f * f / 2)) div (f * f)` of the square it covers.
pub fn shrink(image: &Luminance, f: usize) -> Luminance {
    let width = image.width / f;
    let height = image.height / f;
    let mut out = vec![0u8; width * height];
    let mut sums = vec![0u32; width];
    let area = (f * f) as u32;
    let half = area / 2;
    for y in 0..height {
        sums.fill(0);
        for j in 0..f {
            let row = (y * f + j) * image.width;
            for x in 0..width {
                let mut s = 0u32;
                for i in 0..f {
                    s += image.data[row + x * f + i] as u32;
                }
                sums[x] += s;
            }
        }
        for x in 0..width {
            out[y * width + x] = ((sums[x] + half) / area) as u8;
        }
    }
    Image { data: out, width, height }
}

/// Sums of the 2x2 squares of a grid `width` by `height`.
fn quads<T: Copy + Into<u16>>(data: &[T], width: usize, height: usize) -> Vec<u16> {
    let across = width / 2;
    let down = height / 2;
    let mut out = vec![0u16; across * down];
    for y in 0..down {
        let upper = 2 * y * width;
        let lower = upper + width;
        let row = y * across;
        for x in 0..across {
            out[row + x] = data[upper + 2 * x].into() + data[upper + 2 * x + 1].into() + data[lower + 2 * x].into() + data[lower + 2 * x + 1].into();
        }
    }
    out
}

/// `shrink` for the factors 2, 4 and 8 from one pass: 2x2 sums, then sums of
/// those, each made when first asked for.
pub struct Reductions<'a> {
    image: &'a Luminance,
    sums: [Option<Vec<u16>>; 3],
}

impl<'a> Reductions<'a> {
    pub fn new(image: &'a Luminance) -> Self {
        Reductions { image, sums: [None, None, None] }
    }

    fn level(&mut self, n: usize) {
        if self.sums[n].is_some() {
            return;
        }
        let s = if n == 0 {
            quads(&self.image.data, self.image.width, self.image.height)
        } else {
            self.level(n - 1);
            let f = 1usize << n;
            quads(self.sums[n - 1].as_ref().unwrap(), self.image.width / f, self.image.height / f)
        };
        self.sums[n] = Some(s);
    }

    /// The picture shrunk by `f`, which must be 2, 4 or 8.
    pub fn get(&mut self, f: usize) -> Luminance {
        let n = match f {
            2 => 0,
            4 => 1,
            8 => 2,
            _ => panic!("the factor must be 2, 4 or 8"),
        };
        self.level(n);
        let s = self.sums[n].as_ref().unwrap();
        let shift = 2 * (n + 1);
        let half = 1u16 << (shift - 1);
        let data = s.iter().map(|&v| ((v + half) >> shift) as u8).collect();
        Image { data, width: self.image.width / f, height: self.image.height / f }
    }
}
