"""Spike CLI for Personal DJ v2.

Usage: python spike_mix.py song1.mp3 song2.mp3 -o output.wav

Runs the full pipeline: analyze -> plan -> render.
"""

import argparse
import sys
import time


def main():
    parser = argparse.ArgumentParser(
        description="Personal DJ v2 Spike - Mix 2 tracks with AI-powered transitions"
    )
    parser.add_argument("track_a", help="Path to first audio file")
    parser.add_argument("track_b", help="Path to second audio file")
    parser.add_argument(
        "-o",
        "--output",
        default="output.wav",
        help="Output file path (default: output.wav)",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    # Lazy imports so --help works without deps
    from app.services.audio_analyzer import analyze_track
    from app.services.mix_planner import create_mix_plan
    from app.services.transition_engine import render_transition

    print("Personal DJ v2 Spike")
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
        print(f"  Selected section A: {plan.selected_section_a.label.value} "
              f"[{plan.selected_section_a.start:.1f}s - {plan.selected_section_a.end:.1f}s]")
        print(f"  Selected section B: {plan.selected_section_b.label.value} "
              f"[{plan.selected_section_b.start:.1f}s - {plan.selected_section_b.end:.1f}s]")
        # Show all segments for both tracks
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


if __name__ == "__main__":
    main()
