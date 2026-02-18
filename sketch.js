// ----------------------------------------------------
// GLOBALS
// ----------------------------------------------------

let SHAPE_REGISTRY = {};
let SHAPE_SVGS = {};

const INSTRUMENTS_BY_CATEGORY = {
  keys: ['piano', 'keyboard', 'organ', 'electricorgan', 'rhodes', 'yamaha', 'mellotron', 'stylophone', 'melodica', 'xylophone', 'marimba', 'glockenspiel', 'tubularbells', 'chime', 'celesta'],
  percussion: ['kick', 'bassdrum', 'snare', 'toms', 'hihat', 'crashsplash', 'tambourine', 'clap'],
  wind: ['flute', 'piccolo', 'recorder', 'whistle', 'clarinet', 'oboe', 'bassoon', 'trumpet'],
  strings: ['acousticguitar', 'electricguitar', 'bass', 'electricbass', 'violin', 'viola', 'cello'],
  synths: ['synth', 'pad', 'lead', 'bass_synth', 'arpeggio']
};

const DEFAULT_INSTRUMENTS = {
  keys: 'piano',
  percussion: 'kick',
  wind: 'flute',
  strings: 'acousticguitar',
  synths: 'synth'
};

let measures = [];

// beatsPerMeasure is 4 (one measure = 4 counts, as a dancer counts it).
let beatsPerMeasure = 4;
let BPM = 120;
let measureDuration = (60 / BPM) * beatsPerMeasure; // 2.0s at 120 BPM default

let columns = 4;
let currentMeasureIndex = 0;
let cellW, cellH;

// Audio globals
let isAnalyzing = false;
let isPlaying = false;
let bpmInput;
let audioContext = null;
let analyser = null;
let source = null;
let audioBuffer = null;
let meydaAnalyzer = null;
let startTime = 0;
let timeDomainBuffer = null;

// BPM guard — prevents setupAudioPlayback() from overwriting user's BPM
let userHasSetBPM = false;

// Beat clock
let beatClockStart    = null;
let beatClockTime     = 0;
let beatClockStep     = 0;
let beatClockTimer    = null;
let beatClockPlayedSeconds = 0;

let playbackStartAudioTime = 0;
let playedOffsetSeconds    = 0;

function getSongTime() {
  if (!audioContext) return 0;
  if (!isPlaying) return playedOffsetSeconds;
  return playedOffsetSeconds + (audioContext.currentTime - playbackStartAudioTime);
}

function resetSongClock() {
  playedOffsetSeconds = 0;
  playbackStartAudioTime = audioContext ? audioContext.currentTime : 0;
}

function pauseSongClock() {
  if (!audioContext) return;
  playedOffsetSeconds = getSongTime();
}

function resumeSongClock() {
  if (!audioContext) return;
  playbackStartAudioTime = audioContext.currentTime;
}

function getAccurateBeatTime() {
  const currentSegmentSeconds = beatClockStart !== null
    ? (performance.now() - beatClockStart) / 1000
    : 0;
  return beatClockPlayedSeconds + currentSegmentSeconds;
}

// Category selection
let categorySelect;
let currentCategory = 'keys';

// UI Elements
let audioFileInput, analyzeButton, resetButton, pauseButton, downloadButton;
let columnsSlider, columnValueSpan, statusDiv, loadingDiv, fileNameDiv;

// Temporal accumulation
let measureBuffers = [];
let previousSpectrum = null;
const SUBDIVISIONS = 8;

// ----------------------------------------------------
// PRELOAD
// ----------------------------------------------------

function preload() {
  console.log("Starting preload...");
  try {
    SHAPE_REGISTRY = loadJSON("shapes.json",
      (data) => {
        console.log("JSON loaded with", Object.keys(data).length, "instruments");
        SHAPE_REGISTRY = data;
        loadCategorySVGs();
      },
      () => { console.log("shapes.json not found, using fallback"); createFallbackRegistry(); }
    );
  } catch (error) {
    console.log("Error loading shapes, using fallback");
    createFallbackRegistry();
  }
}

function loadCategorySVGs() {
  const instrumentsToLoad = INSTRUMENTS_BY_CATEGORY[currentCategory] || [];
  for (let instrument of instrumentsToLoad) {
    let def = SHAPE_REGISTRY[instrument];
    if (def && def.svg) {
      SHAPE_SVGS[instrument] = loadImage(
        def.svg,
        () => console.log("Loaded:", instrument),
        () => { console.log("Failed to load SVG for:", instrument); createPlaceholderFor(instrument); }
      );
    } else {
      createPlaceholderFor(instrument);
    }
  }
}

function createPlaceholderFor(instrument) {
  let pg = createGraphics(100, 100);
  pg.clear();
  pg.background(255, 0);
  SHAPE_SVGS[instrument] = pg;
}

