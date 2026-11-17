#!/usr/bin/env python3
"""External comparison; never downloads or adds a QR dependency to the project."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[3]
BENCH = Path(__file__).resolve().parent
MANIFEST = ROOT / 'rust/embedded/Cargo.toml'
TARGET = ROOT / 'rust/target'


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, text=True, **kwargs)


def library(toolchain, target=None, optimal=False):
    args = ['cargo', f'+{toolchain}', 'build', '--locked', '--manifest-path', MANIFEST,
            '--target-dir', TARGET, '--release', '--lib', '--no-default-features', '-j', '2']
    if optimal:
        args += ['--features', 'optimal']
    if target:
        args += ['--target', target, '-Zbuild-std=core', '-Zbuild-std-features=compiler-builtins-mem']
    run(args)
    directory = TARGET / target / 'release' if target else TARGET / 'release'
    destination = OUT / f'lib{target or "host"}-{"optimal" if optimal else "compact"}.rlib'
    shutil.copyfile(directory / 'libforgesworn_qr_embedded.rlib', destination)
    return destination, directory


def flags(toolchain, target=None, directory=None):
    args = ['rustc', f'+{toolchain}', '--edition=2021', '-Copt-level=z', '-Clto=thin',
            '-Ccodegen-units=1', '-Cpanic=abort', '-Cembed-bitcode=yes']
    if target:
        deps = directory / 'deps'
        args += ['--target', target, '-Zemit-stack-sizes', '-L', f'dependency={deps}']
        for name in ('core', 'compiler_builtins'):
            libraries = list(deps.glob(f'lib{name}-*.rlib'))
            # Build-std can retain older feature variants: the just-built one is newest.
            lib = max(libraries, key=lambda p: p.stat().st_mtime_ns)
            args += ['--extern', f'{name}={lib}']
    return args


def baseline(toolchain, source, target=None, directory=None):
    destination = OUT / f'lib{target or "host"}-baseline.rlib'
    run(flags(toolchain, target, directory) + [source, '--crate-name', 'baseline',
        '--crate-type=rlib', '-o', destination])
    return destination


def elf_metrics(path):
    data = path.read_bytes()
    assert data[:6] == b'\x7fELF\x01\x01', 'expected ELF32 little-endian'
    offset = struct.unpack_from('<I', data, 32)[0]
    size, count, strings = struct.unpack_from('<HHH', data, 46)
    headers = [struct.unpack_from('<10I', data, offset + i * size) for i in range(count)]
    string_header = headers[strings]
    names = data[string_header[4]:string_header[4] + string_header[5]]
    flash = ram = 0
    sections = {}
    for name, kind, attrs, address, at, length, link, info, align, entry in headers:
        name = names[name:].split(b'\0', 1)[0].decode()
        if attrs & 2:
            if kind != 8:
                flash += length
            if attrs & 1:
                ram += length
            sections[name] = length
    # Sum allocated file-backed bytes, not ELF container length or rlib size.
    return {'flash_sections_bytes': flash, 'static_ram_bytes': ram, 'sections': sections}


def probe(target, baseline_lib, compact_lib, optimal_lib, directory, xtensa_bin):
    is_xtensa = target.startswith('xtensa')
    flash, ram = ('0x400d0000', '0x3ffb0000') if is_xtensa else ('0x42000000', '0x3fc80000')
    script = OUT / f'{target}.ld'
    script.write_text(f'''ENTRY(_start)
SECTIONS {{
 . = {flash};
 .text : {{ *(.literal .literal.*) *(.text .text.*) }}
 .rodata : {{ *(.rodata .rodata.*) *(.srodata .srodata.*) }}
 . = {ram};
 .data : {{ *(.data .data.*) *(.sdata .sdata.*) }}
 .bss (NOLOAD) : {{ *(.bss .bss.*) *(.sbss .sbss.*) *(COMMON) }}
 .stack_sizes 0 (INFO) : {{ *(.stack_sizes) }}
 /DISCARD/ : {{ *(.eh_frame .eh_frame_hdr) }}
}}
''')
    result = {}
    for name, lib, cfg in [('baseline', baseline_lib, 'probe_baseline'),
                           ('compact', compact_lib, None), ('optimal', optimal_lib, 'include_optimal')]:
        destination = OUT / f'{target}-{name}.elf'
        args = flags('esp', target, directory) + [BENCH / 'probe.rs', '-o', destination,
                '--extern', f'{"baseline" if name == "baseline" else "ours"}={lib}']
        if cfg:
            args += ['--cfg', cfg]
        if is_xtensa:
            args += ['-Clinker=' + str(xtensa_bin / 'xtensa-esp32-elf-gcc'),
                     '-Clink-arg=-nostartfiles', '-Clink-arg=-nostdlib', f'-Clink-arg=-Wl,-T,{script}']
        else:
            args += [f'-Clink-arg=-T{script}']
        run(args)
        result[name] = elf_metrics(destination)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-source', type=Path, required=True, help='existing qrcodegen-no-heap 1.8.1 src/lib.rs')
    parser.add_argument('--baseline-archive', type=Path, help='existing registry .crate archive; defaults to the source registry cache')
    parser.add_argument('--xtensa-bin', type=Path, help='existing Espressif GCC bin directory')
    parser.add_argument('--targets', nargs='*', default=['riscv32imac-unknown-none-elf'])
    args = parser.parse_args()
    source = args.baseline_source.resolve()
    archive = args.baseline_archive or source.parents[4] / 'cache' / source.parents[2].name / 'qrcodegen-no-heap-1.8.1.crate'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == 'd0e2c0bf8be8a1c4a4f48973dabf26943f05da2bfc2d3180aae62409dbba6f0c'
    with tarfile.open(archive) as package:
        assert source.read_bytes() == package.extractfile('qrcodegen-no-heap-1.8.1/src/lib.rs').read()
    OUT = TARGET / 'embedded-comparison'
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'baseline': {'version': '1.8.1', 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                           'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()},
              'recorded_utc': datetime.now(timezone.utc).isoformat(),
              'host_platform': platform.platform(),
              'host_machine': platform.machine(),
              'host_cpu': (run(['sysctl', '-n', 'machdep.cpu.brand_string'], capture_output=True).stdout.strip()
                           if platform.system() == 'Darwin' else platform.processor()),
              'candidate_source_sha256': hashlib.sha256((ROOT / 'rust/embedded/src/lib.rs').read_bytes()).hexdigest(),
              'tables_source_sha256': hashlib.sha256((ROOT / 'rust/src/tables.rs').read_bytes()).hexdigest(),
              'harness_sha256': {name: hashlib.sha256((BENCH / name).read_bytes()).hexdigest()
                                 for name in ('compare.py', 'host.rs', 'probe.rs', 'workloads.rs')},
              'host_compiler': run(['rustc', '+stable', '--version'], capture_output=True).stdout.strip(),
              'target_compiler': run(['rustc', '+esp', '--version'], capture_output=True).stdout.strip()}
    optimal_lib, _ = library('stable', optimal=True)
    baseline_lib = baseline('stable', source)
    host = OUT / 'host-comparison'
    run(flags('stable') + [BENCH / 'host.rs', '--extern', f'ours={optimal_lib}', '--extern', f'baseline={baseline_lib}',
        '--cfg', 'host_comparison', '--cfg', 'include_optimal', '-o', host])
    report['host_output'] = run([host], capture_output=True).stdout.splitlines()
    report['targets'] = {}
    for target in args.targets:
        if target.startswith('xtensa') and not args.xtensa_bin:
            parser.error('--xtensa-bin is needed for Xtensa linking')
        compact_lib, directory = library('esp', target)
        optimal_lib, directory = library('esp', target, optimal=True)
        baseline_lib = baseline('esp', source, target, directory)
        report['targets'][target] = probe(target, baseline_lib, compact_lib, optimal_lib, directory, args.xtensa_bin)
    path = OUT / 'report.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    print(f'Report written to {path}')
