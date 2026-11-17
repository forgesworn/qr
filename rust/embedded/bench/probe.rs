#![no_std]
#![no_main]
mod workloads;

#[no_mangle]
pub extern "C" fn _start() -> ! {
    let mut case = 0;
    loop {
        #[cfg(probe_baseline)]
        let snapshot = workloads::baseline(core::hint::black_box(case));
        #[cfg(all(not(probe_baseline), not(include_optimal)))]
        let snapshot = workloads::compact(core::hint::black_box(case));
        #[cfg(include_optimal)]
        let snapshot = workloads::optimal(core::hint::black_box(case));
        core::hint::black_box((snapshot.size, snapshot.dark));
        case = (case + 1) % 3;
    }
}

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {
        core::hint::spin_loop();
    }
}
