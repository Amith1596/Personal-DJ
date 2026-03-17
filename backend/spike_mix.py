"""Spike CLI for Personal DJ v2.

Usage:
  Auto mode:   python spike_mix.py song1.mp3 song2.mp3 -o output.wav
  Manual mode: python spike_mix.py --manual song1.mp3 30 120 song2.mp3 0 90 song3.mp3 45 180 -o output.wav

Runs the full pipeline: analyze -> plan -> render.
"""

import argparse
import sys
import time


def _parse_manual_args(args: list[str]) -> list[tuple[str, float, float]]:
    """Parse repeating triples: (file, start_sec, end_sec) from CLI args.

    Returns list of (file_path, start_time, end_time) tuples.
    Validates 2-5 songs.
    """
    if len(args) % 3 != 0:
        print(
            f"Error: --manual expects repeating triples (file start end), "
            f"got {len(args)} args (not divisible by 3).",
            file=sys.stderr,
        )
        sys.exit(1)

    triples = []
    for i in range(0, len(args), 3):
        file_path = args[i]
        try:
            start = float(args[i + 1])
            end = float(args[i + 2])
        except ValueError:
            print(
                f"Error: start/end must be numbers. Got '{args[i+1]}' '{args[i+2]}'.",
                file=sys.stderr,
            )
            sys.exit(1)
        if start < 0 or end < 0:
            print(f"Error: timestamps must be non-negative.", file=sys.stderr)
            sys.exit(1)
        if end <= start:
            print(
                f"Error: end ({end}s) must be > start ({start}s) for {file_path}.",
                file=sys.stderr,
            )
            sys.exit(1)
        triples.append((file_path, start, end))

    if len(triples) < 2:
        print("Error: --manual requires at least 2 songs.", file=sys.stderr)
        sys.exit(1)
    if len(triples) > 5:
        print("Error: --manual supports at most 5 songs.", file=sys.stderr)
        sys.exit(1)

    return triples


def _run_auto(args):
    """Original auto mode: analyze 2 songs, auto-pick sections, render."""
    from app.services.audio_analyzer import analyze_track
    from app.services.mix_planner import create_mix_plan
    from app.services.transition_engine import render_transition

    print("Personal DJ v2 Spike (Auto Mode)")
    print("=" * 40)

    # Step 1: Analyze
    print(f"\n[1/3] Analyzing {args.track_a}...")
    t0 = time.time()
    analysis_a = analyze_track(args.track_a)
    t1 = time.time()
    if args.verbose:
        print(f"  BPM: {analysis_a.bpm:.1f}")
        print(
            f"  Key: {analysis_a.key.key} {analysis_a.key.scale} ({analysis_a.key.camelot})"
        )
        print(f"  Segments: {len(analysis_a.segments)}")
        print(f"  Duration: {analysis_a.duration:.1f}s")
    print(f"  Done in {t1 - t0:.1f}s")

    print(f"\n[1/3] Analyzing {args.track_b}...")
    t0 = time.time()
    analysis_b = analyze_track(args.track_b)
    t1 = time.time()
    if args.verbose:
        print(f"  BPM: {analysis_b.bpm:.1f}")
        print(
            f"  Key: {analysis_b.key.key} {analysis_b.key.scale} ({analysis_b.key.camelot})"
        )
        print(f"  Segments: {len(analysis_b.segments)}")
        print(f"  Duration: {analysis_b.duration:.1f}s")
    print(f"  Done in {t1 - t0:.1f}s")

    # Step 2: Plan
    print("\n[2/3] Planning transition...")
    t0 = time.time()
    plan = create_mix_plan(analysis_a, analysis_b)
    t1 = time.time()
    print(f"  Strategy: {plan.strategy.value}")
    print(f"  Camelot distance: {plan.cue_pair.camelot_distance}")
    print(f"  BPM delta: {plan.cue_pair.bpm_delta:.1f}")
    print(f"  Score: {plan.cue_pair.score:.3f}")
    if args.verbose:
        print(
            f"  Exit cue: {plan.cue_pair.exit_cue.segment.label.value} @ {plan.cue_pair.exit_cue.time:.1f}s"
        )
        print(
            f"  Entry cue: {plan.cue_pair.entry_cue.segment.label.value} @ {plan.cue_pair.entry_cue.time:.1f}s"
        )
        print(f"  Transition: {plan.transition_duration_bars} bars")
        print(
            f"  Selected section A: {plan.selected_section_a.label.value} "
            f"[{plan.selected_section_a.start:.1f}s - {plan.selected_section_a.end:.1f}s]"
        )
        print(
            f"  Selected section B: {plan.selected_section_b.label.value} "
            f"[{plan.selected_section_b.start:.1f}s - {plan.selected_section_b.end:.1f}s]"
        )
        print(f"  --- Track A segments ---")
        for s in analysis_a.segments:
            print(f"    {s.label.value:8s} [{s.start:.1f}s - {s.end:.1f}s]")
        print(f"  --- Track B segments ---")
        for s in analysis_b.segments:
            print(f"    {s.label.value:8s} [{s.start:.1f}s - {s.end:.1f}s]")
    print(f"  Done in {t1 - t0:.3f}s")

    # Step 3: Render
    print("\n[3/3] Rendering transition...")
    t0 = time.time()
    output = render_transition(plan, args.output)
    t1 = time.time()
    print(f"  Done in {t1 - t0:.1f}s")

    print(f"\n{'=' * 40}")
    print(f"Output: {output}")
    print("Listen and evaluate transition quality!")