function createFallbackRegistry() {
  SHAPE_REGISTRY = {
    piano: { elongated: true, category: 'keys' },
    keyboard: { elongated: true, category: 'keys' },
    organ: { elongated: true, category: 'keys' },
    electricorgan: { elongated: true, category: 'keys' },
    rhodes: { elongated: true, category: 'keys' },
    yamaha: { elongated: true, category: 'keys' },
    mellotron: { elongated: true, category: 'keys' },
    stylophone: { elongated: true, category: 'keys' },
    melodica: { elongated: false, category: 'keys' },
    xylophone: { elongated: false, category: 'keys' },
    marimba: { elongated: false, category: 'keys' },
    glockenspiel: { elongated: false, category: 'keys' },
    tubularbells: { elongated: false, category: 'keys' },
    chime: { elongated: false, category: 'keys' },
    celesta: { elongated: false, category: 'keys' },
    kick: { percussion: true, category: 'percussion' },
    bassdrum: { percussion: true, category: 'percussion' },
    snare: { percussion: true, category: 'percussion' },
    toms: { percussion: true, category: 'percussion' },
    hihat: { percussion: true, category: 'percussion' },
    crashsplash: { percussion: true, category: 'percussion' },
    tambourine: { percussion: true, category: 'percussion' },
    clap: { percussion: true, category: 'percussion' },
    flute: { elongated: true, category: 'wind' },
    piccolo: { elongated: true, category: 'wind' },
    recorder: { elongated: true, category: 'wind' },
    whistle: { elongated: true, category: 'wind' },
    clarinet: { elongated: true, category: 'wind' },
    oboe: { elongated: true, category: 'wind' },
    bassoon: { elongated: true, category: 'wind' },
    trumpet: { elongated: true, category: 'wind' },
    acousticguitar: { elongated: true, stringInstrument: true, category: 'strings' },
    electricguitar: { elongated: true, stringInstrument: true, category: 'strings' },
    bass: { elongated: true, stringInstrument: true, category: 'strings' },
    electricbass: { elongated: true, stringInstrument: true, category: 'strings' },
    violin: { elongated: true, stringInstrument: true, category: 'strings' },
    viola: { elongated: true, stringInstrument: true, category: 'strings' },
    cello: { elongated: true, stringInstrument: true, category: 'strings' },
    synth: { gradient: true, category: 'synths' },
    pad: { gradient: true, category: 'synths' },
    lead: { gradient: true, category: 'synths' },
    bass_synth: { gradient: true, category: 'synths' }
  };

  for (let category in DEFAULT_INSTRUMENTS) {
    createPlaceholderFor(DEFAULT_INSTRUMENTS[category]);
  }
}

// ----------------------------------------------------
// SETUP
// ----------------------------------------------------

function setup() {
  console.log("Setting up canvas...");
  const canvasContainer = document.getElementById('canvas-container');
  const canvas = createCanvas(canvasContainer.clientWidth, windowHeight);
  canvas.parent('canvas-container');
  colorMode(HSB, 360, 100, 100, 255);
  noStroke();
  calculateCellSize();
  setupAudioControls();
  document.addEventListener('click', initAudioContext, { once: true });
  console.log("Setup complete!");
}

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("AudioContext initialized");
  }
}

function calculateCellSize() {
  cellW = width / columns;
  cellH = cellW;
}

function setupAudioControls() {
  audioFileInput  = document.getElementById('audio-upload');
  analyzeButton   = document.getElementById('analyze-btn');
  resetButton     = document.getElementById('reset-btn');
  pauseButton     = document.getElementById('pause-btn');
  downloadButton  = document.getElementById('download-btn');
  columnsSlider   = document.getElementById('columns');
  columnValueSpan = document.getElementById('column-value');
  statusDiv       = document.getElementById('status');
  loadingDiv      = document.getElementById('loading');
  fileNameDiv     = document.getElementById('file-name');
  bpmInput        = document.getElementById('bpm-input');
  categorySelect  = document.getElementById('category-select');

  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      if (statusDiv) statusDiv.textContent = `Selected: ${getCategoryName(currentCategory)}`;
      SHAPE_SVGS = {};
      loadCategorySVGs();
    });
  }

  if (bpmInput) {
    bpmInput.addEventListener('input', () => {
      const parsed = parseInt(bpmInput.value);
      if (!isNaN(parsed) && parsed > 0) {
        BPM           = parsed;
        userHasSetBPM = true;
        measureDuration = (60 / BPM) * beatsPerMeasure;
        if (statusDiv) statusDiv.textContent = `BPM: ${BPM} — measure = ${measureDuration.toFixed(3)}s`;
        console.log(`User set BPM: ${BPM}, measureDuration: ${measureDuration.toFixed(3)}s`);
      }
    });
  }

  if (statusDiv) statusDiv.textContent = 'Ready to upload audio';
  if (audioFileInput) audioFileInput.addEventListener('change', handleFileSelect);
  if (analyzeButton)  analyzeButton.addEventListener('click', analyzeAudio);
  if (resetButton)    resetButton.addEventListener('click', resetComposition);
  if (pauseButton)    pauseButton.addEventListener('click', togglePause);
  if (downloadButton) downloadButton.addEventListener('click', downloadComposition);
  if (columnsSlider)  { columnsSlider.addEventListener('input', updateColumns); updateColumns(); }
}

function getCategoryName(category) {
  const names = {
    keys: 'Keys and Harmonics', percussion: 'Drums and Percussion',
    wind: 'Wind and Brass', strings: 'Guitar and Strings', synths: 'Synthesizers'
  };
  return names[category] || category;
}

// ----------------------------------------------------
// AUDIO FUNCTIONS
// ----------------------------------------------------

function updateColumns() {
  if (columnsSlider && columnValueSpan) {
    columns = parseInt(columnsSlider.value);
    columnValueSpan.textContent = columns;
    calculateCellSize();
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file && fileNameDiv && statusDiv) {
    fileNameDiv.textContent = `Selected: ${file.name}`;
    statusDiv.textContent = `Ready to transcribe ${getCategoryName(currentCategory)}`;
  }
}

