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

// Each layer = one audio file + one instrument category.
// Layers are composited on top of each other, all sharing the same palette.
// Structure: [{ category, measures: [...], label }]
let layers  = [];
let measures = []; // always points to the CURRENTLY RECORDING layer's measures array

// How many times "Generate" has been clicked for the current key+mode combo.
// Used to seed The Color API with a different hue each time for variety.
let paletteVariantIndex = 0;

let beatsPerMeasure = 4;
let BPM = 120;
let measureDuration = (60 / BPM) * beatsPerMeasure;

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

let userHasSetBPM = false;

// Beat clock
let beatClockStart         = null;
let beatClockTime          = 0;
let beatClockStep          = 0;
let beatClockTimer         = null;
let beatClockPlayedSeconds = 0;

let playbackStartAudioTime = 0;
let playedOffsetSeconds    = 0;

// Song key detection
let globalPitchAccumulator = {};
let detectedSongKey        = null;
let songKeyHueOffset       = 0;

// User-defined key + mode palette
let userDefinedKey      = null;
let userDefinedMode     = null;
let scalePalette        = null;

function getSongTime() {
  if (!audioContext) return 0;
  if (!isPlaying) return playedOffsetSeconds;
  return playedOffsetSeconds + (audioContext.currentTime - playbackStartAudioTime);
}

