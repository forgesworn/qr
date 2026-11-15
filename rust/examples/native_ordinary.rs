//! Times the ordinary search natively on frame files written by
//! `bench/ordinary.mjs`: `native_ordinary <directory> <rounds>`. Each file is
//! `width`, `height` and `channels` as big-endian 32-bit integers, then the
//! pixels. Prints one tab-separated line a frame: name, median milliseconds,
//! and 0 if nothing read, else the payload length plus 1.

use std::hint::black_box;
use std::time::Instant;

use forgesworn_qr::decode::decode_ordinary;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).expect("a directory of frame files");
    let rounds: usize = args.get(2).map_or(25, |s| s.parse().expect("rounds"));
    let mut names: Vec<_> = std::fs::read_dir(dir).expect("directory").map(|e| e.unwrap().file_name().into_string().unwrap()).filter(|n| n.ends_with(".frame")).collect();
    names.sort();
    for name in names {
        let bytes = std::fs::read(format!("{dir}/{name}")).expect("frame");
        let word = |i: usize| u32::from_be_bytes(bytes[i * 4..i * 4 + 4].try_into().unwrap()) as usize;
        let (width, height, channels) = (word(0), word(1), word(2));
        let pixels = &bytes[12..12 + width * height * channels];
        let run = || decode_ordinary(black_box(pixels), width, height, channels, None).map_or(0, |r| r.payload.bytes.len() + 1);
        let mut read = 0;
        for _ in 0..3 {
            read = black_box(run());
        }
        let mut times: Vec<f64> = (0..rounds)
            .map(|_| {
                let start = Instant::now();
                read = black_box(run());
                start.elapsed().as_secs_f64() * 1000.0
            })
            .collect();
        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!("{}\t{:.3}\t{}", name.trim_end_matches(".frame"), times[times.len() / 2], read);
    }
}