function analyzeAudio() {
  if (!audioFileInput || !audioFileInput.files[0]) {
    if (statusDiv) statusDiv.textContent = '⚠️ Please select an audio file first';
    return;
  }

  const file = audioFileInput.files[0];
  if (statusDiv) statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)}...`;
  if (loadingDiv) loadingDiv.style.display = 'block';

  isAnalyzing = true;
  isPlaying   = false;
  measures    = [];
  measureBuffers      = [];
  currentMeasureIndex = 0;
  previousSpectrum    = null;

  console.log(`Transcribing ${currentCategory} from:`, file.name);

  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const fileReader = new FileReader();
  fileReader.onload = (e) => {
    audioContext.decodeAudioData(e.target.result, (buffer) => {
      audioBuffer = buffer;
      setupAudioPlayback();
      if (statusDiv) statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)}... Playing`;
    }, (error) => {
      console.error("Error decoding audio:", error);
      if (statusDiv) statusDiv.textContent = '⚠️ Error decoding audio file';
      if (loadingDiv) loadingDiv.style.display = 'none';
      isAnalyzing = false;
    });
  };
  fileReader.readAsArrayBuffer(file);
}

function setupAudioPlayback() {
  if (!audioBuffer || !audioContext) return;

  if (source)        { source.stop(); source.disconnect(); }
  if (meydaAnalyzer) meydaAnalyzer.stop();

  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  timeDomainBuffer = new Uint8Array(analyser.fftSize);

  source.connect(analyser);
  analyser.connect(audioContext.destination);

  if (!userHasSetBPM) {
    BPM = estimateBPM(audioBuffer.duration);
    measureDuration = (60 / BPM) * beatsPerMeasure;
    console.log(`Auto-estimated BPM: ${BPM}, measureDuration: ${measureDuration.toFixed(3)}s`);
  } else {
    console.log(`Using user BPM: ${BPM}, measureDuration: ${measureDuration.toFixed(3)}s`);
  }

  try {
    meydaAnalyzer = Meyda.createMeydaAnalyzer({
      audioContext: audioContext,
      source: source,
      bufferSize: 512,
      featureExtractors: getFeaturesForCategory(currentCategory),
      callback: (features) => {
        if (!isPlaying || !features) return;

        let fundamentalHz = null;

        if (
          currentCategory === 'keys' ||
          currentCategory === 'strings' ||
          currentCategory === 'wind' ||
          currentCategory === 'synths'
        ) {
          if (analyser && timeDomainBuffer) {
            analyser.getByteTimeDomainData(timeDomainBuffer);
            fundamentalHz = autoCorrelatePitch(timeDomainBuffer, audioContext.sampleRate);
          }
        }

        processAudioFeatures(features, fundamentalHz);
      }
    });

    meydaAnalyzer.start();
    startTime = audioContext.currentTime;

    resetSongClock();

    source.start(0);
    isPlaying   = true;
    isAnalyzing = false;

    startBeatClock();

    if (loadingDiv) loadingDiv.style.display = 'none';
    if (statusDiv)  statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)} at ${BPM} BPM`;
    if (pauseButton) pauseButton.textContent = 'Pause';

    console.log(`Started transcribing ${currentCategory}`);
  } catch (error) {
    console.error("Meyda initialization error:", error);
    if (statusDiv)  statusDiv.textContent = '⚠️ Error initializing audio analyzer';
    if (loadingDiv) loadingDiv.style.display = 'none';
    isAnalyzing = false;
  }
}

function getFeaturesForCategory(category) {
  const baseFeatures = ['rms', 'amplitudeSpectrum'];
  switch (category) {
    case 'keys':
    case 'wind':
    case 'strings':
      return [...baseFeatures, 'spectralCentroid', 'chroma', 'mfcc'];
    case 'percussion':
      return [...baseFeatures, 'zcr', 'spectralRolloff', 'rms'];
    case 'synths':
      return [...baseFeatures, 'spectralCentroid', 'chroma', 'perceptualSharpness'];
    default:
      return baseFeatures;
  }
}

// ----------------------------------------------------
// AUDIO FEATURE PROCESSING
// ----------------------------------------------------

function processAudioFeatures(features, fundamentalHz) {
  if (!isPlaying || !features) return;

  const currentTime   = getSongTime();
  const measureIndex  = Math.floor(currentTime / measureDuration);
  const timeInMeasure = currentTime - measureIndex * measureDuration;

  const sliceIndex = Math.min(
    SUBDIVISIONS - 1,
    Math.max(0, Math.floor((timeInMeasure / measureDuration) * SUBDIVISIONS))
  );

  if (!measureBuffers[measureIndex]) {
    measureBuffers[measureIndex] = [];
    for (let i = 0; i < SUBDIVISIONS; i++) {
      measureBuffers[measureIndex][i] = {
        rms: [], centroid: [], chroma: [],
        rolloff: [], zcr: [], perceptualSharpness: [], flux: [],
        pitchHz: []
      };
    }
  }

  const slice = measureBuffers[measureIndex][sliceIndex];

  if (features.rms)               slice.rms.push(features.rms);
  if (features.spectralCentroid)  slice.centroid.push(features.spectralCentroid);
  if (features.spectralRolloff)   slice.rolloff.push(features.spectralRolloff);
  if (features.chroma)            slice.chroma.push(features.chroma);
  if (features.zcr)               slice.zcr.push(features.zcr);
  if (features.perceptualSharpness) slice.perceptualSharpness.push(features.perceptualSharpness);
  if (fundamentalHz)              slice.pitchHz.push(fundamentalHz);

  if (features.amplitudeSpectrum) {
    if (previousSpectrum) {
      let flux = 0;
      for (let i = 0; i < features.amplitudeSpectrum.length; i++) {
        const diff = features.amplitudeSpectrum[i] - previousSpectrum[i];
        if (diff > 0) flux += diff;
      }
      slice.flux.push(flux);
    }
    previousSpectrum = features.amplitudeSpectrum;
  }

  if (measureIndex > measures.length - 1) {
    generateMeasureFromBuffer(measureIndex - 1);
  }

  currentMeasureIndex = measureIndex;
}

// ----------------------------------------------------
// MEASURE GENERATION
// ----------------------------------------------------

function generateMeasureFromBuffer(measureIndex) {
  const buffer = measureBuffers[measureIndex];
  if (!buffer) return;

  let notes = [];

  for (let s = 0; s < SUBDIVISIONS; s++) {
    const slice = buffer[s];
    if (!slice) continue;

    const avgRMS       = average(slice.rms);
    const avgCentroid  = average(slice.centroid);
    const avgRolloff   = average(slice.rolloff);
    const avgZCR       = average(slice.zcr);
    const avgFlux      = average(slice.flux);
    const avgSharpness = average(slice.perceptualSharpness);
    const avgPitchHz   = average(slice.pitchHz);

    switch (currentCategory) {
      case 'keys':
        processKeysCategory(notes, s, avgRMS, avgCentroid, avgFlux, slice.chroma, avgPitchHz);
        break;
      case 'percussion':
        processPercussionCategory(notes, s, avgRMS, avgZCR, avgFlux, avgRolloff, avgCentroid);
        break;
      case 'wind':
        processWindCategory(notes, s, avgRMS, avgCentroid, avgFlux, slice.chroma, avgPitchHz);
        break;
      case 'strings':
        processStringsCategory(notes, s, avgRMS, avgCentroid, avgFlux, avgZCR, slice.chroma, avgPitchHz);
        break;
      case 'synths':
        processSynthsCategory(notes, s, avgRMS, avgCentroid, avgSharpness, avgFlux, slice.chroma, avgPitchHz);
        break;
    }
  }

  // ── Detect mode ONCE for the whole measure ──────────────────────────────
  const measurePitches = notes.map(n => n.pitchClass).filter(Boolean);
  const detectedMode   = detectMode(measurePitches);

  // ── Bake color into every note so draw() never recalculates it ──────────
  for (let note of notes) {
    note.color = pitchToColorAdvanced(
      note.pitchClass,
      note.octave,
      note.instrument,
      { mode: detectedMode, intensity: note.intensity ?? 0.5 }
    );
  }

  measures.push({ notes: notes, measureNumber: measureIndex + 1, category: currentCategory });
}

// ----------------------------------------------------
// CATEGORY PROCESSING
// ----------------------------------------------------

function processKeysCategory(notes, sliceIndex, rms, centroid, flux, chromaArray, pitchHz) {
  let pitchClass = null, octave = null, yNorm = null;

  if (pitchHz) {
    const midi = freqToMidi(pitchHz);
    pitchClass = midiToPitchClass(midi);
    octave     = midiToOctave(midi);
    yNorm      = freqToYNorm(pitchHz);
  } else if (chromaArray && chromaArray.length) {
    const chromaAvg = averageChroma(chromaArray);
    const i = chromaAvg.indexOf(Math.max(...chromaAvg));
    pitchClass = indexToPitch(i);
    octave     = mapToOctave(centroid);
    yNorm      = map(i, 0, 11, 0.85, 0.15);
  } else {
    return;
  }

  let instrument = 'piano';
  if (centroid < 400)       instrument = 'electricorgan';
  else if (centroid > 2000) instrument = 'xylophone';

  const confident = rms > 0.008 && flux < 10;
  if (!confident) return;

  notes.push({
    instrument: mapInstrumentName(instrument, 'keys'),
    pitchClass,
    octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: rms > 0.01 && flux < 0.05,
    confidence: 1
  });
}

function processPercussionCategory(notes, sliceIndex, rms, zcr, flux, rolloff, avgCentroid) {
  if (rms < 0.02) return;

  let instrument = 'tambourine';
  let yPos = 0.5;

  if (zcr > 0.15 && flux > 8) {
    instrument = 'snare';
    yPos = 0.6;
  } else if (rms > 0.08 && avgCentroid < 200) {
    instrument = 'bassdrum';
    yPos = 0.9;
  } else if (zcr > 0.1 && flux > 5) {
    instrument = 'hihat';
    yPos = 0.4;
  } else if (zcr > 0.2) {
    instrument = 'tambourine';
    yPos = 0.3;
  }

  notes.push({
    instrument: mapInstrumentName(instrument, 'percussion'),
    yPosition: yPos,
    slice: sliceIndex,
    intensity: rms
  });
}

function processWindCategory(notes, sliceIndex, rms, centroid, flux, chromaArray, pitchHz) {
  if (rms < 0.006) return;

  let pitchClass = null, octave = null, yNorm = null;

  if (pitchHz) {
    const midi = freqToMidi(pitchHz);
    pitchClass = midiToPitchClass(midi);
    octave     = midiToOctave(midi);
    yNorm      = freqToYNorm(pitchHz);
  } else if (chromaArray && chromaArray.length) {
    const chromaAvg = averageChroma(chromaArray);
    pitchClass = dominantPitch(chromaAvg);
    octave     = mapToOctave(centroid);
    yNorm      = map(centroid, 200, 4000, 0.85, 0.15, true);
  } else return;

  const instrument = centroid > 1200 ? 'trumpet' : 'flute';

  notes.push({
    instrument: mapInstrumentName(instrument, 'wind'),
    pitchClass,
    octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: flux < 0.03
  });
}

function processStringsCategory(notes, sliceIndex, rms, centroid, flux, zcr, chromaArray, pitchHz) {
  if (rms < 0.008) return;

  let pitchClass = null, octave = null, yNorm = null;

  if (pitchHz) {
    const midi = freqToMidi(pitchHz);
    pitchClass = midiToPitchClass(midi);
    octave     = midiToOctave(midi);
    yNorm      = freqToYNorm(pitchHz);
  } else if (chromaArray && chromaArray.length) {
    const chromaAvg = averageChroma(chromaArray);
    pitchClass = dominantPitch(chromaAvg);
    octave     = mapToOctave(centroid);
    yNorm      = map(centroid, 200, 4000, 0.85, 0.15, true);
  } else {
    return;
  }

  let instrument = 'violin';
  if (centroid < 400)       instrument = 'electricbass';
  else if (centroid < 800)  instrument = 'cello';
  else                      instrument = (zcr > 0.15 ? 'electricguitar' : 'acousticguitar');

  notes.push({
    instrument: mapInstrumentName(instrument, 'strings'),
    pitchClass,
    octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: flux < 0.02,
    plucked: zcr > 0.12
  });
}

function processSynthsCategory(notes, sliceIndex, rms, centroid, sharpness, flux, chromaArray, pitchHz) {
  if (rms < 0.005) return;

  const synthType = (sharpness > 2.5) ? 'lead'
    : (centroid < 400)  ? 'bass_synth'
    : (flux < 0.01)     ? 'pad'
    : 'synth';

  let yNorm = map(centroid, 200, 4000, 0.85, 0.15, true);
  let pitchClass = 'C', octave = mapToOctave(centroid);

  if (pitchHz) {
    const midi = freqToMidi(pitchHz);
    pitchClass = midiToPitchClass(midi);
    octave     = midiToOctave(midi);
    yNorm      = freqToYNorm(pitchHz);
  } else if (chromaArray && chromaArray.length) {
    const chromaAvg = averageChroma(chromaArray);
    pitchClass = dominantPitch(chromaAvg);
  }

  notes.push({
    instrument: synthType,
    pitchClass,
    octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: flux < 0.02,
    intensity: sharpness || 1
  });
}

// ----------------------------------------------------
// INSTRUMENT NAME MAPPING
// ----------------------------------------------------

function mapInstrumentName(detectedInstrument, category) {
  const instrumentMap = {
    'piano': 'piano',
    'organ': 'electricorgan',
    'harpsichord': 'keyboard',
    'accordion': 'melodica',
    'kick': 'bassdrum',
    'snare': 'snare',
    'hihat': 'hihat',
    'tom': 'toms',
    'cymbal': 'crashsplash',
    'percussion': 'tambourine',
    'flute': 'flute',
    'trumpet': 'trumpet',
    'saxophone': 'clarinet',
    'clarinet': 'clarinet',
    'oboe': 'oboe',
    'horn': 'trumpet',
    'violin': 'violin',
    'cello': 'cello',
    'bass': 'electricbass',
    'guitar': 'acousticguitar',
    'viola': 'viola',
    'harp': 'acousticguitar',
    'synth': 'synth',
    'pad': 'pad',
    'lead': 'lead',
    'bass_synth': 'bass_synth',
    'arpeggio': 'synth'
  };

  return instrumentMap[detectedInstrument] || detectedInstrument;
}

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function averageChroma(chromaArrays) {
  let result = new Array(12).fill(0);
  if (!chromaArrays || chromaArrays.length === 0) return result;
  for (let c of chromaArrays) for (let i = 0; i < 12; i++) result[i] += c[i];
  for (let i = 0; i < 12; i++) result[i] /= chromaArrays.length;
  return result;
}

function indexToPitch(index) {
  return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][index];
}

function dominantPitch(chroma) {
  if (!chroma || chroma.length !== 12) return 'C';
  return indexToPitch(chroma.indexOf(Math.max(...chroma)));
}

function mapToOctave(spectralCentroid) {
  if (!spectralCentroid) return 4;
  if (spectralCentroid < 200)  return 2;
  if (spectralCentroid < 400)  return 3;
  if (spectralCentroid < 800)  return 4;
  if (spectralCentroid < 1600) return 5;
  return 6;
}

function estimateBPM(duration) {
  if (duration < 120) return 130;
  if (duration > 300) return 100;
  return 120;
}

function togglePause() {
  if (!source || !audioContext) return;

  if (isPlaying) {
    audioContext.suspend();
    pauseSongClock();
    isPlaying = false;
    if (statusDiv)   statusDiv.textContent = 'Paused';
    if (pauseButton) pauseButton.textContent = 'Resume';
  } else {
    audioContext.resume();
    resumeSongClock();
    isPlaying = true;
    if (statusDiv)   statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)} at ${BPM} BPM`;
    if (pauseButton) pauseButton.textContent = 'Pause';
  }
}

