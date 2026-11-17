mod workloads;
use std::hint::black_box;
use std::time::Instant;

fn main() {
    let engines: [fn(usize) -> workloads::Snapshot; 3] =
        [workloads::baseline, workloads::compact, workloads::optimal];
    let names = ["baseline", "compact", "optimal"];
    println!(
        "buffers,compact,{},optimal,{}",
        std::mem::size_of::<ours::Workspace>() + ours::MODULE_BYTES,
        std::mem::size_of::<ours::Workspace>()
            + ours::MODULE_BYTES
            + std::mem::size_of::<ours::TextPlanner>()
    );
    for case in 0..3 {
        let results = engines.map(|engine| engine(case));
        assert_eq!(results[0].size, results[1].size);
        for (engine, result) in results.iter().enumerate() {
            println!(
                "symbol,{case},{},{},{}",
                names[engine], result.size, result.dark
            );
        }
        for engine in engines {
            for _ in 0..20 {
                black_box(engine(black_box(case)));
            }
        }
        let mut samples = [[0f64; 9]; 3];
        for round in 0..9 {
            for offset in 0..3 {
                let engine = (round + offset) % 3;
                let start = Instant::now();
                for _ in 0..200 {
                    black_box(engines[engine](black_box(case)));
                }
                samples[engine][round] = start.elapsed().as_secs_f64() * 1e6 / 200f64;
            }
        }
        for engine in 0..3 {
            let mut sorted = samples[engine];
            sorted.sort_by(f64::total_cmp);
            println!(
                "timing_us,{case},{},{:.3},{:.3},{:.3}",
                names[engine], sorted[4], sorted[0], sorted[8]
            );
        }
    }
}
