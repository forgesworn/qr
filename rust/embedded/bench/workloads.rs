// Shared by host timings and linked architecture probes. All input is synthetic.
use core::hint::black_box;

const ORDINARY: &str = concat!(
    "https://mint.example/w?k1=",
    "abababababababababababababababab",
    "abababababababababababababababab",
    "&amount=21000"
);
const NUMERIC: &str = concat!(
    "https://mint.example/w?k1=",
    "12121212121212121212121212121212",
    "12121212121212121212121212121212",
    "&amount=18446744073709551615"
);

fn text(case: usize) -> &'static str {
    if case == 1 {
        ORDINARY
    } else {
        NUMERIC
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Snapshot {
    pub size: u32,
    pub dark: u32,
}

#[cfg(not(probe_baseline))]
fn ours_snapshot(code: ours::Symbol<'_>) -> Snapshot {
    let mut dark = 0;
    for y in 0..code.size() {
        for x in 0..code.size() {
            dark += code.is_dark(x, y) as u32;
        }
    }
    Snapshot {
        size: code.size() as u32,
        dark,
    }
}

#[cfg(not(probe_baseline))]
#[inline(never)]
pub fn compact(case: usize) -> Snapshot {
    let mut scratch = ours::Workspace::new();
    let mut output = [0; ours::MODULE_BYTES];
    let options = ours::Options {
        ecc: ours::Ecc::L,
        version: (case == 0).then_some(2),
        ..ours::Options::default()
    };
    let code = if case == 0 {
        ours::encode_bytes(black_box(&[0xab; 32]), &options, &mut scratch, &mut output)
    } else {
        ours::encode_simple_text(black_box(text(case)), &options, &mut scratch, &mut output)
    }
    .unwrap();
    ours_snapshot(code)
}

#[cfg(include_optimal)]
#[inline(never)]
pub fn optimal(case: usize) -> Snapshot {
    if case == 0 {
        return compact(case);
    }
    let mut scratch = ours::Workspace::new();
    let mut planner = ours::TextPlanner::new();
    let mut output = [0; ours::MODULE_BYTES];
    let options = ours::Options {
        ecc: ours::Ecc::L,
        ..ours::Options::default()
    };
    let code = ours::encode_text(
        black_box(text(case)),
        &options,
        &mut planner,
        &mut scratch,
        &mut output,
    )
    .unwrap();
    ours_snapshot(code)
}

#[cfg(any(probe_baseline, host_comparison))]
fn wipe(buffer: &mut [u8]) {
    for value in buffer {
        unsafe {
            core::ptr::write_volatile(value, 0);
        }
    }
    core::sync::atomic::compiler_fence(core::sync::atomic::Ordering::SeqCst);
}

// The baseline is supplied externally to rustc. It is not a Cargo dependency,
// vendored source, or an implementation used by the crate or its tests.
#[cfg(any(probe_baseline, host_comparison))]
#[inline(never)]
pub fn baseline(case: usize) -> Snapshot {
    use baseline::{QrCode, QrCodeEcc, Version};
    const BUFFER: usize = Version::new(8).buffer_len();
    let mut temp = [0; BUFFER];
    let mut output = [0; BUFFER];
    let qr = if case == 0 {
        temp[..32].copy_from_slice(black_box(&[0xab; 32]));
        QrCode::encode_binary(
            &mut temp,
            32,
            &mut output,
            QrCodeEcc::Low,
            Version::new(2),
            Version::new(2),
            None,
            false,
        )
    } else {
        QrCode::encode_text(
            black_box(text(case)),
            &mut temp,
            &mut output,
            QrCodeEcc::Low,
            Version::MIN,
            Version::new(8),
            None,
            false,
        )
    }
    .unwrap();
    let mut dark = 0;
    for y in 0..qr.size() {
        for x in 0..qr.size() {
            dark += qr.get_module(x, y) as u32;
        }
    }
    let result = Snapshot {
        size: qr.size() as u32,
        dark,
    };
    wipe(&mut temp);
    wipe(&mut output);
    result
}