function resetComposition() {
  measures        = [];
  measureBuffers  = [];
  currentMeasureIndex = 0;

  resetSongClock();
  userHasSetBPM = false;

  if (source)        { source.stop(); source.disconnect(); }
  if (meydaAnalyzer) meydaAnalyzer.stop();

  isPlaying   = false;
  isAnalyzing = false;

  if (statusDiv)   statusDiv.textContent = 'Composition cleared';
  if (pauseButton) pauseButton.textContent = 'Pause';
  if (loadingDiv)  loadingDiv.style.display = 'none';
}

function downloadComposition() {
  if (measures.length === 0) {
    if (statusDiv) statusDiv.textContent = '⚠️ No composition to download';
    return;
  }
  saveCanvas();
  if (statusDiv) statusDiv.textContent = 'Composition downloaded';
}

// ----------------------------------------------------
// PITCH DETECTION (autocorrelation)
// ----------------------------------------------------

function autoCorrelatePitch(timeDomainData, sampleRate) {
  const buf = new Float32Array(timeDomainData.length);
  for (let i = 0; i < timeDomainData.length; i++) {
    buf[i] = (timeDomainData[i] - 128) / 128;
  }

  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;

  let r1 = 0, r2 = buf.length - 1;
  const thresh = 0.2;
  for (let i = 0; i < buf.length / 2; i++) {
    if (Math.abs(buf[i]) < thresh) { r1 = i; break; }
  }
  for (let i = 1; i < buf.length / 2; i++) {
    if (Math.abs(buf[buf.length - i]) < thresh) { r2 = buf.length - i; break; }
  }

  const trimmed = buf.slice(r1, r2);
  const size = trimmed.length;
  if (size < 32) return null;

  const c = new Float32Array(size).fill(0);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;

  let maxval = -1, maxpos = -1;
  for (let lag = d; lag < size; lag++) {
    if (c[lag] > maxval) { maxval = c[lag]; maxpos = lag; }
  }
  if (maxpos <= 0) return null;

  const x1 = maxpos - 1;
  const x2 = maxpos;
  const x3 = maxpos + 1;
  if (x3 < c.length) {
    const y1 = c[x1], y2 = c[x2], y3 = c[x3];
    const a = (y1 + y3 - 2 * y2) / 2;
    const b = (y3 - y1) / 2;
    if (a !== 0) {
      const shift = -b / (2 * a);
      const betterLag = x2 + shift;
      return sampleRate / betterLag;
    }
  }

  return sampleRate / maxpos;
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function midiToPitchClass(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const idx = ((Math.round(midi) % 12) + 12) % 12;
  return names[idx];
}

function midiToOctave(midi) {
  return Math.floor(Math.round(midi) / 12) - 1;
}

function freqToYNorm(freq) {
  const fMin = 80;
  const fMax = 1200;
  const f = Math.max(fMin, Math.min(fMax, freq));
  const t = (Math.log(f) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin));
  return 1 - t;
}