function resetSongClock() {
  playedOffsetSeconds    = 0;
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
let measureBuffers   = [];
let previousSpectrum = null;
const SUBDIVISIONS   = 8;

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
    synth:    { gradient: true, synthBlock: true, category: 'synths' },
    pad:      { gradient: true, synthBlock: true, category: 'synths' },
    lead:     { gradient: true, synthBlock: true, category: 'synths' },
    bass_synth:{ gradient: true, synthBlock: true, category: 'synths' },
    arpeggio: { gradient: true, synthBlock: true, category: 'synths' }
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
        BPM             = parsed;
        userHasSetBPM   = true;
        measureDuration = (60 / BPM) * beatsPerMeasure;
        if (statusDiv) statusDiv.textContent = `BPM: ${BPM} — measure = ${measureDuration.toFixed(3)}s`;
      }
    });
  }

  // Key + mode palette inputs
  const keySelect  = document.getElementById('key-select');
  const modeSelect = document.getElementById('mode-select');
  const paletteBtn = document.getElementById('generate-palette-btn');
  const swatchRow  = document.getElementById('palette-swatches');

  if (paletteBtn) {
    paletteBtn.addEventListener('click', () => {
      const k = keySelect  ? keySelect.value  : 'C';
      const m = modeSelect ? modeSelect.value : 'ionian';
      applyLocalPalette(k, m, swatchRow, statusDiv);
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

  isAnalyzing            = true;
  isPlaying              = false;
  // Start a FRESH measures array for this layer — previous layers are kept in `layers[]`
  measures               = [];
  measureBuffers         = [];
  currentMeasureIndex    = 0;
  previousSpectrum       = null;
  globalPitchAccumulator = {};
  detectedSongKey        = null;
  songKeyHueOffset       = 0;
  if (scalePalette) songKeyHueOffset = -(SCRIABIN_BASE_HUE[scalePalette._rootKey] ?? 0);

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
    BPM             = estimateBPM(audioBuffer.duration);
    measureDuration = (60 / BPM) * beatsPerMeasure;
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
          currentCategory === 'keys'    ||
          currentCategory === 'strings' ||
          currentCategory === 'wind'    ||
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

    // When playback ends naturally, seal the layer
    source.onended = () => {
      // Use a small timeout so the last Meyda callback has time to fire
      setTimeout(() => {
        finalizeLayer();
        isPlaying = false;
        if (statusDiv) statusDiv.textContent =
          `Layer ${layers.length} saved (${getCategoryName(currentCategory)}). Upload another file to add a layer.`;
        if (pauseButton) pauseButton.textContent = 'Pause';
      }, 200);
    };

    // Resume AudioContext in case it was suspended (required on second+ play)
    audioContext.resume().then(() => {
      source.start(0);
      isPlaying   = true;
      isAnalyzing = false;
      startBeatClock();

      if (loadingDiv)  loadingDiv.style.display = 'none';
      if (statusDiv)   statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)} at ${BPM} BPM`;
      if (pauseButton) pauseButton.textContent = 'Pause';
    });
    return; // early return — the rest runs inside .then()

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

  if (features.chroma) {
    const chromaAvg = Array.isArray(features.chroma[0])
      ? averageChroma(features.chroma)
      : features.chroma;
    const dominantIdx = chromaAvg.indexOf(Math.max(...chromaAvg));
    const pc = indexToPitch(dominantIdx);
    globalPitchAccumulator[pc] = (globalPitchAccumulator[pc] || 0) + 1;
  }

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

function updateSongKey() {
  if (Object.keys(globalPitchAccumulator).length === 0) return;

  const tonic = Object.keys(globalPitchAccumulator)
    .sort((a, b) => globalPitchAccumulator[b] - globalPitchAccumulator[a])[0];

  if (tonic === detectedSongKey) return;

  detectedSongKey  = tonic;
  const tonicHue   = SCRIABIN_BASE_HUE[tonic] ?? 0;
  songKeyHueOffset = -tonicHue;

  console.log(`Song key: ${detectedSongKey}, hue offset: ${songKeyHueOffset}°`);
  if (statusDiv) statusDiv.textContent =
    `Key: ${detectedSongKey} | ${getCategoryName(currentCategory)} at ${BPM} BPM`;
}

// ----------------------------------------------------
// MEASURE GENERATION
// ----------------------------------------------------

function generateMeasureFromBuffer(measureIndex) {
  const buffer = measureBuffers[measureIndex];
  if (!buffer) return;

  updateSongKey();

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

  // Detect mode once for the whole measure
  const measurePitches = notes.map(n => n.pitchClass).filter(Boolean);
  const detectedMode   = detectMode(measurePitches);

  // Bake color as {h,s,b} object — NOT a p5 color() call (safe outside draw loop)
  for (let note of notes) {
    note.color = pitchToColorAdvanced(
      note.pitchClass,
      note.octave,
      note.instrument,
      { mode: detectedMode, intensity: note.intensity ?? 0.5 }
    );

    // For synth gradient bands: also bake a second color for the right edge.
    // Uses the next scale degree from the palette (or a small hue step if no palette).
    // This keeps the gradient entirely within the palette's color family —
    // no more rainbow bleed from unconstrained +60° hue sweeps.
    if (INSTRUMENTS_BY_CATEGORY.synths.includes(note.instrument)) {
      note.colorRight = getSynthGradientRight(
        note.pitchClass, note.octave, note.instrument,
        { mode: detectedMode, intensity: note.intensity ?? 0.5 }
      );
    }
  }

  measures.push({ notes: notes, measureNumber: measureIndex + 1, category: currentCategory });
}

// Called once when a layer finishes recording (source ends).
// Saves the completed layer into the persistent layers[] stack.
function finalizeLayer() {
  if (measures.length === 0) return;
  layers.push({
    category : currentCategory,
    measures : [...measures],
    label    : getCategoryName(currentCategory),
  });
  console.log(`Layer saved: ${currentCategory}, ${measures.length} measures. Total layers: ${layers.length}`);
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
  } else return;

  let instrument = 'piano';
  if (centroid < 400)       instrument = 'electricorgan';
  else if (centroid > 2000) instrument = 'xylophone';

  const confident = rms > 0.008 && flux < 10;
  if (!confident) return;

  notes.push({
    instrument: mapInstrumentName(instrument, 'keys'),
    pitchClass, octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: rms > 0.01 && flux < 0.05,
    confidence: 1
  });
}

function processPercussionCategory(notes, sliceIndex, rms, zcr, flux, rolloff, avgCentroid) {
  if (rms < 0.02) return;

  let instrument = 'tambourine', yPos = 0.5;

  if (zcr > 0.15 && flux > 8)              { instrument = 'snare';     yPos = 0.6; }
  else if (rms > 0.08 && avgCentroid < 200) { instrument = 'bassdrum';  yPos = 0.9; }
  else if (zcr > 0.1 && flux > 5)          { instrument = 'hihat';     yPos = 0.4; }
  else if (zcr > 0.2)                      { instrument = 'tambourine'; yPos = 0.3; }

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
    pitchClass, octave,
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
  } else return;

  let instrument = 'violin';
  if (centroid < 400)      instrument = 'electricbass';
  else if (centroid < 800) instrument = 'cello';
  else                     instrument = (zcr > 0.15 ? 'electricguitar' : 'acousticguitar');

  notes.push({
    instrument: mapInstrumentName(instrument, 'strings'),
    pitchClass, octave,
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
    pitchClass, octave,
    yPosition: yNorm,
    slice: sliceIndex,
    isSustained: flux < 0.02,
    intensity: sharpness || 1,
    bandHeight: map(rms, 0, 0.3, 0.12, 0.28, true)
  });
}

// ----------------------------------------------------
// INSTRUMENT NAME MAPPING
// ----------------------------------------------------

function mapInstrumentName(detectedInstrument, category) {
  const instrumentMap = {
    'piano':'piano','organ':'electricorgan','harpsichord':'keyboard',
    'accordion':'melodica','kick':'bassdrum','snare':'snare','hihat':'hihat',
    'tom':'toms','cymbal':'crashsplash','percussion':'tambourine',
    'flute':'flute','trumpet':'trumpet','saxophone':'clarinet','clarinet':'clarinet',
    'oboe':'oboe','horn':'trumpet','violin':'violin','cello':'cello',
    'bass':'electricbass','guitar':'acousticguitar','viola':'viola',
    'harp':'acousticguitar','synth':'synth','pad':'pad','lead':'lead',
    'bass_synth':'bass_synth','arpeggio':'synth'
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
  measures               = [];
  measureBuffers         = [];
  layers                 = [];          // wipe all layers
  currentMeasureIndex    = 0;
  globalPitchAccumulator = {};
  detectedSongKey        = null;
  songKeyHueOffset       = 0;
  paletteVariantIndex    = 0;

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
  for (let i = 0; i < timeDomainData.length; i++) buf[i] = (timeDomainData[i] - 128) / 128;

  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return null;

  let r1 = 0, r2 = buf.length - 1;
  const thresh = 0.2;
  for (let i = 0; i < buf.length / 2; i++) { if (Math.abs(buf[i]) < thresh) { r1 = i; break; } }
  for (let i = 1; i < buf.length / 2; i++) { if (Math.abs(buf[buf.length - i]) < thresh) { r2 = buf.length - i; break; } }

  const trimmed = buf.slice(r1, r2);
  const size    = trimmed.length;
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

  const x1 = maxpos - 1, x2 = maxpos, x3 = maxpos + 1;
  if (x3 < c.length) {
    const y1 = c[x1], y2 = c[x2], y3 = c[x3];
    const a = (y1 + y3 - 2 * y2) / 2;
    const b = (y3 - y1) / 2;
    if (a !== 0) return sampleRate / (x2 + (-b / (2 * a)));
  }
  return sampleRate / maxpos;
}

function freqToMidi(freq) { return 69 + 12 * Math.log2(freq / 440); }

function midiToPitchClass(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[((Math.round(midi) % 12) + 12) % 12];
}

function midiToOctave(midi) { return Math.floor(Math.round(midi) / 12) - 1; }

function freqToYNorm(freq) {
  const fMin = 80, fMax = 1200;
  const f = Math.max(fMin, Math.min(fMax, freq));
  const t = (Math.log(f) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin));
  return 1 - t;
}

// ----------------------------------------------------
// DRAW FUNCTIONS
// ----------------------------------------------------

function draw() {
  background(0, 0, 100);
  if (isAnalyzing) drawLoadingOverlay();
  // Show grid if ANY layer has data — not just the active recording
  const hasAnything = layers.length > 0 || measures.length > 0;
  if (hasAnything) drawScrollableGrid();
}

function drawScrollableGrid() {
  // The composition = all finished layers + the currently-recording layer.
  // We find the maximum measure count across all sources to size the canvas.
  const allLayerMeasures = [...layers.map(l => l.measures), measures];
  const maxMeasures = Math.max(...allLayerMeasures.map(m => m.length), 0);

  if (maxMeasures === 0) return;

  const totalRows    = Math.ceil(maxMeasures / columns);
  const totalHeight  = totalRows * cellH;
  const neededHeight = max(windowHeight, totalHeight);
  if (height !== neededHeight) resizeCanvas(width, neededHeight);

  // Draw grid backgrounds + grid lines FIRST (one pass)
  for (let i = 0; i < maxMeasures; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x   = col * cellW;
    const y   = row * cellH;
    push();
    translate(x, y);
    fill(0, 0, 100);
    noStroke();
    rect(0, 0, cellW, cellW);
    stroke(0, 0, 88); strokeWeight(0.5);
    for (let b = 1; b <= 3; b++) line((cellW / 4) * b, 0, (cellW / 4) * b, cellW);
    stroke(0, 0, 92);
    line(0, cellW * 0.5, cellW, cellW * 0.5);
    noStroke();
    pop();
  }

  // Draw each layer on top — older (finished) layers first, then active layer
  for (const layer of layers) {
    for (let i = 0; i < layer.measures.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      drawMeasureNotes(layer.measures[i], col * cellW, row * cellH, cellW, false);
    }
  }

  // Active (currently-recording) layer — draw with playhead highlight
  for (let i = 0; i < measures.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const isCurrent = (i === currentMeasureIndex) && isPlaying;
    drawMeasureNotes(measures[i], col * cellW, row * cellH, cellW, isCurrent);
  }

  autoScrollToCurrentMeasure();
}

function autoScrollToCurrentMeasure() {
  if (!isPlaying || currentMeasureIndex < 0) return;
  const currentRow = Math.floor(currentMeasureIndex / columns);
  const targetY    = currentRow * cellH - windowHeight * 0.3;
  if (targetY > 0) window.scrollTo({ top: targetY, behavior: 'smooth' });
}

// Draws only the notes for a measure (no background or grid — handled separately).
// This lets multiple layers composite onto the same grid cell.
function drawMeasureNotes(measure, x, y, size, isCurrent = false) {
  push();
  translate(x, y);

  const isSynthMeasure = measure.category === 'synths';

  if (isSynthMeasure) {
    let synthNotes = [...measure.notes];
    if (synthNotes.length > 3) {
      synthNotes.sort((a, b) => (a.yPosition || 0.5) - (b.yPosition || 0.5));
      const lo  = synthNotes[0];
      const hi  = synthNotes[synthNotes.length - 1];
      const mid = synthNotes[Math.floor(synthNotes.length / 2)];
      synthNotes = [lo, mid, hi];
    }
    synthNotes.sort((a, b) => (b.yPosition || 0.5) - (a.yPosition || 0.5));
    for (let note of synthNotes) drawSynthBlock(note, size);
  } else {
    let notes = [...measure.notes];
    notes.sort((a, b) => (a.yPosition || 0.5) - (b.yPosition || 0.5));
    for (let i = 0; i < notes.length; i++) drawNote(notes[i], size, i, notes.length);
  }

  if (isCurrent) {
    noFill();
    stroke(0, 0, 70, 60);
    strokeWeight(2);
    rect(2, 2, size - 4, size - 4);
    noStroke();
  }

  pop();
}

// ============================================================
// COLOR RESOLUTION — called INSIDE draw loop
// ============================================================
// note.color is stored as a plain {h,s,b} object (safe to create outside draw).
// Here, inside draw(), we resolve it to an actual p5 color using the current
// HSB colorMode(360, 100, 100, 255).

function resolveNoteColor(note) {
  const c = note.color;
  if (!c) return color(0, 0, 60);
  if (typeof c === 'object' && 'h' in c) {
    return color(c.h, c.s, c.b);
  }
  // Fallback: already a p5 color (shouldn't happen, but safe)
  return c;
}

// ============================================================
// SYNTH BLOCK RENDERER
// ============================================================

function drawSynthBlock(note, size) {
  if (!note.color) return;

  // Lerp in RGB space — avoids HSB lerpColor sweeping through the hue wheel.
  // e.g. lerping purple→green in HSB goes through blue/cyan/teal = rainbow.
  // RGB lerp goes directly between the two colors with no hue detour.
  const cL_hsb = note.color;
  const cR_hsb = note.colorRight || { h: (cL_hsb.h + 20) % 360, s: cL_hsb.s, b: cL_hsb.b };

  const [r1, g1, b1] = hsbToRgb(cL_hsb.h, cL_hsb.s / 100, cL_hsb.b / 100);
  const [r2, g2, b2] = hsbToRgb(cR_hsb.h, cR_hsb.s / 100, cR_hsb.b / 100);

  const yCenter   = constrain((note.yPosition || 0.5) * size, size * 0.05, size * 0.95);
  const bandH     = (note.bandHeight || 0.08) * size;
  const halfBandH = bandH / 2;
  const yTop      = yCenter - halfBandH;
  const yBottom   = yCenter + halfBandH;

  noFill();
  strokeWeight(1);
  colorMode(RGB, 255);

  for (let x = 0; x <= size; x++) {
    const t = x / size;
    stroke(
      r1 + (r2 - r1) * t,
      g1 + (g2 - g1) * t,
      b1 + (b2 - b1) * t
    );
    line(x, yTop, x, yBottom);
  }

  colorMode(HSB, 360, 100, 100, 255);
  noStroke();
}

// ----------------------------------------------------
// NOTE DRAWING (non-synth instruments)
// ----------------------------------------------------

function drawNote(note, size, noteIndex, totalNotes) {
  const def = SHAPE_REGISTRY[note.instrument];
  if (!def) return;

  const x = map(note.slice + 0.5, 0, SUBDIVISIONS, size * 0.1, size * 0.9);

  let y;
  if (note.yPosition !== undefined) y = note.yPosition * size;
  else if (note.octave)             y = map(note.octave, 1, 8, size * 0.85, size * 0.15);
  else                              y = size * 0.5;
  y = constrain(y, size * 0.1, size * 0.9);

  // Resolve {h,s,b} → p5 color inside draw()
  const noteColor = resolveNoteColor(note);

  const baseSize = size * 0.10;
  let shapeSize  = baseSize;
  if (def.stringInstrument) shapeSize = note.plucked ? baseSize * 0.7 : baseSize;

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

function drawInstrumentShape(instrument, x, y, size, col) {
  const img = SHAPE_SVGS[instrument];
  if (img && img.width > 0 && img.height > 0) {
    push();
    imageMode(CENTER);
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
// note.color is stored as plain {h, s, b} — safe outside draw().
// It is resolved to a real p5 color() inside resolveNoteColor()
// which is called only from drawNote / drawSynthBlock (inside draw loop).
//
// THREE-LAYER PIPELINE:
//  1. User palette (scalePalette)  →  pitch → scale degree → curated HSB
//  2. Song key offset              →  rotates Scriabin circle to tonic = 0°
//  3. Scriabin + modal modifier    →  hue/sat/bri tuned per mode character
// ============================================================

const CIRCLE_OF_FIFTHS_ORDER = ['C','G','D','A','E','B','F#','C#','G#','D#','A#','F'];

const SCRIABIN_BASE_HUE = {
  'C':  0,   'G':  30,  'D':  60,  'A':  90,
  'E':  150, 'B':  195, 'F#': 225, 'C#': 255,
  'G#': 285, 'D#': 310, 'A#': 340, 'F':  355,
};

const ENHARMONIC = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };
function resolveEnharmonic(p) { return ENHARMONIC[p] || p; }

const MODAL_MODIFIERS = {
  ionian:    { h: +12, s: +15, b:  +8 },
  mixolydian:{ h:  +8, s: +12, b:  +5 },
  lydian:    { h: +18, s: +18, b: +12 },
  dorian:    { h:  -5, s:  +8, b:  +2 },
  aeolian:   { h: -12, s:  -5, b:  -5 },
  phrygian:  { h: -20, s: -10, b: -10 },
  locrian:   { h: -28, s: -20, b: -15 },
};

const BASE_SATURATION = 92;
const BASE_BRIGHTNESS = 85;

function octaveModifiers(octave) {
  const o = Math.min(8, Math.max(1, octave || 4));
  const t = (o - 1) / 7; // 0.0 at octave 1, 1.0 at octave 8
  return {
    satDelta: t * 20 - 12,
    brDelta:  t * 43 - 28,
  };
}

// Plain clamp + linear map — safe outside draw()
function clampVal(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const PERCUSSION_HUE = {
  kick: 5, bassdrum: 5, snare: 20, toms: 35,
  hihat: 50, crashsplash: 55, tambourine: 45, clap: 25,
};

// ── MAIN COLOR FUNCTION ───────────────────────────────────────────────────────
// Returns a plain {h,s,b} object. NEVER calls p5's color() here.
// Resolving to a p5 color happens inside draw() via resolveNoteColor().

function pitchToColorAdvanced(pitchClass, octave, instrument, options = {}) {

  // Percussion — warm fixed palette, no pitch involved
  const isPercussion = INSTRUMENTS_BY_CATEGORY.percussion.includes(instrument);
  if (isPercussion) {
    const h = PERCUSSION_HUE[instrument] ?? 20;
    const intensity = options.intensity ?? 0.5;
    const s = clampVal(55 + intensity * 45, 55, 100);
    const b = clampVal(40 + (octave || 4) * 7.8, 40, 95);
    return { h, s, b };
  }

  if (!pitchClass) return { h: 0, s: 0, b: 60 };

  const canonical = resolveEnharmonic(pitchClass);

  // ── Layer 1: User palette path ────────────────────────────────────────────
  if (scalePalette && scalePalette.length >= 7) {
    const entry = pitchToPaletteHSB(canonical, scalePalette);
    if (entry) {
      const { brDelta } = octaveModifiers(octave);
      return {
        h: entry.h,
        s: entry.s,
        b: clampVal(entry.b + brDelta * 0.5, 25, 100),
      };
    }
  }

  // ── Layer 2+3: Scriabin + modal fallback ──────────────────────────────────
  const baseHue = SCRIABIN_BASE_HUE[canonical];
  if (baseHue === undefined) return { h: 0, s: 0, b: 50 };

  let hueValue = (baseHue + songKeyHueOffset + 360) % 360;

  const { satDelta, brDelta } = octaveModifiers(octave);
  let sat = BASE_SATURATION + satDelta;
  let bri = BASE_BRIGHTNESS  + brDelta;

  const mod = MODAL_MODIFIERS[options.mode] || null;
  if (mod) {
    hueValue = (hueValue + mod.h + 360) % 360;
    sat = clampVal(sat + mod.s, 30, 100);
    bri = clampVal(bri + mod.b, 30, 100);
  }

  return { h: hueValue, s: sat, b: bri };
}

// ── SYNTH GRADIENT RIGHT-EDGE COLOR ──────────────────────────────────────────
// Returns the {h,s,b} for the right edge of a synth gradient band.
//
// When a user palette is active: finds this note's scale degree, then picks
// the *next* degree's color — so the gradient sweeps between two adjacent
// palette swatches. This is entirely within the palette family, no rainbow.
//
// When no palette: uses a modest +25° hue nudge (not +60°) so adjacent
// bands stay visually related rather than leaping across the spectrum.
//
// Safe to call outside draw() — no p5 color() call.

function getSynthGradientRight(pitchClass, octave, instrument, options = {}) {
  // Get the LEFT color first — right edge is a lightness/saturation variant of it,
  // NOT a different hue. This guarantees the gradient never sweeps across hues.
  // The visual effect is a soft light→dark or vivid→muted sheen, not a rainbow.
  const left = pitchToColorAdvanced(pitchClass, octave, instrument, options);

  if (scalePalette && scalePalette.length >= 7) {
    // With palette: right edge is the same hue, slightly lighter and less saturated
    // — creates a luminous highlight sheen while staying firmly in the palette color.
    return {
      h: left.h,
      s: clampVal(left.s - 18, 20, 100),
      b: clampVal(left.b + 14, 25, 100),
    };
  }

  // Without palette: same — just a brightness lift, no hue change
  return {
    h: left.h,
    s: clampVal(left.s - 15, 20, 100),
    b: clampVal(left.b + 18, 25, 100),
  };
}


// ============================================================
// CURATED LOCAL PALETTE SYSTEM
// ============================================================
//
// 7 modes × 7 scale degrees. Colors are {h,s,b} in HSB (360,100,100).
// Designed so degree I is the warmest/most grounded, and the overall
// palette character matches each mode's emotional quality.
// All palettes are KEY-AGNOSTIC — key transposition is applied via hue rotation.
//
// Palette design rationale:
//   Ionian    — warm gold/amber, analogic spread, open + resolved
//   Dorian    — teal/coral balance, bittersweet
//   Phrygian  — deep crimson/purple/olive, tense + dark (triadic contrast)
//   Lydian    — gold/sky/lavender, luminous + dreamy
//   Mixolydian— burnt orange/indigo, bluesy warmth with contrast
//   Aeolian   — steel blue/dusty rose, melancholic complement
//   Locrian   — muted/gray, desaturated + uncomfortable
// ============================================================

const MODE_PALETTES = {
  ionian: [
    { h: 38,  s: 85, b: 97 },
    { h: 60,  s: 75, b: 93 },
    { h: 82,  s: 70, b: 88 },
    { h: 18,  s: 80, b: 96 },
    { h: 5,   s: 82, b: 94 },
    { h: 48,  s: 72, b: 91 },
    { h: 95,  s: 65, b: 85 },
  ],
  dorian: [
    { h: 175, s: 68, b: 82 },
    { h: 158, s: 60, b: 78 },
    { h: 195, s: 72, b: 75 },
    { h: 10,  s: 70, b: 90 },
    { h: 165, s: 65, b: 80 },
    { h: 28,  s: 65, b: 88 },
    { h: 185, s: 75, b: 72 },
  ],
  phrygian: [
    { h: 345, s: 85, b: 72 },
    { h: 28,  s: 70, b: 78 },
    { h: 270, s: 60, b: 65 },
    { h: 355, s: 78, b: 68 },
    { h: 85,  s: 55, b: 62 },
    { h: 260, s: 65, b: 60 },
    { h: 15,  s: 72, b: 70 },
  ],
  lydian: [
    { h: 52,  s: 78, b: 99 },
    { h: 70,  s: 65, b: 96 },
    { h: 220, s: 55, b: 95 },
    { h: 35,  s: 82, b: 98 },
    { h: 200, s: 50, b: 97 },
    { h: 58,  s: 70, b: 94 },
    { h: 240, s: 45, b: 92 },
  ],
  mixolydian: [
    { h: 22,  s: 82, b: 90 },
    { h: 42,  s: 75, b: 88 },
    { h: 235, s: 60, b: 80 },
    { h: 12,  s: 78, b: 88 },
    { h: 248, s: 55, b: 78 },
    { h: 32,  s: 70, b: 86 },
    { h: 225, s: 58, b: 76 },
  ],
  aeolian: [
    { h: 210, s: 65, b: 72 },
    { h: 228, s: 55, b: 68 },
    { h: 340, s: 45, b: 78 },
    { h: 218, s: 60, b: 70 },
    { h: 200, s: 58, b: 75 },
    { h: 350, s: 40, b: 72 },
    { h: 232, s: 50, b: 65 },
  ],
  locrian: [
    { h: 280, s: 35, b: 52 },
    { h: 68,  s: 45, b: 58 },
    { h: 295, s: 30, b: 48 },
    { h: 78,  s: 40, b: 55 },
    { h: 310, s: 28, b: 44 },
    { h: 55,  s: 35, b: 52 },
    { h: 265, s: 32, b: 46 },
  ],
};

// How many hue degrees to rotate each key's palette so its tonic
// feels "correct" relative to the Scriabin circle.
const KEY_HUE_ROTATION = {
  'C':  0,   'G':  30,  'D':  60,  'A':  90,
  'E':  150, 'B':  195, 'F#': 225, 'C#': 255,
  'G#': 285, 'D#': 310, 'A#': 340, 'F':  355,
  'Db': 255, 'Eb': 310, 'Gb': 225, 'Ab': 285, 'Bb': 340,
};

// Build a key-transposed palette from local curated data.
// Returns array of 7 {h,s,b} objects with metadata attached.
function buildLocalPalette(rootKey, modeName) {
  const baseColors = MODE_PALETTES[modeName] || MODE_PALETTES.ionian;
  const rotation   = KEY_HUE_ROTATION[rootKey] ?? 0;

  const palette = baseColors.map(c => ({
    h: (c.h + rotation) % 360,
    s: c.s,
    b: c.b,
  }));

  palette._rootKey   = rootKey;
  palette._modeName  = modeName;
  palette._intervals = MODE_INTERVALS[modeName] || MODE_INTERVALS.ionian;

  return palette;
}

// Map a pitch class to its palette entry as {h,s,b}.
// Safe to call outside draw() — no p5 color() call.
function pitchToPaletteHSB(pitchClass, palette) {
  if (!palette || palette.length < 7) return null;

  const rootKey   = palette._rootKey   || 'C';
  const intervals = palette._intervals || MODE_INTERVALS.ionian;
  const rootSemi  = PITCH_TO_SEMITONE[rootKey] ?? 0;
  const pitchSemi = PITCH_TO_SEMITONE[resolveEnharmonic(pitchClass)];

  let degreeIndex = 0;

  if (pitchSemi !== undefined) {
    const dist = ((pitchSemi - rootSemi) + 12) % 12;
    let bestDeg = 0, bestGap = 12;
    for (let i = 0; i < intervals.length; i++) {
      const gap        = Math.abs(intervals[i] - dist);
      const wrappedGap = Math.min(gap, 12 - gap);
      if (wrappedGap < bestGap) { bestGap = wrappedGap; bestDeg = i; }
    }
    degreeIndex = bestDeg;
  }

  return palette[degreeIndex]; // {h, s, b}
}

// ── PALETTE APPLICATION — The Color API with variant seeds ───────────────────
//
// Each click of "Generate Palette" picks a DIFFERENT seed hue by offsetting
// the base Scriabin hue by a variant step. This gives genuinely different
// palettes for the same key+mode combination, not just the same colors.
//
// Variant seed offsets (degrees added to the Scriabin base hue):
//   variant 0 → base hue (canonical Scriabin)
//   variant 1 → +40°  (warm shift)
//   variant 2 → +80°  (brighter shift)
//   variant 3 → +160° (complementary shift)
//   variant 4 → +220° (cool shift)
//   repeats cyclically

const VARIANT_OFFSETS = [0, 40, 80, 160, 220];

// Color API scheme modes — match musical mode character
const MODE_TO_COLOR_SCHEME = {
  ionian:     'analogic',
  lydian:     'analogic',
  mixolydian: 'analogic-complement',
  dorian:     'analogic-complement',
  aeolian:    'complement',
  phrygian:   'triad',
  locrian:    'triad',
};

async function fetchColorAPIPalette(rootKey, modeName, swatchContainer, statusEl) {
  const scrabiHue  = SCRIABIN_BASE_HUE[rootKey] ?? 0;
  const mod        = MODAL_MODIFIERS[modeName] || { h: 0, s: 0, b: 0 };
  const variantOff = VARIANT_OFFSETS[paletteVariantIndex % VARIANT_OFFSETS.length];

  const seedHue = Math.round((scrabiHue + mod.h + variantOff + 360) % 360);
  const clamp   = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const seedSat = Math.round(clamp(62 + mod.s * 0.4, 40, 88));
  const seedLit = Math.round(clamp(52 + mod.b * 0.3, 30, 72));

  const scheme = MODE_TO_COLOR_SCHEME[modeName] || 'analogic';
  const url    = `https://www.thecolorapi.com/scheme?hsl=hsl(${seedHue},${seedSat}%,${seedLit}%)&mode=${scheme}&count=7&format=json`;

  if (statusEl) statusEl.textContent = `Fetching palette (variant ${paletteVariantIndex + 1})…`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const palette = data.colors.map(c => {
      // Convert API HSL to our HSB storage format
      const h   = c.hsl.h;
      const s   = Math.min(c.hsl.s, 88);
      const l   = Math.min(Math.max(c.hsl.l, 30), 75);
      const hsb = hslToHsb(h, s / 100, l / 100);
      return { h: hsb[0], s: hsb[1], b: hsb[2] };
    });

    palette._rootKey   = rootKey;
    palette._modeName  = modeName;
    palette._intervals = MODE_INTERVALS[modeName] || MODE_INTERVALS.ionian;

    scalePalette     = palette;
    userDefinedKey   = rootKey;
    userDefinedMode  = modeName;
    songKeyHueOffset = -scrabiHue;

    // Advance variant for next click
    paletteVariantIndex++;

    renderSwatches(palette, swatchContainer);
    if (statusEl) statusEl.textContent = `Palette: ${rootKey} ${modeName} — click again for a new variant`;
    console.log(`Color API palette loaded: ${rootKey} ${modeName} variant ${paletteVariantIndex} (${scheme}, seed hue ${seedHue}°)`);

  } catch (err) {
    console.warn('Color API unavailable, using local palette:', err.message);
    applyLocalPalette(rootKey, modeName, swatchContainer, statusEl);
  }
}

// Local palette fallback — used when Color API is unreachable
function applyLocalPalette(rootKey, modeName, swatchContainer, statusEl) {
  const palette = buildLocalPalette(rootKey, modeName);
  scalePalette           = palette;
  userDefinedKey         = rootKey;
  userDefinedMode        = modeName;
  songKeyHueOffset       = -(SCRIABIN_BASE_HUE[rootKey] ?? 0);
  paletteVariantIndex++;
  renderSwatches(palette, swatchContainer);
  if (statusEl) statusEl.textContent = `Palette: ${rootKey} ${modeName} (local)`;
}

// HSL (h:0-360, s:0-1, l:0-1) → [h, s%, b%] in HSB (0-360, 0-100, 0-100)
function hslToHsb(h, s, l) {
  const b   = l + s * Math.min(l, 1 - l);
  const sb  = b === 0 ? 0 : 2 * (1 - l / b);
  return [Math.round(h), Math.round(sb * 100), Math.round(b * 100)];
}

// Render swatches — {h,s,b} converted to RGB for CSS display
function renderSwatches(palette, container) {
  if (!container) return;
  container.innerHTML = '';
  const DEGREE_NAMES = ['I','II','III','IV','V','VI','VII'];
  palette.slice(0, 7).forEach((col, i) => {
    const rgb    = hsbToRgb(col.h, col.s / 100, col.b / 100);
    const swatch = document.createElement('div');
    swatch.className   = 'palette-swatch';
    swatch.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    swatch.style.width  = '28px';
    swatch.style.height = '28px';
    swatch.style.borderRadius = '4px';
    swatch.style.display = 'inline-block';
    swatch.style.margin  = '2px';
    swatch.title = DEGREE_NAMES[i] || i;
    container.appendChild(swatch);
  });
}

// Build fallback palette — now just delegates to buildLocalPalette
function buildFallbackPalette(rootKey, modeName) {
  return buildLocalPalette(rootKey, modeName);
}


// ============================================================
// SCALE / MODE SYSTEM
// ============================================================

const MODE_INTERVALS = {
  ionian:    [0, 2, 4, 5, 7, 9, 11],
  dorian:    [0, 2, 3, 5, 7, 9, 10],
  phrygian:  [0, 1, 3, 5, 7, 8, 10],
  lydian:    [0, 2, 4, 6, 7, 9, 11],
  mixolydian:[0, 2, 4, 5, 7, 9, 10],
  aeolian:   [0, 2, 3, 5, 7, 8, 10],
  locrian:   [0, 1, 3, 5, 6, 8, 10],
};

const SEMITONE_TO_PITCH = [
  'C','C#','D','D#','E','F','F#','G','G#','A','A#','B'
];

const PITCH_TO_SEMITONE = {
  'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
  'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11,
  'Db':1,'Eb':3,'Gb':6,'Ab':8,'Bb':10
};

const MODAL_TEMPLATES = {
  ionian:    [1,0,1,0,1,1,0,1,0,1,0,1],
  dorian:    [1,0,1,1,0,1,0,1,0,1,1,0],
  phrygian:  [1,1,0,1,0,1,0,1,1,0,1,0],
  lydian:    [1,0,1,0,1,0,1,1,0,1,0,1],
  mixolydian:[1,0,1,0,1,1,0,1,0,1,1,0],
  aeolian:   [1,0,1,1,0,1,0,1,1,0,1,0],
  locrian:   [1,1,0,1,0,1,1,0,1,0,1,0],
};

function detectMode(pitchClasses) {
  if (!pitchClasses || pitchClasses.length < 3) return null;

  const freq = {};
  for (const p of pitchClasses) freq[p] = (freq[p] || 0) + 1;
  const tonic     = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
  const tonicSemi = PITCH_TO_SEMITONE[tonic] ?? 0;

  const present = new Array(12).fill(0);
  for (const p of pitchClasses) {
    const semi = PITCH_TO_SEMITONE[p];
    if (semi !== undefined) present[((semi - tonicSemi) + 12) % 12] = 1;
  }

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


// ============================================================
// COLOR SPACE UTILITIES (plain JS — no p5, safe anywhere)
// ============================================================

// HSL (h:0-360, s:0-1, l:0-1) → [r,g,b] 0-255
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// HSB (h:0-360, s:0-1, b:0-1) → [r,g,b] 0-255
function hsbToRgb(h, s, b) {
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
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