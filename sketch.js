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

// ── MEASURE FIX 1 ──────────────────────────────────────────────────────────
// beatsPerMeasure is 4 (one measure = 4 counts, as a dancer counts it).
// measureDuration is initialised HERE using the default BPM so it is never
// stuck at a stale 2s default when the user hasn't touched the BPM field yet.
let beatsPerMeasure = 4;
let BPM = 120;
let measureDuration = (60 / BPM) * beatsPerMeasure;  // 2.0s at 120 BPM default
// ──────────────────────────────────────────────────────────────────────────

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

// BPM guard — prevents setupAudioPlayback() from overwriting user's BPM
let userHasSetBPM = false;

// ── BEAT CLOCK ─────────────────────────────────────────────────────────────
// Drift-corrected setTimeout clock (Digikid13 pattern).
// getAccurateBeatTime() returns TOTAL seconds of play-time, correctly
// accounting for any pauses — so measure boundaries never drift.
let beatClockStart    = null;  // performance.now() when this play segment began
let beatClockTime     = 0;     // cumulative expected ms within this segment
let beatClockStep     = 0;     // ms per beat
let beatClockTimer    = null;  // cancelable handle

// ── MEASURE FIX 2 ──────────────────────────────────────────────────────────
// When paused and resumed, we must NOT restart the clock from 0.
// Instead we accumulate how many seconds of play-time already passed
// and add that offset inside getAccurateBeatTime().
let beatClockPlayedSeconds = 0;  // total seconds played before the current segment
// ──────────────────────────────────────────────────────────────────────────

function startBeatClock() {
  stopBeatClock();
  beatClockStep  = 60000 / BPM;
  beatClockStart = performance.now();
  beatClockTime  = 0;

  function tick() {
    if (!isPlaying) return;
    beatClockTime += beatClockStep;
    const drift = (performance.now() - beatClockStart) - beatClockTime;
    beatClockTimer = setTimeout(tick, Math.max(0, beatClockStep - drift));
  }
  beatClockTimer = setTimeout(tick, beatClockStep);
}

function stopBeatClock() {
  if (beatClockTimer !== null) { clearTimeout(beatClockTimer); beatClockTimer = null; }

  // ── MEASURE FIX 3 ────────────────────────────────────────────────────────
  // When we stop (pause or reset), bank how many seconds we've played
  // so the next startBeatClock() segment continues from the right position.
  if (beatClockStart !== null) {
    beatClockPlayedSeconds += (performance.now() - beatClockStart) / 1000;
    beatClockStart = null;
  }
  // ────────────────────────────────────────────────────────────────────────
}

function getAccurateBeatTime() {
  // Total play-time = seconds banked from previous segments
  //                 + seconds elapsed in the current segment (if playing)
  const currentSegmentSeconds = beatClockStart !== null
    ? (performance.now() - beatClockStart) / 1000
    : 0;
  return beatClockPlayedSeconds + currentSegmentSeconds;
}
// ──────────────────────────────────────────────────────────────────────────

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
    // Keys
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
    
    // Percussion
    kick: { percussion: true, category: 'percussion' },
    bassdrum: { percussion: true, category: 'percussion' },
    snare: { percussion: true, category: 'percussion' },
    toms: { percussion: true, category: 'percussion' },
    hihat: { percussion: true, category: 'percussion' },
    crashsplash: { percussion: true, category: 'percussion' },
    tambourine: { percussion: true, category: 'percussion' },
    clap: { percussion: true, category: 'percussion' },
    
    // Wind
    flute: { elongated: true, category: 'wind' },
    piccolo: { elongated: true, category: 'wind' },
    recorder: { elongated: true, category: 'wind' },
    whistle: { elongated: true, category: 'wind' },
    clarinet: { elongated: true, category: 'wind' },
    oboe: { elongated: true, category: 'wind' },
    bassoon: { elongated: true, category: 'wind' },
    trumpet: { elongated: true, category: 'wind' },
    
    // Strings
    acousticguitar: { elongated: true, stringInstrument: true, category: 'strings' },
    electricguitar: { elongated: true, stringInstrument: true, category: 'strings' },
    bass: { elongated: true, stringInstrument: true, category: 'strings' },
    electricbass: { elongated: true, stringInstrument: true, category: 'strings' },
    violin: { elongated: true, stringInstrument: true, category: 'strings' },
    viola: { elongated: true, stringInstrument: true, category: 'strings' },
    cello: { elongated: true, stringInstrument: true, category: 'strings' },
    
    // Synths
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
  colorMode(HSB, 360, 100, 100, 100);
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
        // ── MEASURE FIX 4 ──────────────────────────────────────────────────
        // Always recalculate measureDuration as: (60 / BPM) * beatsPerMeasure
        // This is the exact duration in seconds of one 4-count measure.
        // e.g. 104 BPM → 60/104 × 4 = 2.3077s per measure
        measureDuration = (60 / BPM) * beatsPerMeasure;
        // ────────────────────────────────────────────────────────────────────
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
        if (isPlaying && features) processAudioFeatures(features);
      }
    });

    meydaAnalyzer.start();
    startTime = audioContext.currentTime;

    // ── MEASURE FIX 5 ────────────────────────────────────────────────────
    // Reset the banked play-time on a fresh analyze (not on resume)
    beatClockPlayedSeconds = 0;
    // ────────────────────────────────────────────────────────────────────

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
// CATEGORY-SPECIFIC PROCESSING
// ----------------------------------------------------