// ----------------------------------------------------
// DRAW FUNCTIONS
// ----------------------------------------------------

function draw() {
  background(0, 0, 100);
  if (isAnalyzing)         drawLoadingOverlay();
  if (measures.length > 0) drawScrollableGrid();
}

function drawScrollableGrid() {
  const totalRows    = Math.ceil(measures.length / columns);
  const totalHeight  = totalRows * cellH;
  const neededHeight = max(windowHeight, totalHeight);
  if (height !== neededHeight) resizeCanvas(width, neededHeight);

  for (let i = 0; i < measures.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x   = col * cellW;
    const y   = row * cellH;
    const isCurrent = (i === currentMeasureIndex) && isPlaying;
    drawMeasure(measures[i], x, y, cellW, isCurrent);
  }

  autoScrollToCurrentMeasure();
}

function autoScrollToCurrentMeasure() {
  if (!isPlaying || currentMeasureIndex < 0) return;
  const currentRow = Math.floor(currentMeasureIndex / columns);
  const targetY    = currentRow * cellH - windowHeight * 0.3;
  if (targetY > 0) window.scrollTo({ top: targetY, behavior: 'smooth' });
}

function drawMeasure(measure, x, y, size, isCurrent = false) {
  push();
  translate(x, y);

  fill(0, 0, 100);
  noStroke();
  rect(0, 0, size, size);

  // 4 vertical beat lines
  stroke(0, 0, 88);
  strokeWeight(0.5);
  for (let i = 1; i <= 3; i++) {
    const lineX = (size / 4) * i;
    line(lineX, 0, lineX, size);
  }
  // Horizontal midline for pitch reference
  stroke(0, 0, 92);
  line(0, size * 0.5, size, size * 0.5);
  noStroke();

  let notes = [...measure.notes];
  notes.sort((a, b) => (a.yPosition || 0.5) - (b.yPosition || 0.5));
  for (let i = 0; i < notes.length; i++) drawNote(notes[i], size, i, notes.length);

  if (isCurrent) {
    noFill();
    stroke(0, 0, 70, 60);
    strokeWeight(2);
    rect(2, 2, size - 4, size - 4);
    noStroke();
  }

  pop();
}