def _run_manual(args):
    """Manual mode: user-specified timestamps for 2-5 songs."""
    from app.models.schemas import ManualSegment
    from app.services.audio_analyzer import analyze_track
    from app.services.transition_engine import render_chain

    triples = _parse_manual_args(args.songs)
    n = len(triples)

    print(f"Personal DJ v2 Spike (Manual Mode, {n} songs)")
    print("=" * 40)

    # Step 1: Analyze all songs
    analyses = []
    segments = []
    for i, (file_path, start, end) in enumerate(triples, 1):
        print(f"\n[1/{n+2}] Analyzing song {i}: {file_path} [{start:.0f}s - {end:.0f}s]...")
        t0 = time.time()
        analysis = analyze_track(file_path)
        t1 = time.time()
        analyses.append(analysis)
        segments.append(ManualSegment(file_path=file_path, start_time=start, end_time=end))
        if args.verbose:
            print(f"  BPM: {analysis.bpm:.1f}")
            print(
                f"  Key: {analysis.key.key} {analysis.key.scale} ({analysis.key.camelot})"
            )
            print(f"  Duration: {analysis.duration:.1f}s")
        print(f"  Done in {t1 - t0:.1f}s")

    # Step 2: Plan transitions (logged during render_chain)
    print(f"\n[2/{n+2}] Planning {n-1} transition(s)...")

    # Step 3: Render chain
    print(f"\n[3/{n+2}] Rendering chain mix...")
    t0 = time.time()
    output = render_chain(analyses, segments, args.output)
    t1 = time.time()
    print(f"  Done in {t1 - t0:.1f}s")

    print(f"\n{'=' * 40}")
    print(f"Output: {output}")
    print(f"Chain: {n} songs, {n-1} transition(s)")
    print("Listen and evaluate!")


def main():
    parser = argparse.ArgumentParser(
        description="Personal DJ v2 Spike - Mix tracks with AI-powered transitions"
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Manual mode: provide file start end triples",
    )
    parser.add_argument(
        "songs",
        nargs="*",
        help=(
            "Auto mode: track_a track_b. "
            "Manual mode: file1 start1 end1 file2 start2 end2 ..."
        ),
    )
    parser.add_argument(
        "-o",
        "--output",
        default="output.wav",
        help="Output file path (default: output.wav)",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    if args.manual:
        if not args.songs:
            print("Error: --manual requires song triples.", file=sys.stderr)
            sys.exit(1)
        _run_manual(args)
    else:
        if len(args.songs) != 2:
            print(
                "Error: auto mode requires exactly 2 track arguments.",
                file=sys.stderr,
            )
            parser.print_help()
            sys.exit(1)
        # Backward-compatible: set track_a/track_b on args
        args.track_a = args.songs[0]
        args.track_b = args.songs[1]
        _run_auto(args)


if __name__ == "__main__":
    main()
