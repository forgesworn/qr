//! Host evaluation only. Timings are not ESP32 timings.
use forgesworn_qr::encode::{encode, Mode, Options as ReferenceOptions};
use forgesworn_qr::symbol::Ecc as ReferenceEcc;
use forgesworn_qr_embedded::{
    encode_bytes, encode_text, Ecc, Options, TextPlanner, Workspace, MODULE_BYTES,
};
use std::hint::black_box;
use std::time::Instant;

fn main() {
    let mut scratch = Workspace::new();
    let mut planner = TextPlanner::new();
    let mut output = [0; MODULE_BYTES];
    let options = Options {
        ecc: Ecc::L,
        ..Options::default()
    };
    println!(
        "workspace_bytes={} output_bytes={} compact_caller_buffers={} optimal_caller_buffers={}",
        std::mem::size_of::<Workspace>(),
        MODULE_BYTES,
        std::mem::size_of::<Workspace>() + MODULE_BYTES,
        std::mem::size_of::<Workspace>() + MODULE_BYTES + std::mem::size_of::<TextPlanner>()
    );
    let secret_hex = "ab".repeat(32);
    let ordinary = format!("https://mint.example/w?k1={secret_hex}&amount=21000");
    let numeric = format!(
        "https://mint.example/w?k1={}&amount=18446744073709551615",
        "12".repeat(32)
    );
    for (name, text) in [("ordinary-note", &ordinary), ("numeric-note", &numeric)] {
        let code = encode_text(text, &options, &mut planner, &mut scratch, &mut output).unwrap();
        let single = encode(
            text.as_str(),
            &ReferenceOptions {
                ecc: ReferenceEcc::L,
                mode: Some(Mode::Byte),
                ..ReferenceOptions::default()
            },
        )
        .unwrap();
        println!(
            "{name}: optimal_version={} single_byte_version={} optimal_bits={} single_byte_bits={}",
            code.version(),
            single.version,
            code.bits(),
            single.bits
        );
    }
    const RUNS: u32 = 1000;
    let start = Instant::now();
    for _ in 0..RUNS {
        let code =
            encode_bytes(black_box(&[0xab; 32]), &options, &mut scratch, &mut output).unwrap();
        black_box(code.mask());
    }
    println!(
        "host_raw32_mean_us={:.2} iterations={RUNS}",
        start.elapsed().as_secs_f64() * 1e6 / RUNS as f64
    );
    let start = Instant::now();
    for _ in 0..RUNS {
        let code = encode_text(
            black_box(&ordinary),
            &options,
            &mut planner,
            &mut scratch,
            &mut output,
        )
        .unwrap();
        black_box(code.mask());
    }
    println!(
        "host_note_url_mean_us={:.2} iterations={RUNS}",
        start.elapsed().as_secs_f64() * 1e6 / RUNS as f64
    );
}