function drawNote(note, size, noteIndex, totalNotes) {
  const def = SHAPE_REGISTRY[note.instrument];
  if (!def) return;

  const x = map(note.slice + 0.5, 0, SUBDIVISIONS, size * 0.1, size * 0.9);

  let y;
  if (note.yPosition !== undefined) y = note.yPosition * size;
  else if (note.octave)             y = map(note.octave, 1, 8, size * 0.85, size * 0.15);
  else                              y = size * 0.5;
  y = constrain(y, size * 0.1, size * 0.9);

  // ── Read pre-baked color — no recalculation, no flashing ────────────────
  const noteColor = note.color || color(0, 0, 60);

  const baseSize = size * 0.10;
  let shapeSize  = baseSize;
  if (def.stringInstrument) shapeSize = note.plucked ? baseSize * 0.7 : baseSize;

  if (def.gradient) {
    drawSynthShape(x, y, baseSize * 2, noteColor);
  } else {
    drawInstrumentShape(note.instrument, x, y, shapeSize, noteColor);
    if (def.elongated) {
      const shouldDrawLine = note.isSustained || (def.stringInstrument && !note.plucked);
      if (shouldDrawLine) {
        stroke(noteColor);
        strokeWeight(1.5);
        strokeCap(ROUND);
        line(0, y, size, y);
        noStroke();
      }
    }
  }
}