function processAudioFeatures(features) {
  if (!isPlaying || !features) return;

  const currentTime   = getAccurateBeatTime();
  const measureIndex  = Math.floor(currentTime / measureDuration);
  const timeInMeasure = currentTime % measureDuration;
  const sliceIndex    = constrain(
    Math.floor(map(timeInMeasure, 0, measureDuration, 0, SUBDIVISIONS)),
    0, SUBDIVISIONS - 1
  );

  if (!measureBuffers[measureIndex]) {
    measureBuffers[measureIndex] = [];
    for (let i = 0; i < SUBDIVISIONS; i++) {
      measureBuffers[measureIndex][i] = {
        rms: [], centroid: [], chroma: [],
        rolloff: [], zcr: [], perceptualSharpness: [], flux: []
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

    const avgRMS      = average(slice.rms);
    const avgCentroid = average(slice.centroid);
    const avgRolloff  = average(slice.rolloff);
    const avgZCR      = average(slice.zcr);
    const avgFlux     = average(slice.flux);
    const avgSharpness= average(slice.perceptualSharpness);

    switch (currentCategory) {
      case 'keys':
        processKeysCategory(notes, s, avgRMS, avgCentroid, avgFlux, slice.chroma);
        break;
      case 'percussion':
        processPercussionCategory(notes, s, avgRMS, avgZCR, avgFlux, avgRolloff);
        break;
      case 'wind':
        processWindCategory(notes, s, avgRMS, avgCentroid, avgFlux, slice.chroma);
        break;
      case 'strings':
        processStringsCategory(notes, s, avgRMS, avgCentroid, avgFlux, avgZCR, slice.chroma);
        break;
      case 'synths':
        processSynthsCategory(notes, s, avgRMS, avgCentroid, avgSharpness, avgFlux, slice.chroma);
        break;
    }
  }

  measures.push({ notes: notes, measureNumber: measureIndex + 1, category: currentCategory });
}

// ----------------------------------------------------
// CATEGORY PROCESSING
// ----------------------------------------------------

function processKeysCategory(notes, sliceIndex, rms, centroid, flux, chromaArray) {
  if (!chromaArray || chromaArray.length === 0) return;
  const chromaAvg = averageChroma(chromaArray);
  
  // Determine more specific keyboard instrument based on frequency
  let instrument = 'piano';
  if (centroid < 400) {
    instrument = 'electricorgan';
  } else if (centroid > 2000) {
    instrument = 'xylophone';
  }
  
  for (let i = 0; i < 12; i++) {
    if (chromaAvg[i] > 0.25) {
      notes.push({
        instrument: mapInstrumentName(instrument, 'keys'), // ← ADD THIS
        pitchClass: indexToPitch(i),
        octave: mapToOctave(centroid),
        yPosition: map(i, 0, 11, 0.85, 0.15),
        slice: sliceIndex,
        isSustained: rms > 0.01 && flux < 0.05,
        confidence: chromaAvg[i]
      });
    }
  }
}

function processPercussionCategory(notes, sliceIndex, rms, zcr, flux, rolloff) {
  if (rms < 0.02) return;
  
  let instrument = 'percussion';
  let yPos = 0.5;
  
  if (zcr > 0.15 && flux > 8) {
    instrument = 'snare';
    yPos = 0.6;
  } else if (rms > 0.08 && centroid < 200) { // Need to pass centroid!
    instrument = 'bassdrum';  // Changed from 'kick'
    yPos = 0.9;
  } else if (zcr > 0.1 && flux > 5) {
    instrument = 'hihat';
    yPos = 0.4;
  } else if (zcr > 0.2) {
    instrument = 'tambourine';
    yPos = 0.3;
  }
  
  notes.push({
    instrument: mapInstrumentName(instrument, 'percussion'), // ← ADD THIS
    yPosition: yPos,
    slice: sliceIndex,
    intensity: rms
  });
}

function processStringsCategory(notes, sliceIndex, rms, centroid, flux, zcr, chromaArray) {
  if (rms < 0.008) return;
  const chromaAvg = averageChroma(chromaArray);
  const pitch = dominantPitch(chromaAvg);
  
  let instrument = 'violin';
  let yPos;
  
  if (centroid < 400) {
    instrument = 'electricbass';  // or 'bass' for acoustic
    yPos = 0.85;
  } else if (centroid < 800) {
    instrument = 'cello';
    yPos = 0.65;
  } else {
    // Detect if electric or acoustic guitar
    instrument = zcr > 0.15 ? 'electricguitar' : 'acousticguitar';
    yPos = map(centroid, 800, 3000, 0.45, 0.2, true);
  }
  
  notes.push({
    instrument: mapInstrumentName(instrument, 'strings'), // ← ADD THIS
    pitchClass: pitch,
    octave: mapToOctave(centroid),
    yPosition: yPos,
    slice: sliceIndex,
    isSustained: flux < 0.02,
    plucked: zcr > 0.12
  });
}

function processStringsCategory(notes, sliceIndex, rms, centroid, flux, zcr, chromaArray) {
  if (rms < 0.008) return;
  const chromaAvg  = averageChroma(chromaArray);
  const pitch      = dominantPitch(chromaAvg);
  let instrument   = 'violin', yPos;
  if (centroid < 400)      { instrument = 'bass';   yPos = 0.85; }
  else if (centroid < 800) { instrument = 'cello';  yPos = 0.65; }
  else                     { instrument = 'violin'; yPos = map(centroid, 800, 3000, 0.45, 0.2, true); }
  notes.push({
    instrument, pitchClass: pitch, octave: mapToOctave(centroid),
    yPosition: yPos, slice: sliceIndex,
    isSustained: flux < 0.02, plucked: zcr > 0.12
  });
}

function processSynthsCategory(notes, sliceIndex, rms, centroid, sharpness, flux, chromaArray) {
  if (rms < 0.005) return;
  const chromaAvg = averageChroma(chromaArray);
  const pitch     = dominantPitch(chromaAvg);
  const synthType = sharpness > 2.5 ? 'lead' : centroid < 400 ? 'bass_synth' : flux < 0.01 ? 'pad' : 'synth';
  notes.push({
    instrument: synthType, pitchClass: pitch, octave: mapToOctave(centroid),
    yPosition: map(centroid, 200, 4000, 0.85, 0.15, true),
    slice: sliceIndex, isSustained: flux < 0.02, intensity: sharpness || 1
  });
}

// ----------------------------------------------------
// INSTRUMENT NAME MAPPING
// ----------------------------------------------------

function mapInstrumentName(detectedInstrument, category) {
  // Map generic names to your specific JSON instrument names
  const instrumentMap = {
    // Keys
    'piano': 'piano',
    'organ': 'electricorgan', // or 'organ' if you prefer
    'harpsichord': 'keyboard', // fallback
    'accordion': 'melodica', // fallback
    
    // Percussion
    'kick': 'bassdrum',
    'snare': 'snare',
    'hihat': 'hihat',
    'tom': 'toms',
    'cymbal': 'crashsplash',
    'percussion': 'tambourine',
    
    // Wind
    'flute': 'flute',
    'trumpet': 'trumpet',
    'saxophone': 'clarinet', // fallback, or add saxophone to JSON
    'clarinet': 'clarinet',
    'oboe': 'oboe',
    'horn': 'trumpet', // fallback
    
    // Strings
    'violin': 'violin',
    'cello': 'cello',
    'bass': 'electricbass', // or 'bass' if you want acoustic
    'guitar': 'acousticguitar',
    'viola': 'viola',
    'harp': 'acousticguitar', // fallback
    
    // Synths (keep as is)
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
    stopBeatClock();  // banks elapsed seconds before pausing
    isPlaying = false;
    if (statusDiv)   statusDiv.textContent = 'Paused';
    if (pauseButton) pauseButton.textContent = 'Resume';
  } else {
    audioContext.resume();
    startBeatClock(); // continues from banked position
    isPlaying = true;
    if (statusDiv)   statusDiv.textContent = `Transcribing ${getCategoryName(currentCategory)} at ${BPM} BPM`;
    if (pauseButton) pauseButton.textContent = 'Pause';
  }
}

function resetComposition() {
  measures = [];
  measureBuffers      = [];
  currentMeasureIndex = 0;

  stopBeatClock();
  beatClockPlayedSeconds = 0;  // fully reset banked time on reset
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

  // ── MEASURE FIX 6 ────────────────────────────────────────────────────────
  // Draw 4 vertical beat lines (dividing the square into beats 1-2-3-4)
  // so the grid visually reflects "4 counts per measure" like a dancer counts
  stroke(0, 0, 88);
  strokeWeight(0.5);
  for (let i = 1; i <= 3; i++) {
    const lineX = (size / 4) * i;
    line(lineX, 0, lineX, size);          // vertical beat markers
  }
  // Horizontal midline for pitch reference
  stroke(0, 0, 92);
  line(0, size * 0.5, size, size * 0.5);
  noStroke();
  // ────────────────────────────────────────────────────────────────────────

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
  if (note.yPosition !== undefined)  y = note.yPosition * size;
  else if (note.octave)              y = map(note.octave, 1, 8, size * 0.85, size * 0.15);
  else                               y = size * 0.5;
  y = constrain(y, size * 0.1, size * 0.9);

  let noteColor = note.pitchClass ? pitchToColor(note.pitchClass, note.octave) : color(210, 30, 60);

  const baseSize  = size * 0.10;
  let shapeSize   = baseSize;
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

function drawInstrumentShape(instrument, x, y, size, color) {
  const img = SHAPE_SVGS[instrument];
  if (img && img.width > 0 && img.height > 0) {
    push(); tint(color); imageMode(CENTER); image(img, x, y, size, size); pop();
  } else {
    push();
    noStroke();
    fill(color);
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
      stroke(color); strokeWeight(size * 0.08);
      line(x - size/2, y - size/2, x + size/2, y + size/2);
      line(x + size/2, y - size/2, x - size/2, y + size/2);
      noStroke();
    } else if (instrument.includes('hihat') || instrument.includes('cymbal')) {
      stroke(color); strokeWeight(1);
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

function drawSynthShape(x, y, size, color) {
  push();
  let h = hue(color), s = saturation(color), b = brightness(color);
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

// ----------------------------------------------------
// COLOUR
// ----------------------------------------------------

function pitchToColor(pitchClass, octave) {
  if (!pitchClass) return color(200, 20, 70);
  const PITCH_TO_HUE = {
    "C": 0, "C#": 30, "D": 60, "D#": 90, "E": 120, "F": 150,
    "F#": 180, "G": 210, "G#": 240, "A": 270, "A#": 300, "B": 330
  };
  return color(PITCH_TO_HUE[pitchClass] || 0, 70, octave ? map(octave, 1, 8, 50, 95) : 70);
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