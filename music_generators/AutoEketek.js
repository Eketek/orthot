import { on, next, time } from '../libek/nextevent.js'
import { initSynth, Synth, updateSynth } from '../libek/synth.js'
import { deepcopy } from '../libek/util.js'
import { setCommonScale } from '../libek/sfx.js'

export { AutoEketek }

/*
  AutoEketek is a fairly simple algorithmic Composer, derived in large part from lessons learned transcribing works of J. S. Bach.
    (plus a few bits of blatant rule-trampling)
  
  Loosely speaking, it generates a set or random phrases, plays them repeatedly, in a variety of distinct "voices", with randomly selected variations.
  Each phrase is a random pattern of notes.
  Variations applied to phrases are: shuffle note order, reverse note order, and inversion [within voice range]
  Each voice uses its own randomly generated rhythm.
  Each voice is sounded with a randomly parameterized synthesized instrument.
  
  To stay reasonably harmonious, the Musical scale is confined to a Pentatonic scale with a Pythagorean tuning.
*/
let AutoEketek = function(audio_destNode) {
  
  let RNG = Math.random
  
  let gcd = function(a,b) {
    while (b != 0) {
      let tmp = b
      b = a%b
      a = tmp
    }
    return a
  }
  
  let applySeed = function(s) {
    if (typeof(s) != "string") {
      s = "" + s
    }
    let tmp
    let state = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]
    let v = 15
    for (let i = 0; i < s.length; i++) {
      if ( (i%4) == 0) {
        state.push(v)
        v = 0
      }
      v = (v<<8)|(s.charCodeAt(i)&0xff)
    }
    state.push(v)
    let l = state.length
    
    let f = 11
    while ( (gcd(f,l)!=1) ) {
      f += 2
    }
    let fA = f
    f += 2
    
    while ( (gcd(f,l)!=1) || (gcd(f,fA)!=1) ) {
      f += 2
    }
    let fB = f
    f += 2
    
    while ( (gcd(f,l)!=1) || (gcd(f,fA)!=1) || (gcd(f,fB)!=1) ) {
      f += 2
    }
    let fC = f
    
    let a = 0
    let b = 0
    let c = 0
    let d = 0
    
    RNG = function() {
      state[d] = ((state[d] + a + b + c)*16777619) % 4294967296
      a = (a+fA)%l
      b = (b+fB)%l
      c = (c+fC)%l
      d = (d+state[a]+state[b]+state[c])%l
      return state[d]/4294967296
    }
    
    for (let i =0; i < l; i++) {
      RNG()
    }
  }
  
  let rand = function(curve) {
    if (curve) {
      if (curve > 0) {
        return RNG()**curve
      }
      else {
        return RNG()**(1/(-curve))
      }
    }
    else {
      return RNG()
    }
  }
  let rand_float = function(max=1, curve=0) {
    if (typeof(max) == "object") {
      curve = max.curve
      max = max.max
    }
    return rand(curve)*max
  }
  let randRange_float = function(min, max, curve) {
    if (typeof(min) == "object") {
      max = min.max
      curve = min.curve
      min = min.min
    }
    return rand(curve)*(max-min) + min
  }
  let rand_int = function(max, curve) {
    if (typeof(max) == "object") {
      curve = max.curve
      max = max.max
    }
    return Math.floor(rand_float(max+1, curve))
  }
  let randRange_int = function(min, max, curve) {
    if (typeof(min) == "object") {
      max = min.max
      curve = min.curve
      min = min.min
    }
    return Math.floor(randRange_float(min, max+1, curve))
  }
  
  let chance = function(n) {
    return rand() < n
  }
  
  let randSelect = function(arr, curve) {
    if (Array.isArray(arr)) {
      return arr[rand_int(arr.length-1, curve)]
    }
    else {
      let ch_total = 0
      for (let k in arr) {
        let obj = arr[k]
        obj._chance = ch_total + obj.chance
        ch_total += obj.chance
      }
      let sel = rand_float(ch_total, curve)
      for (let k in arr) {
        let obj = arr[k]
        if (obj._chance >= sel) {
          return obj
        }
      }
    }
  }
  let randRangeSelect = function(arr, min, max, curve) {
    return arr[randRange_int(min, max, curve)]
  }
  
  // Synth programs
  // These get manipulated as part of synthesizer configuration to increase the amount of variety in the output
  let defs = {
    sine_additive:`
      iFreq = p4
      iAtkpow = p5
      iAtklen = 0.05
      iDecpow = 0.2
      iSuspow = 0.05
      iDeclen = 0.4
      iSuslen = p3-iAtklen-iDeclen
      iRellen = 0.1
      iLeft = 1
      iRight = 1

      aEnv linsegr 0, iAtklen, iAtkpow, iDeclen, iDecpow, iSuslen, iSuspow, iRellen, 0

      aValue = 0
      startArrayedOP:
        iPMag = 1
        iPFreqMul = 1
        aValue = aValue + poscil( iPMag, iPFreqMul*iFreq)
      endArrayedOP:
      
      aOut = aValue * aEnv
      out aOut*iLeft, aOut*iRight`,
    vco_additive:`
      iFreq = p4
      iAtkpow = p5
      iAtklen = 0.05
      iDecpow = 0.2
      iSuspow = 0.05
      iDeclen = 0.4
      iSuslen = p3-iAtklen-iDeclen
      iRellen = 0.1
      iCutoff = 5000
      iRes = 0.1
      iLeft = 1
      iRight = 1

      aEnv linsegr 0, iAtklen, iAtkpow, iDeclen, iDecpow, iSuslen, iSuspow, iRellen, 0

      aValue = 0
      startArrayedOP:
        iPMag = 1
        iPFreqMul = 1
        iWaveType = 1
        iDcycle = 1
        aValue = aValue + vco( iPMag, iPFreqMul*iFreq, iWaveType, iDcycle, 1 )
      endArrayedOP:
      
      aValue = moogladder(aValue, iCutoff, iRes)
           
      aOut = aValue * aEnv
      out aOut*iLeft, aOut*iRight`
  }
  let synthPRG = `
    <CsoundSynthesizer>
      <CsOptions>
        -o dac
      </CsOptions>
      <CsInstruments>

        sr = 44100
        ksmps = 32
        nchnls = 2
        0dbfs = 1

        giSine ftgen 1, 0, 65536, 10, 1

      </CsInstruments>
    </CsoundSynthesizer>
  `
  
  let voices
  let voiceArr = []
  
  // utility function to convert a note into a csound input 
  let defaultTransform = function(voice, note) {
    return `${voice.instrID} ${note.time} ${note.dur} ${note.freq} ${note.pow}`
  }
  
  let instruments
  
  // Generate a randomly parameterized synth subroutine for each instrument
  let randomizeInstruments = function(magnitudes) {
    instruments = []
    let amount = magnitudes.length
    for (let i = 0; i < amount; i++) {
      let vMag = magnitudes[i]
      let useSineSynth = chance(0.25)
      let numPartials = 1
      let partialMagnitude = 1
      if (chance(0.75)) {
        //numPartials = Math.floor(Math.random()*4+2)
        numPartials = randRange_int(2,6)
        partialMagnitude = 1/numPartials
      }
      let pMag = [vMag*0.6]
      let pFMul = [1]
      //let waveTypes = [Math.floor(Math.random()*3+1)]
      let waveTypes = [randRange_int(1,4)]
      let dcycleParams = [rand_float()]
      let tMag = 0
      for (let i = 1; i < numPartials; i++) {
        //let mag = 1*(Math.random()*partialMagnitude*(numPartials-i)/numPartials)**2
        let mag = vMag * 0.6 * rand_float(partialMagnitude*(numPartials-i)/numPartials, 2)
        tMag += mag
        pMag.push(mag)
        if (chance(0.1)) {
          pFMul.push(i+1+rand_float(0.05))
        }
        else {
          pFMul.push(i+1)
        }
        waveTypes.push(randRange_int(1,4))
        dcycleParams.push(randRange_float(0.1, 0.9))
      }
      let mScale = (randRange_float(0.25, 0.75)) / (tMag * numPartials)
      for (let i = 1; i < numPartials; i++) {
        pMag[i] *= mScale
      }
      if (!useSineSynth) {
        for (let i = 0; i < numPartials; i++) {
          pMag[i] *= 0.5
        }
      }
      let pan = i==0 ? 0.5 : randRange_float(0.1, 0.9)
      instruments.push({
        def:useSineSynth ? "sine_additive" : "vco_additive",
        iAtklen:randRange_float(0.025, 0.075),
        iDecpow:randRange_float(0.05, 0.15),
        iDeclen:randRange_float(0.025, 0.075),
        iSuspow:randRange_float(0.05, 0.1),
        iRellen:randRange_float(0.05, 0.15),
        iCutoff:randRange_float(1500, 7500, 2),
        iRes:rand_float(0.15),
        iPMag:pMag,
        iPFreqMul:pFMul,
        iWaveType:waveTypes,
        iDcycle:dcycleParams,
        iLeft:pan,
        iRight:1-pan
      })
    }
  }
  
  let addVoice = function() {
    let vID = "i" + (voiceArr.length+1)
    voices[vID] = {
      instrID:vID,
      transform:defaultTransform,
      notes:[]
    }
    voiceArr.push(voices[vID])
  }
  
  let reset = function() {
    //randomizeInstruments()
    voices = {}
    voiceArr = []
  }
  reset()
  
  let note = function(time, dur, noteval, pow, target) {
    if (!target) {
      target = voices.i1
    }
    target.notes.push( {time:time, dur:dur, freq:fundamental*scale[noteval], pow:pow} )
  }
  
  let toScore = function() {
    let score = []
    for (let name in voices) {
      let voice = voices[name]
      for (let note of voice.notes) {
        score.push(voice.transform(voice, note))
      }
    }
    return score.join('\n')
  }
  
  let scale
  let fundamental
  
  let shuffle = function(arr) {
    for (let k = arr.length-1; k >= 0; k--) {
      let l = randRange_int(0,k)
      let tmp = arr[k]
      arr[k] = arr[l]
      arr[l] = tmp
    }
  }
  
  var defaultSpec = {
    PhraseLength:{ min:16, max:48, curve:2 },    // Number of notes per phrase
    PhraseStructurePoints:{ min:2, max:5 },      // number of randomly selected phrase-structure target points
    PhraseStructureExPtsPerNote:{ min:0.1, max:0.25},        // Additional phrase-structure points to add for each note in the phrase
    PhraseStructureWeight:{ min:0, max:0.85, curve:1.5 },    // chance of biasing value of next note in phrase toward the current phrase structure value
    PhraseStructureBias:{ min:1, max:3 },        // amount of possible note values to exclude from the other direction when moving toward stucture value
    Octaves:3,
    TargetSongLen: { min:210, max:300 },
    Complexity:[
      { 
        chance:0.1,             
        RestMaxBeats:1,                 // Maximum length of rest (in beats)
        Chance_RandlengthNote:0.25,     // Chance that a note will be longer than 1 beat
        RhythmicComplexity:1,           // Maximum note length (in beats)
        Tempo:{ min:150, max:450 },
      },
      {
        chance:0.3,
        RestMaxBeats:1,
        Chance_RandlengthNote:0.25,
        RhythmicComplexity:2,
        Tempo:{ min:175, max:500 },
      },
      {
        chance:0.3,
        RestMaxBeats:1,
        Chance_RandlengthNote:0.25,
        RhythmicComplexity:3,
        Tempo:{ min:200, max:500 },
      },
      {
        chance:0.3,
        RestMaxBeats:2,
        Chance_RandlengthNote:0.25,
        RhythmicComplexity:4,
        Tempo:{ min:225, max:400 },
      }
    ],
    PartLength:{ min:3, max:9 },
    NumOffsetPositions:{ min:2, max:16 },
    NumOffsets:{ min:1, max:16 },
    Modifiers:[
        //  5%:      shuffle          (random re-arrangement of pitch values)
        //  48.45%:  no change        (theme is played exactly as defined)
        //  32.3%:   invert           (exchange high & low pitches [within the voice range] across the theme)
        //  8.55%:   reverse          (reverse the order in which the pitches are played
        //  5.7%:    reverse+invert   (combionation of reverse and invert)
      { chance:0.05, shuffle:true },
      { chance:48.45 },
      { chance:32.3, invert:true },
      { chance:8.55, reverse:true },
      { chance:5.7,  invert:true, reverse:true },
    ],
    TargetLeadvoicePitch:{ min:300, max:375 },    // Approximate frequency the lowest possible note the by the lead voice
    Sections:[
      {
        MinBase:0.8, 
        MaxBase:1,
        NumVoices:{ min:2, max:4 },
        MaxActive:{ min:1, max:2 },
        MinActive:{ min:1, max:1 },
        ExpoOrderPositive:1,
        ExpoSpacing:{ min:2, max:4 },
        ExpoLen:{ min:1, max:4 }
      },
      {
        MinBase:0.4,
        MaxBase:0.8,
        NumVoices:{ min:2, max:4 },
        MaxActive:{ min:1, max:3 },
        MinActive:{ min:1, max:2 },
        ExpoOrderPositive:0.75,
        ExpoSpacing:{ min:2, max:4 },
        ExpoLen:{ min:1, max:4 }
      },
      {
        MinBase:0,
        MaxBase:0.4,
        NumVoices:{ min:2, max:4 },
        MaxActive:{ min:1, max:2 },
        MinActive:{ min:1, max:1 },
        ExpoOrderPositive:0.5,
        ExpoSpacing:{ min:2, max:4 },
        ExpoLen:{ min:1, max:4 }
      }
    ],
    NoteReduction:{ min:0.1, max:0.75 },          // Amount of time [in beats] to subtract from each note (how "staccato" voices should sing)
    AtkpowGeneral:0.25,                           // Attack strength of notes in general (initial loudness)
    AtkpowFirst:0.45,                             // Attack strength of the first note in a phrase
    AtkpowMid:0.35,                               // Attack strength of various emphasized middle-notes (generally every 4th) (this
    Scale:[
      { 
        chance:0.875, 
        values:[64,72,81,96,108],
        denom:64,
        VoiceThemeRange: { min:6, max:9 },  // Range of each voice
        MaxThemeStep: { min:1, max:4 } ,    // max difference between two adjacent notes within a voice
        Themes:[
          {
            chance:0.5,
            range: { min:6, max:9 },
          },
          { 
            chance:0.25,
            range: { min:6, max:9 }
          },
          { 
            chance:0.25,
            range: { min:6, max:9 }
          }
        ],
      },
      { 
        chance:0.125, 
        values:[24,27,30,36,40],
        denom:32,
        VoiceThemeRange: { min:6, max:9 },  // Range of each voice
        MaxThemeStep: { min:1, max:4 } ,    // max difference between two adjacent notes within a voice
        Themes:[
          {
            chance:0.5,
            range: { min:6, max:9 },
          },
          { 
            chance:0.25,
            range: { min:6, max:9 }
          },
          { 
            chance:0.25,
            range: { min:6, max:9 }
          }
        ],
      }
    ]
  }
  
  this.spec = deepcopy(defaultSpec)
  
  this.play = function(spec, seed, debug=false) {
    debug |= window.AUTOEKETEK_DEBUG
    if (seed) {
      applySeed(seed)
    }
    else {
      RNG = Math.random
    }
    reset()
    
    if (debug) {
      if (seed) {
        console.log(`AUTO-EKETEK has dutifully located a copy of "${seed}"`)
      }
      else {
        console.log("AUTO-EKETEK is composing a song... Just for you!")
      }
    }
    
    if (!spec) {
      spec = defaultSpec
    }
    
    spec = deepcopy(spec)
    // On further analysis, what AutoEketek has is a Pentatonic scale with a Pythagorean tuning.  
    //      Which... is probably a best-practice without any other logic behind note selection.
    //  So might as well declare it explicitly.
    
    let scSpec = randSelect(spec.Scale)
    scale = setCommonScale(scSpec.values)
    fundamental = randRange_float(0.5, 1.5)/scSpec.denom
    
    // These strongly control the approaximate length and self-similarity of a "song"
    let phraseNotes = randRange_int(spec.PhraseLength)
    
    // Each voice gets a random insrtrument, and will sings in its own range
    //let numVoices = randRange_int(spec.Voices)
    let numVoices = 0
    
    let sections = []
    
    for (let section of spec.Sections) {
      let expo_positive = chance(section.ExpoOrderPositive)
      let expo_len = randRange_int(section.ExpoLen.min, section.ExpoLen.max)
      let nVoices = randRange_int(section.NumVoices.min, section.NumVoices.max)
      numVoices += nVoices
      let max_active = randRange_int(section.MaxActive.min, section.MaxActive.max)
      if (max_active > nVoices) {
        max_active = nVoices
      }
      let min_active = randRange_int(section.MinActive.min, section.MinActive.max)
      if (min_active > max_active) {
        min_active = max_active
      }
      let expo_spacing = randRange_int(section.ExpoSpacing.min, section.ExpoSpacing.max)
      if (expo_spacing > expo_len) {
        expo_spacing = expo_len
      }
      
      // Actual part coverage for each voice can/should not be detrermined until the number of phrases is determined
      sections.push({
        ExpoOrderPositive:chance(section.ExpoOrderPositive),
        ExpoLen:randRange_int(section.ExpoLen.min, section.ExpoLen.max),
        ExpoSpacing:expo_spacing,
        NumVoices:nVoices,
        MaxActive:max_active,
        MinActive:min_active
      })
    }
    
    //  Rhythmic complexity - maximum number of beats to hold a note
    //let rhythmicComplexity = Math.floor(Math.random()*4)+1
    let cmplxSpec = randSelect(spec.Complexity)
    
    //let rhythmicComplexity = randRange_int(1, 5)
    let rhythmicComplexity = cmplxSpec.RhythmicComplexity
    let restMaxbeats = cmplxSpec.RestMaxBeats
    let bpm = randRange_int(cmplxSpec.Tempo)
    let chance_RandlengthNote = cmplxSpec.Chance_RandlengthNote
    
    let spb = 60/bpm
    
    if (debug) {
      console.log(`Rhythmic Complexity: ${rhythmicComplexity}`)
      console.log(`Tempo:  ${bpm} beats per minute`)
    }
    
    let dur = []
    let timing = []
    let phraseLen = 0
    let phraseBeats = 0
    let atkPow = []
    
    // Generate a set of themes which all voices may sing.
    let mainTheme
    
    //let themes = {}
    
    let maxStep = randRange_int(scSpec.MaxThemeStep)
    let phraseStructureWeight = randRange_float(spec.PhraseStructureWeight)
    let phraseStructureBias = randRange_int(spec.PhraseStructureBias)
    if (debug) {
      console.log("Phrase-Structure-Weight:", phraseStructureWeight)
      console.log("Phrase-Structure-Bias:", phraseStructureBias)
    }
    let genTheme = function(range) {
      
      let numTargets = randRange_int(spec.PhraseStructurePoints) + Math.ceil(randRange_float(spec.PhraseStructureExPtsPerNote)*phraseNotes)
      
      let tPoints = []
      for (let i = 0; i < numTargets; i++) {
        let v = 0
        
        while (tPoints.indexOf(v) != -1) {
          v = randRange_int(1, phraseNotes-2)
        }
        tPoints.push(v)
      }
      tPoints.sort((a,b)=>{
        return a-b
      })
      
      let tVals = []
      for (let i = 0; i < numTargets; i++) {
        tVals.push(randRange_int(0, range))
      }
      
      let tI = 0
      let tV = tVals[0]
      
      // scan the phrase structure.  If any target value is similar to the preceding value, deviate it a bit.
      //  (this is to ensure that a phrase structure can cause a phrase to wander around within a voice's range).
      let minDiff = Math.max(Math.ceil(range / 3), 2)
      for (let i = 1; i < numTargets; i++) {
        let prev = tVals[i-1]
        let val = tVals[i]
        if ( Math.abs((val-prev) < minDiff)) {
          if (val >= prev) {
            val = (val + minDiff) % range
          }
          else {
            val = (val + range - minDiff) % range
          }
          tVals[i] = val
        }
      }
      
      let notes = []
      let note = tV
      notes.push( note )
      for (let i = 1; i < phraseNotes; i++) {
        if (i >= tPoints[tI+1]) {
          tI++
          tV = tVals[tI]
        }
        
        let high = Math.min(range, note + maxStep)
        let low = Math.max(0, note - maxStep)
        if (note != tV) {
          if (chance(phraseStructureWeight)) {
            if (note > tV) {
              let _high = high - phraseStructureBias
              if (_high < note) {
                _high = note
              }
              high = _high
            }
            else {
              let _low = low + phraseStructureBias
              if (_low > note) {
                _low = note
              }
              low = _low
            }
          }
        }
        
        note = randRange_int(low, high)
        notes.push( note )
      }
      return notes
    }
    
    for (let name in scSpec.Themes) {
      let tdef = scSpec.Themes[name]
      if (tdef.range) {
        tdef.notes = []
        if (typeof(tdef.range) == "object") {
          tdef.range = randRange_int(tdef.range)
        }
        tdef.notes = genTheme(tdef.range)
      }
      if (name == "Main") {
        mainTheme = tdef.notes
      }
    }
    
    if (debug) {
      console.log("Themes:", scSpec.Themes)
    }
    
    //target frequency of the highest voice 
    //  (NOTE:  the synth is set up to produce tones with lots of high-energy harmonics, so the base tones need to be low-ish)
    let targetHighval = randRange_float(spec.TargetLeadvoicePitch)
    
    let highVal = 0
    let highOfs = 0
    for (; highOfs < scale.length; highOfs++) {
      highVal = scale[highOfs]*fundamental
      if (highVal > targetHighval) {
        break
      }
    }
    let targetLowval = highVal/(2**spec.Octaves)
    let lowVal = 0
    let lowOfs = 0
    for (; lowOfs < scale.length; lowOfs++) {
      lowVal = scale[lowOfs]*fundamental
      if (lowVal > targetLowval) {
        break
      }
    }
    if (highOfs - lowOfs < numVoices) {
      lowOfs = Math.floor(highOfs - (1.5*numVoices))
    }
    let songVoiceRange = highOfs - lowOfs
    
    let vMagnitudes = []
    
    // Pick a random range for each voice
    let valOffsets = []
    {
      for (let i = 0; i < numVoices; i++) {
        let ofs = lowOfs
        while (valOffsets.indexOf(ofs) != -1) {
          //ofs = Math.floor(lowOfs+Math.random()*songVoiceRange)
          ofs = randRange_int(lowOfs, highOfs)
        }
        valOffsets.push(ofs)
      }
    }
    valOffsets.sort( (a,b)=>{ return b-a })
    
    for (let i = 0; i < numVoices; i++) {
      let ofs = valOffsets[i]
      vMagnitudes.push(1-((ofs-lowOfs) / songVoiceRange)*0.5)
    }
    
    randomizeInstruments(vMagnitudes)
    for (let i = 0; i < numVoices; i++) {
      addVoice()
    }
    if (debug) {
      console.log("Voices: " + numVoices)
      console.log("Voice-Magnitudes: " + vMagnitudes)
    }
    
    //console.log(`Base tones: ${lowVal} - ${highVal} Note numbers: ${valOffsets}`)

    // Prepare a set of note and rest durations
    for (let i = 0; i < phraseNotes; i++) {
      //let duration = spb*Math.ceil(Math.random() * (rhythmicComplexity)+1)
      let numBeats = rand_int(rhythmicComplexity)+1
      let duration = spb*(numBeats)
      timing.push({note:true, d:duration})
      phraseLen += duration
      phraseBeats += numBeats
      dur.push(duration)
      
      atkPow.push(spec.AtkpowGeneral)
    }
    let numRests = randRange_int(1,5)
    for (let i = 0; i < numRests; i++) {
      let numBeats = rand_int(restMaxbeats)+1
      let duration = spb*(numBeats)
      phraseLen += duration
      phraseBeats += numBeats
      timing.push({rest:true, d:duration})
    }
    
    let numEmphasized = Math.max( rand_int(phraseNotes/4),2)
    // make the first and middle notes strong.
    for (let i = 0; i < numEmphasized; i++) {
      if (i == 0) {
        atkPow[i] = spec.AtkpowFirst
      }
      else {
        let pos = Math.ceil(i*phraseNotes/numEmphasized)
        atkPow[pos] = spec.AtkpowMid
      }
    }
    
    let targetLen = randRange_float(spec.TargetSongLen)
    let numPhrases = Math.ceil(targetLen / phraseLen)
    
    if (debug) {
      console.log(`Phrases: ${numPhrases}`)
    }
    
    let song = []
    for (let i = 0; i < numPhrases; i++) {
      song.push([])
    }
    
    let phraseIndices = []
    for (let i = 0; i < numPhrases; i++) {
      phraseIndices.push(i)
    }
    
    let voiceOfs = 0
    
    // Generate a moderately random song structure
    //  This divides the voices into a set of ranges (based on base pitch), then attempts to keep voices from each range singing at all times
    //  Voices are activated at a semi-random times, sing for the duration of a "part", then de-activate (allowing other voices within the range to take over).
    
    for (let section of sections) {
      //console.log("SECTION-INFO:", section)
      
      let firstVoice = voiceOfs
      let voices = []
      for (let i = 0; i < section.NumVoices; i++) {
        let voice = voiceOfs
        voices.push(voice)
        voiceOfs++
        
        for (let j = 0; j <= section.ExpoLen; j++) {
          let segmentNum = section.ExpoSpacing*i+j
          if (song[segmentNum]) {
            song[segmentNum].push(voice)
          }
        }
      }
      
      let amtActive = function(part) {
        let amt = 0
        for (let v of part) {
          if (voices.indexOf(v) != -1) {
            amt++
          }
        }
        return amt
      }
      
      let lim = 10000
      
      // Consider all phrases in a random order
      shuffle(phraseIndices)
      for (let i of phraseIndices) {
        //console.log("PHRASE", i, amtActive(song[i]), section.MinActive)
        addParts:
        while (amtActive(song[i]) < section.MinActive) {
        
          // select a random voice to assign a part to
          shuffle(voices)
          let voice
          //console.log("VOICES:", voices.join(","))
          for (let v of voices) {
            
            lim--
            if (lim == 0) {
              //console.log("Phrase Cancelled!")
              break addParts
            }
            // If voice sings in the phrase or an adjacent phrase, skip the voice
            
            if (song[i].indexOf(v) != -1) {
              //console.log("skip-here", v, song[i])
              continue
            }
            if (song[i-1] && song[i-1].indexOf(v) != -1) {
              //console.log("skip-prev", v, song[i-1])
              continue
            }
            if (song[i+1] && song[i+1].indexOf(v) != -1) {
              //console.log("skip-next", v, song[i+1])
              continue
            }
            // If the phrase is in or prior to the voice's exposition, skip the voice
            if (i <= ((v-firstVoice)*section.ExpoSpacing + section.ExpoLen) ) {
              //console.log("skip-tooearly", v, song[i-1], i, (v-firstVoice), section.ExpoSpacing, (v-firstVoice)*section.ExpoSpacing, section.ExpoLen)
              continue
            }
            voice = v
            break
          }
          
          // if voice can sing during the initial phrase, fail and allow less than the specified minimum
          if (voice == undefined) {
            //console.log("Phrase-FAILURE", i)
            break addParts
          }
          
          let maxLen = randRange_int(spec.PartLength.min, spec.PartLength.max)
          let end = i+maxLen
          if (end > numPhrases) {
            end = numPhrases
          }
          for (let j = i; j < end; j++) {
            if ( (!song[j+1] || (song[j+1].indexOf(voice) == -1)) && (song[j].indexOf(voice) == -1) && (amtActive(song[j]) <= section.MaxActive) ) {
              song[j].push(voice)
            }
            else {
              break
            }
          }
        }
      }
    }
    
    // In the unlikely event that a part is otherwise completely silent, assign random voices to empty entries
    for (let segment of song) {
      if (segment.length == 0) {
        segment.push(randRange_int(0, numVoices-1))
      }
    }
    
    
    
    let part_offsets = []
    let valid_offsets = []
    
    let numOfsPositions = randRange_int(spec.NumOffsetPositions)
    let numOffsets = randRange_int(spec.NumOffsets)
    
    if (numOfsPositions < numOffsets) {
      numOfsPositions = numOffsets
    }
    
    for (let i = 1 ; i < numOfsPositions; i++) {
      valid_offsets.push(Math.floor( (i/numOfsPositions) * phraseBeats ) * spb )
    }
    shuffle(valid_offsets)
    valid_offsets.unshift(0)
    valid_offsets = valid_offsets.slice(0, numOffsets)
    
    if (debug) {
      console.log(`Offsets: ${valid_offsets}`)
    }
    
    let expoCHK = {}
    
    for (let i = 0; i < song.length; i++) {
      let prev = song[i-1]
      let part = song[i]
      let ofsGroup = {}
      part_offsets.push(ofsGroup)
      for (let v of part) {
        if (!prev || (prev.indexOf(v) == -1)) {
          if (!expoCHK[v]) {
            ofsGroup[v] = valid_offsets[v%numOffsets]
            expoCHK[v] = true
          }
          else {
            ofsGroup[v] = valid_offsets[randRange_int(0, numOffsets-1)]
          }
        }
      }
    }
    
    if (debug) {
      console.log("Parts:", song)
    }
    
    let numNotes = 0
    
    for (let v = 0; v < numVoices; v++) {
      let vTarget = voiceArr[v]
      let valOfs = valOffsets[v]
      
      //articulation: subtract a random amount of time, up to a quarter beat, from every note which the voice sings
      let durMod = spb*rand_float(spec.NoteReduction)
      
      // Syncopation: shuffle each beat positions/duration and each note duration [this voice]
      let _timing = deepcopy(timing)
      shuffle(_timing)
      
      // compute the actual timing of each note
      let t = 0
      for (let time of _timing) {
        time.t = t
        t += time.d
      }
     
      // generate a unique theme for the voice to occasionally sing
      let voiceTheme
      if (typeof(scSpec.VoiceThemeRange) == "object") {
        voiceTheme = randRange_int(scSpec.VoiceThemeRange)
      }
      else {
        voiceTheme = genTheme(scSpec.VoiceThemeRange)
      }
      let introduction = true
      let offset = 0
      for (let j = 0; j < numPhrases; j++) {
        // if the voice is listed as having a part, sing the phrase, otherwise, ignore it
        let phraseParts = song[j]
        if (phraseParts.indexOf(v) != -1) {
          if (part_offsets[j][v] != undefined) {
            offset = part_offsets[j][v]
          }
          numNotes += phraseNotes
          let theme
          
          // introduce the voice with the main theme
          if (mainTheme && introduction) {
            introduction = false
            theme = mainTheme
          }
          else {
            let themeSpec = randSelect(scSpec.Themes)
            
            theme = deepcopy(themeSpec.notes)
            if (!theme) {
              theme = voiceTheme
            }
            let mod = randSelect(spec.Modifiers)
            if (mod.shuftle) {
              shuffle(theme)
            }
            if (mod.reverse) {
              theme.reverse()
            }
            if (mod.invert) {
              if (themeSpec.notes) {
                for (let i = 0; i < theme.length; i++) {
                  theme[i] = themeSpec.range-theme[i]-1
                }
              }
              else {
                for (let i = 0; i < theme.length; i++) {
                  theme[i] = scSpec.VoiceThemeRange-theme[i]-1
                }
              }
            }
          }
          //schedule all the notes
          let ti = 0
          for (let i = 0; i < theme.length; i++) {
            let time = _timing[ti++]
            while (time.rest) {
              time = _timing[ti++]
            }
            let atk = atkPow[i]
            let noteID = theme[i] + valOfs
            note(time.t+phraseLen*j + offset, dur[i]-durMod, noteID, atk, voiceArr[v])
          }
        }
      }
    }
    if (debug) {
      console.log(`Notes: ${numNotes}`)
    }
    
    //load the song into the csound and start it.
    let score = toScore()
    let configs = {}
    for (let i = 0; i < instruments.length; i++) {
      configs[i+1] = instruments[i]
    }
    
    let endTime = updateSynth({
      group_name:"randTheme",
      group_maxsize:1,
      forced:true,
      program:synthPRG,
      defs:defs,
      config:configs,
      score:score,
      play:true,
      end:1,
      dest_node:audio_destNode
    })
    if (debug) {
      console.log(`Song Length: ${(endTime-Date.now()) / 1000} seconds`)
    }
    return endTime
  }
}