function drawInstrumentShape(instrument, x, y, size, col) {
  const img = SHAPE_SVGS[instrument];
  if (img && img.width > 0 && img.height > 0) {
    push();
    imageMode(CENTER);
    // In HSB mode, tint() takes HSB values matching the current colorMode
    tint(hue(col), saturation(col), brightness(col), 255);
    image(img, x, y, size, size);
    pop();
  } else {
    push();
    noStroke();
    fill(col);
    if (instrument.includes('piano') || instrument.includes('organ') || instrument.includes('key')) {
      rect(x - size/2, y - size/3, size, size * 0.66, 3);
    } else if (instrument.includes('violin') || instrument.includes('cello') || instrument.includes('string')) {
      ellipse(x, y, size * 0.8, size * 0.4);
    } else if (instrument.includes('trumpet') || instrument.includes('sax') || instrument.includes('horn')) {
      ellipse(x, y, size * 0.6, size * 0.9);
      rect(x - size/4, y - size/2, size/2, size);
    } else if (instrument.includes('flute')) {
      rect(x - size/3, y - size/6, size * 0.66, size * 0.33, 5);
    } else if (instrument.includes('kick') || instrument.includes('drum')) {
      ellipse(x, y, size, size);
    } else if (instrument.includes('snare')) {
      stroke(col); strokeWeight(size * 0.08);
      line(x - size/2, y - size/2, x + size/2, y + size/2);
      line(x + size/2, y - size/2, x - size/2, y + size/2);
      noStroke();
    } else if (instrument.includes('hihat') || instrument.includes('cymbal')) {
      stroke(col); strokeWeight(1);
      ellipse(x, y, size * 0.8, size * 0.8);
      line(x - size/2, y, x + size/2, y);
      line(x, y - size/2, x, y + size/2);
      noStroke();
    } else if (instrument.includes('bass') && !instrument.includes('bass_synth')) {
      triangle(x, y - size/2, x - size/2, y + size/2, x + size/2, y + size/2);
    } else if (instrument.includes('guitar')) {
      ellipse(x, y, size * 0.7, size * 0.5);
    } else if (instrument.includes('synth') || instrument.includes('pad') || instrument.includes('lead')) {
      rect(x - size/2, y - size/2, size, size, 2);
    } else {
      ellipse(x, y, size, size);
    }
    pop();
  }
}

function drawSynthShape(x, y, size, col) {
  push();
  let h = hue(col), s = saturation(col), b = brightness(col);
  for (let r = size; r > 0; r -= 2) {
    fill(h, s, b, map(r, 0, size, 50, 0));
    ellipse(x, y, r * 2, r * 0.8);
  }
  pop();
}

function drawLoadingOverlay() {
  push();
  fill(255, 255, 255, 220);
  rect(0, 0, width, height);
  fill(50, 50, 50);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Transcribing Audio...", width/2, height/2 - 40);
  translate(width/2, height/2 + 20);
  rotate(frameCount * 0.05);
  noFill();
  stroke(50, 50, 50);
  strokeWeight(3);
  for (let i = 0; i < 8; i++) { push(); rotate(i * PI / 4); line(0, -20, 0, -30); pop(); }
  pop();
}

// ============================================================
// PITCH-TO-COLOR SYSTEM
// ============================================================
//
// Theoretical foundations:
//  - Scriabin's circle-of-fifths color wheel: hue follows harmonic
//    distance, not chromatic distance, so modulation looks smooth
//  - Frequency-spectrum analogy: pitch class → hue, octave → brightness
//  - Modal quality modifier: major warms & saturates, minor cools & desaturates
//  - Percussion fixed to warm red-orange-yellow palette (brightness only)
//
// Designed for p5.js colorMode(HSB, 360, 100, 100, 255)
// ============================================================

// Circle of fifths ordering reference
const CIRCLE_OF_FIFTHS_ORDER = [
  'C', 'G', 'D', 'A', 'E', 'B',
  'F#', 'C#', 'G#', 'D#', 'A#', 'F'
];

// Scriabin-inspired hue table, arranged by circle of fifths.
// Harmonically related notes are chromatically adjacent in HSB space
// → smooth colour transitions during modulation.
const SCRIABIN_BASE_HUE = {
  'C':  0,    // Red            (Scriabin: red)
  'G':  30,   // Red-Orange     (Scriabin: orange-rose)
  'D':  60,   // Yellow         (Scriabin: yellow)
  'A':  90,   // Yellow-Green   (Scriabin: green)
  'E':  150,  // Green          (Scriabin: sky-blue/pearly)
  'B':  195,  // Cyan           (Scriabin: steely blue)
  'F#': 225,  // Azure          (Scriabin: bright blue)
  'C#': 255,  // Violet-Blue    (Scriabin: violet)
  'G#': 285,  // Purple
  'D#': 310,  // Magenta        (Scriabin: steel with metallic sheen)
  'A#': 340,  // Red-Magenta
  'F':  355,  // Deep Red
};

const ENHARMONIC = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

function resolveEnharmonic(pitchClass) {
  return ENHARMONIC[pitchClass] || pitchClass;
}

// Modal modifiers
// hueShift: + = warmer (toward yellow/red), − = cooler (toward blue)
// satShift: + = more vivid,                 − = more muted
// briShift: + = brighter,                   − = darker
const MODAL_MODIFIERS = {
  ionian:    { h: +12, s: +10, b: +5  }, // Major — bright, warm, confident
  mixolydian:{ h:  +8, s:  +7, b: +3  }, // Dominant 7 feel — bluesy warmth
  lydian:    { h: +15, s: +12, b: +8  }, // Raised 4th — dreamy, luminous
  dorian:    { h:  -5, s:  +5, b:  0  }, // Minor with raised 6 — bittersweet
  aeolian:   { h: -12, s:  -8, b: -5  }, // Natural minor — melancholic, cool
  phrygian:  { h: -18, s: -12, b: -8  }, // Flat 2 — tense, dark, Spanish
  locrian:   { h: -25, s: -18, b: -12 }, // Flat 2 & 5 — dissonant, uncomfortable
};

