#!/usr/bin/env python3
"""Train a compact melodic prior from the CC0 OpenScore Lieder Corpus."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile


NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10)
RHYTHM_VALUES = (1 / 6, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0)
KEY_RE = re.compile(r"(?:^|\s)([A-Ga-g](?:[#b])?):")
MEASURE_RE = re.compile(r"^m(\d+)\s+(.*)$")


@dataclass
class NoteEvent:
    start: float
    duration: float
    pitch: int
    measure: int
    beat: float
    beats_per_bar: float

    @property
    def end(self) -> float:
        return self.start + self.duration


def parse_key_name(name: str) -> tuple[int, str] | None:
    if not name:
        return None
    letter = name[0].upper()
    if letter not in NOTE_PC:
        return None
    accidental = name[1:]
    offset = accidental.count("#") - accidental.count("b")
    mode = "major" if name[0].isupper() else "minor"
    return (NOTE_PC[letter] + offset) % 12, mode


def read_analysis(path: Path) -> dict[int, tuple[int, str]]:
    keys: dict[int, tuple[int, str]] = {}
    current: tuple[int, str] | None = None
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = MEASURE_RE.match(line.strip())
        if not match:
            continue
        measure = int(match.group(1))
        key_match = KEY_RE.search(match.group(2))
        if key_match:
            current = parse_key_name(key_match.group(1))
        if current:
            keys[measure] = current
    return keys


def pitch_to_midi(note: ET.Element) -> int | None:
    pitch = note.find("pitch")
    if pitch is None:
        return None
    step = pitch.findtext("step")
    octave_text = pitch.findtext("octave")
    if step not in NOTE_PC or octave_text is None:
        return None
    alter = int(float(pitch.findtext("alter", "0")))
    return (int(octave_text) + 1) * 12 + NOTE_PC[step] + alter


def part_names(root: ET.Element) -> dict[str, str]:
    names: dict[str, str] = {}
    for score_part in root.findall("./part-list/score-part"):
        part_id = score_part.get("id")
        if not part_id:
            continue
        fields = [
            score_part.findtext("part-name", ""),
            score_part.findtext("./score-instrument/instrument-name", ""),
            score_part.findtext("./score-instrument/instrument-sound", ""),
        ]
        names[part_id] = " ".join(fields).lower()
    return names


def parse_part(part: ET.Element) -> list[NoteEvent]:
    events: list[NoteEvent] = []
    divisions = 1.0
    beats = 4.0
    beat_type = 4.0
    global_time = 0.0

    for measure_index, measure in enumerate(part.findall("measure"), start=1):
        divisions_text = measure.findtext("./attributes/divisions")
        if divisions_text:
            divisions = max(1.0, float(divisions_text))
        beats_text = measure.findtext("./attributes/time/beats")
        beat_type_text = measure.findtext("./attributes/time/beat-type")
        if beats_text and beat_type_text:
            try:
                beats = float(beats_text.split("+")[0])
                beat_type = float(beat_type_text)
            except ValueError:
                pass
        nominal_measure_beats = beats * 4.0 / beat_type
        cursor = 0.0
        furthest = 0.0
        previous_note_start = 0.0

        for element in list(measure):
            if element.tag == "backup":
                cursor -= float(element.findtext("duration", "0")) / divisions
                cursor = max(0.0, cursor)
                continue
            if element.tag == "forward":
                cursor += float(element.findtext("duration", "0")) / divisions
                furthest = max(furthest, cursor)
                continue
            if element.tag != "note":
                continue
            duration = float(element.findtext("duration", "0")) / divisions
            is_chord_tone = element.find("chord") is not None
            start_in_measure = previous_note_start if is_chord_tone else cursor
            if element.find("grace") is None and element.find("rest") is None:
                midi = pitch_to_midi(element)
                if midi is not None and duration > 0:
                    events.append(
                        NoteEvent(
                            start=global_time + start_in_measure,
                            duration=duration,
                            pitch=midi,
                            measure=measure_index,
                            beat=start_in_measure,
                            beats_per_bar=nominal_measure_beats,
                        )
                    )
            if not is_chord_tone:
                previous_note_start = start_in_measure
                cursor += duration
                furthest = max(furthest, cursor)

        global_time += max(nominal_measure_beats, furthest)

    return events


def read_score(path: Path) -> tuple[list[NoteEvent], list[NoteEvent], str] | None:
    try:
        with zipfile.ZipFile(path) as archive:
            names = [
                name
                for name in archive.namelist()
                if name.lower().endswith(".xml") and "container" not in name.lower()
            ]
            if not names:
                return None
            root = ET.fromstring(archive.read(names[0]))
    except (OSError, ET.ParseError, zipfile.BadZipFile):
        return None

    names = part_names(root)
    parts = {part.get("id", ""): part for part in root.findall("part")}
    vocal_id = next(
        (
            part_id
            for part_id, name in names.items()
            if any(word in name for word in ("voice", "vocal", "soprano", "tenor", "alto", "baritone"))
        ),
        next(iter(parts), ""),
    )
    vocal_part = parts.get(vocal_id)
    if vocal_part is None:
        return None
    melody_events = parse_part(vocal_part)
    accompaniment_events: list[NoteEvent] = []
    for part_id, part in parts.items():
        if part_id != vocal_id:
            accompaniment_events.extend(parse_part(part))
    accompaniment_events.sort(key=lambda event: (event.start, event.pitch))
    composer = root.findtext("./identification/creator[@type='composer']", "Unknown")
    return melody_events, accompaniment_events, composer


def degree_absolute(pitch: int, tonic: int, mode: str) -> int | None:
    scale = MAJOR_SCALE if mode == "major" else MINOR_SCALE
    relative = pitch - tonic
    octave = math.floor(relative / 12)
    pitch_class = relative % 12
    if pitch_class not in scale:
        return None
    return octave * 7 + scale.index(pitch_class)


def rhythm_token(value: float) -> str:
    nearest = min(RHYTHM_VALUES, key=lambda candidate: abs(candidate - value))
    return f"{nearest:.4f}".rstrip("0").rstrip(".")


def metric_class(event: NoteEvent) -> str:
    beat = event.beat
    if abs(beat) < 0.06:
        return "downbeat"
    if abs(beat - round(beat)) < 0.08:
        return "beat"
    return "offbeat"


def weighted_rows(counter: Counter, limit: int = 10) -> list[list[int | str]]:
    return [[value, count] for value, count in counter.most_common(limit)]


def prune_contexts(
    contexts: dict[str, Counter],
    minimum: int = 10,
    limit: int = 9,
) -> dict[str, list[list[int | str]]]:
    return {
        context: weighted_rows(counter, limit)
        for context, counter in sorted(contexts.items())
        if sum(counter.values()) >= minimum
    }


def active_accompaniment(
    melody: list[NoteEvent],
    accompaniment: list[NoteEvent],
) -> list[list[int]]:
    result: list[list[int]] = []
    active: list[NoteEvent] = []
    cursor = 0
    for note in melody:
        while cursor < len(accompaniment) and accompaniment[cursor].start <= note.start + 0.025:
            active.append(accompaniment[cursor])
            cursor += 1
        active = [event for event in active if event.end >= note.start - 0.025]
        pitches = [event.pitch for event in active]
        if not pitches:
            pitches = [
                event.pitch
                for event in accompaniment[max(0, cursor - 12): min(len(accompaniment), cursor + 12)]
                if abs(event.start - note.start) <= 0.24
            ]
        result.append(pitches)
    return result


def train(corpus_root: Path) -> dict:
    interval_initial: dict[str, Counter] = defaultdict(Counter)
    interval_transitions: dict[str, Counter] = defaultdict(Counter)
    interval_views: dict[str, Counter] = defaultdict(Counter)
    rhythm_initial: dict[str, Counter] = defaultdict(Counter)
    rhythm_transitions: dict[str, Counter] = defaultdict(Counter)
    motif_ngrams: Counter = Counter()
    chord_relations: dict[str, Counter] = defaultdict(Counter)
    bass_intervals: Counter = Counter()
    cadence_intervals: dict[str, Counter] = defaultdict(Counter)
    composers: set[str] = set()
    score_count = 0
    note_count = 0
    accompaniment_note_count = 0
    phrase_count = 0
    skipped = 0

    score_paths = sorted(corpus_root.glob("scores/**/*.mxl"))
    for index, score_path in enumerate(score_paths, start=1):
        analysis_path = score_path.parent / "analysis_automatic.rntxt"
        if not analysis_path.exists():
            continue
        key_map = read_analysis(analysis_path)
        parsed = read_score(score_path)
        if not parsed or not key_map:
            skipped += 1
            continue
        melody, accompaniment, composer = parsed
        if len(melody) < 8 or not accompaniment:
            skipped += 1
            continue
        composers.add(composer)
        score_count += 1
        note_count += len(melody)
        accompaniment_note_count += len(accompaniment)
        verticals = active_accompaniment(melody, accompaniment)

        phrases: list[list[tuple[NoteEvent, int, str]]] = []
        phrase: list[tuple[NoteEvent, int, str]] = []
        previous_event: NoteEvent | None = None
        previous_key: tuple[int, str] | None = None
        for event in melody:
            key = key_map.get(event.measure)
            if not key:
                continue
            absolute = degree_absolute(event.pitch, key[0], key[1])
            if absolute is None:
                if len(phrase) >= 3:
                    phrases.append(phrase)
                phrase = []
                previous_event = event
                previous_key = key
                continue
            gap = event.start - (previous_event.end if previous_event else event.start)
            if phrase and (gap > 0.32 or key != previous_key):
                if len(phrase) >= 3:
                    phrases.append(phrase)
                phrase = []
            phrase.append((event, absolute, key[1]))
            previous_event = event
            previous_key = key
        if len(phrase) >= 3:
            phrases.append(phrase)

        phrase_count += len(phrases)
        for phrase in phrases:
            mode = phrase[0][2]
            intervals: list[int] = []
            rhythms: list[str] = []
            for item_index in range(1, len(phrase)):
                previous_note = phrase[item_index - 1]
                current_note = phrase[item_index]
                interval = current_note[1] - previous_note[1]
                if abs(interval) > 8:
                    intervals = []
                    rhythms = []
                    continue
                intervals.append(interval)
                ioi = max(1 / 12, current_note[0].start - previous_note[0].start)
                rhythms.append(rhythm_token(ioi))
            if not intervals:
                continue
            interval_initial[mode][intervals[0]] += 1
            if rhythms:
                rhythm_initial[mode][rhythms[0]] += 1
            for transition_index in range(2, len(intervals)):
                previous_two = intervals[transition_index - 2]
                previous_one = intervals[transition_index - 1]
                value = intervals[transition_index]
                interval_transitions[f"{previous_two},{previous_one}"][value] += 1
                note_event = phrase[min(transition_index + 1, len(phrase) - 1)][0]
                view = f"{mode}|{metric_class(note_event)}|{previous_two},{previous_one}"
                interval_views[view][value] += 1
            for transition_index in range(1, len(rhythms)):
                rhythm_transitions[f"{mode}|{rhythms[transition_index - 1]}"][rhythms[transition_index]] += 1
            for start in range(0, max(0, len(intervals) - 4)):
                window = tuple(intervals[start:start + 5])
                if max(abs(value) for value in window) <= 7:
                    motif_ngrams[",".join(str(value) for value in window)] += 1
            cadence_intervals[mode][intervals[-1]] += 1

        for event, pitches in zip(melody, verticals):
            key = key_map.get(event.measure)
            if not key or not pitches:
                continue
            relation_key = f"{key[1]}|{metric_class(event)}"
            accompaniment_classes = {pitch % 12 for pitch in pitches}
            chord_relations[relation_key]["chord"] += int(event.pitch % 12 in accompaniment_classes)
            chord_relations[relation_key]["nonchord"] += int(event.pitch % 12 not in accompaniment_classes)
            bass_intervals[(event.pitch - min(pitches)) % 12] += 1

        if index % 100 == 0:
            print(
                f"processed {index}/{len(score_paths)} files; trained on {score_count} scores",
                flush=True,
            )

    relation_probabilities = {}
    for context, counts in sorted(chord_relations.items()):
        total = counts["chord"] + counts["nonchord"]
        if total >= 20:
            relation_probabilities[context] = round((counts["chord"] + 1) / (total + 2), 5)

    bass_total = sum(bass_intervals.values()) + 12
    bass_weights = [round((bass_intervals[index] + 1) / bass_total, 7) for index in range(12)]
    maximum_bass_weight = max(bass_weights) or 1
    bass_weights = [round(value / maximum_bass_weight, 5) for value in bass_weights]

    try:
        revision = subprocess.check_output(
            ["git", "-C", str(corpus_root), "rev-parse", "HEAD"],
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unknown"

    return {
        "meta": {
            "accompanimentNoteCount": accompaniment_note_count,
            "composerCount": len(composers),
            "corpus": "OpenScore Lieder Corpus",
            "license": "CC0-1.0",
            "melodyNoteCount": note_count,
            "phraseCount": phrase_count,
            "revision": revision,
            "scoreCount": score_count,
            "skippedScores": skipped,
            "source": "https://github.com/OpenScore/Lieder",
        },
        "bassIntervalWeights": bass_weights,
        "cadenceIntervals": {
            mode: weighted_rows(counter, 9)
            for mode, counter in sorted(cadence_intervals.items())
        },
        "chordToneProbability": relation_probabilities,
        "initialIntervals": {
            mode: weighted_rows(counter, 12)
            for mode, counter in sorted(interval_initial.items())
        },
        "intervalTransitions": prune_contexts(interval_transitions, minimum=16, limit=9),
        "intervalViews": prune_contexts(interval_views, minimum=12, limit=8),
        "motifNgrams": [list(row) for row in motif_ngrams.most_common(256)],
        "rhythmInitial": {
            mode: weighted_rows(counter, 12)
            for mode, counter in sorted(rhythm_initial.items())
        },
        "rhythmTransitions": prune_contexts(rhythm_transitions, minimum=14, limit=10),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    model = train(args.corpus)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(model, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    print(json.dumps(model["meta"], indent=2), flush=True)
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