const BASE_SATURATION = 75;
const BASE_BRIGHTNESS = 72;

function octaveModifiers(octave) {
  const o = constrain(octave || 4, 1, 8);
  const t = map(o, 1, 8, -1, 1);
  return {
    satDelta: map(t, -1, 1, -15, +15),
    brDelta:  map(t, -1, 1, -25, +25),
  };
}

// Percussion fixed warm palette
const PERCUSSION_HUE = {
  kick:        5,  // deep red
  bassdrum:    5,
  snare:      20,  // red-orange
  toms:       35,  // orange
  hihat:      50,  // yellow-orange
  crashsplash:55,
  tambourine: 45,
  clap:       25,
};

// ----------------------------------------------------
// MAIN COLOR FUNCTION
// pitchToColorAdvanced(pitchClass, octave, instrument, options)
//
// options = {
//   mode:      'ionian'|'dorian'|'phrygian'|'lydian'|'mixolydian'|'aeolian'|'locrian'
//   quality:   'maj'|'min'   (fallback if mode not given)
//   intensity: 0–1 float     (percussion brightness)
// }
// ----------------------------------------------------
function pitchToColorAdvanced(pitchClass, octave, instrument, options = {}) {

  // ── Percussion path ────────────────────────────────────────────────────
  const isPercussion = INSTRUMENTS_BY_CATEGORY.percussion.includes(instrument);
  if (isPercussion) {
    const h = PERCUSSION_HUE[instrument] ?? 20;
    const s = constrain(map(options.intensity ?? 0.5, 0, 1, 40, 95), 40, 95);
    const b = constrain(map(octave || 4, 1, 8, 35, 90), 35, 90);
    return color(h, s, b);
  }

  // ── Pitched instrument path ────────────────────────────────────────────
  if (!pitchClass) return color(0, 0, 60);

  const canonical = resolveEnharmonic(pitchClass);
  const baseHue   = SCRIABIN_BASE_HUE[canonical];
  if (baseHue === undefined) return color(0, 0, 50);

  let hueValue = baseHue;

  const { satDelta, brDelta } = octaveModifiers(octave);
  let sat = BASE_SATURATION + satDelta;
  let bri = BASE_BRIGHTNESS  + brDelta;

  // Apply modal modifier
  const mod = MODAL_MODIFIERS[options.mode] || null;
  if (mod) {
    hueValue = (hueValue + mod.h + 360) % 360;
    sat = constrain(sat + mod.s, 20, 100);
    bri = constrain(bri + mod.b, 20, 100);
  }

  return color(hueValue, sat, bri);
}

// ----------------------------------------------------
// MODE DETECTION
// Pass an array of pitchClass strings from one measure;
// returns the most likely Western mode string.
// Uses Hamming similarity against modal interval templates.
// ----------------------------------------------------
const MODAL_TEMPLATES = {
  ionian:    [1,0,1,0,1,1,0,1,0,1,0,1],
  dorian:    [1,0,1,1,0,1,0,1,0,1,1,0],
  phrygian:  [1,1,0,1,0,1,0,1,1,0,1,0],
  lydian:    [1,0,1,0,1,0,1,1,0,1,0,1],
  mixolydian:[1,0,1,0,1,1,0,1,0,1,1,0],
  aeolian:   [1,0,1,1,0,1,0,1,1,0,1,0],
  locrian:   [1,1,0,1,0,1,1,0,1,0,1,0],
};

const PITCH_TO_SEMITONE = {
  'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
  'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11,
  'Db':1,'Eb':3,'Gb':6,'Ab':8,'Bb':10
};

function detectMode(pitchClasses) {
  if (!pitchClasses || pitchClasses.length < 3) return null;

  // Find tonic candidate (most frequent pitch class)
  const freq = {};
  for (const p of pitchClasses) freq[p] = (freq[p] || 0) + 1;
  const tonic = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
  const tonicSemi = PITCH_TO_SEMITONE[tonic] ?? 0;

  // Build 12-bit presence vector relative to tonic
  const present = new Array(12).fill(0);
  for (const p of pitchClasses) {
    const semi = PITCH_TO_SEMITONE[p];
    if (semi !== undefined) {
      present[((semi - tonicSemi) + 12) % 12] = 1;
    }
  }

  // Score against each modal template via Hamming similarity
  let bestMode = 'ionian', bestScore = -1;
  for (const [mode, template] of Object.entries(MODAL_TEMPLATES)) {
    let score = 0;
    for (let i = 0; i < 12; i++) score += (present[i] === template[i]) ? 1 : 0;
    if (score > bestScore) { bestScore = score; bestMode = mode; }
  }

  return bestMode;
}

// Backward-compatible wrapper
function pitchToColor(pitchClass, octave, instrument, mode) {
  return pitchToColorAdvanced(pitchClass, octave, instrument || 'piano', { mode });
}

// ----------------------------------------------------
// RESIZE
// ----------------------------------------------------

function windowResized() {
  const canvasContainer = document.getElementById('canvas-container');
  const containerWidth  = canvasContainer.clientWidth;
  const neededHeight    = max(windowHeight, Math.ceil(measures.length / columns) * cellH);
  resizeCanvas(containerWidth, neededHeight);
  calculateCellSize();
}

function onSidebarToggle() {
  setTimeout(() => { windowResized(); }, 300);
}