import { on, next, time } from '../libek/nextevent.js'
import { initSynth, Synth, updateSynth } from '../libek/synth.js'
import { deepcopy } from '../libek/util.js'

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
  
  // A musical scale generator.
  // In its simplest usage, this just multiplies a series of frequencies with powers of some base
  // The more complex usages invole specifing the scale as sets of factors to derive all values from, and octaves that are not powers of some base value
  // The more complex usages are great for getting bad results out of the any simple composition algorithm, so only the simplest case is invoked.
  var Scale = function(factorlists, base=2) {
    
    // a simpler method of specifying partial components
    if (!Array.isArray(factorlists)) {
      if (factorlists.repeat) {
        let _factorlists = []
        for (let i = 0; i < factorlists.repeat; i++) {
          _factorlists.push(factorlists.data)
        }
        factorlists = _factorlists
      }
    }
    else if (!Array.isArray(factorlists[0])) {
      factorlists = [factorlists]
    }
    
    let scale = []
    
    // multiply the partial-components in every set with the components in every other set
    let idx = []
    let idxT = 1
    for (let i = 0; i < factorlists.length; i++) {
      idx.push(0)
      idxT *= factorlists[i].length
    }
    let j = 0
    outer:
    for (let i = 0; i < idxT; i++) {
      let v = 1
      for (let k = 0; k < factorlists.length; k++) {
        v *= factorlists[k][idx[k]]
      }
      scale.push(v)
      for (let j = 0; j < factorlists.length; j++) {
        if (idx[j] == (factorlists[j].length-1)) {
          idx[j] = 0
        }
        else {
          idx[j] += 1
          break
        }
      }
    }
    
    // remove duplicate entries and sort, yielding a properly formatted representation of a single harmonic series
    for (let i = 0; i < scale.length; i++) {
      if (scale.indexOf(scale[i]) < i) {
        scale.splice(i,1)
        i--
      }
    }
    scale.sort( (a,b)=>{
      return a-b
    })
    
    let scale_all = []
    let scale_each = []
    
    //If base is just an number, fill an array with its powers
    if (!Array.isArray(base)) {
      let _base = base
      let base_acc = 1
      base = []
      for (let i = 0; i < 32; i++) {
        base.push(base_acc)
        base_acc *= _base
      }
    }
    for (let i = 0; i < base.length; i++) {
      let baseVal = base[i]
      let scale_b = []
      scale_each[i] = scale_b
      for (let partial of scale) {
        let val = partial * baseVal
        scale_b.push(val)
        scale_all.push(val)
      }
    }
    // remove any duplicate entries in the completed key
    for (let i = 0; i < scale_all.length; i++) {
      if (scale_all.indexOf(scale_all[i]) < i) {
        scale_all.splice(i,1)
        i--
      }
    }
    scale_all.sort( (a,b)=>{
      return a-b
    })
    
    return {
      scale:scale,
      all:scale_all,
      each:scale_each
    }
  }
  
  let voices
  let voiceArr = []
  
  // utility function to convert a note into a csound input 
  let defaultTransform = function(voice, note) {
    return `${voice.instrID} ${note.time} ${note.dur} ${note.freq} ${note.pow}`
  }
  
  let instruments
  
  // Generate a randomly parameterized synth subroutine for each instrument
  let randomizeInstruments = function(amount) {
    instruments = []
    for (let i = 0; i < amount; i++) {
      let useSineSynth = chance(0.25)
      let numPartials = 1
      let partialMagnitude = 1
      if (chance(0.75)) {
        //numPartials = Math.floor(Math.random()*4+2)
        numPartials = randRange_int(2,6)
        partialMagnitude = 1/numPartials
      }
      let pMag = [1]
      let pFMul = [1]
      //let waveTypes = [Math.floor(Math.random()*3+1)]
      let waveTypes = [randRange_int(1,4)]
      let dcycleParams = [rand_float()]
      let tMag = 0
      for (let i = 1; i < numPartials; i++) {
        //let mag = 1*(Math.random()*partialMagnitude*(numPartials-i)/numPartials)**2
        let mag = 1 * rand_float(partialMagnitude*(numPartials-i)/numPartials, 2)
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
          pMag[i] *= 0.75
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
    randomizeInstruments()
    voices = {}
    voiceArr = []
  }
  reset()
  
  let note = function(time, dur, noteval, pow, target) {
    if (!target) {
      target = voices.i1
    }
    target.notes.push( {time:time, dur:dur, freq:fundamental*scale.all[noteval], pow:pow} )
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
    PhraseLength:{ min:12, max:24 },    // Number of notes per phrase
    Voices: { min:4, max:10 },          // Number of unique voices
    TargetSongLen: { min:100, max:250 },
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
    VoiceThemeRange: { min:6, max:9 },
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
    TargetLeadvoicePitch:{ min:200, max:275 },    // Approximate frequency the lowest possible note the by the lead voice
    VoiceIntroOrder:[1, 2/3, 1/3, 0],             // Voice introduction order by pitch (1 - highest, 0 - lowest)
    IntroPhrases:3,                               // Length of a voice introduction in phrases
    TargetActiveVoices:6,                          // Number of concurrent voices
    NoteReduction:{ min:0.1, max:0.75 },          // Amount of time [in beats] to subtract from each note (how "staccato" voices should sing)
    AtkpowGeneral:0.25,                           // Attack strength of notes in general (initial loudness)
    AtkpowFirst:0.45,                             // Attack strength of the first note in a phrase
    AtkpowMid:0.35,                               // Attack strength of various emphasized middle-notes (generally every 4th) (this
  }
  
  this.spec = deepcopy(defaultSpec)
  
  this.compose_and_play = function(spec, seed) {
    if (seed) {
      applySeed(seed)
    }
    else {
      RNG = Math.random
    }
    reset()
    
    if (seed) {
      console.log(`AUTO-EKETEK has dutifully located a copy of "${seed}"`)
    }
    else {
      console.log("AUTO-EKETEK is composing a song... Just for you!")
    }
    
    if (!spec) {
      spec = defaultSpec
    }
    
    spec = deepcopy(spec)
    if (window.Do_a_really_bad_job) {
      switch( randRange_int(0,2) ) {
        case 0:
          scale = Scale([8192,10000,10240,12500,12800,15625,16000], 2)
          fundamental = randRange_float(0.5, 1.5)/4096
          break
        case 1:
          scale = Scale([61,71,83,97,109], 2)
          fundamental = randRange_float(0.5, 1.5)/32
          break
        case 2:
          scale = Scale([rand_float(),rand_float(),rand_float(),rand_float(),rand_float()], 2)
          fundamental = randRange_float(0.5, 1.5)
          break
      }
      console.log(scale)
    }
    else {
      // On further analysis, what AutoEketek has is a Pentatonic scale with a Pythagorean tuning.  
      //      Which... is probably a best-practice without any other logic behind note selection.
      //  So might as well declare it explicitly.
      scale = Scale([64,72,81,96,108], 2)
      fundamental = randRange_float(0.5, 1.5)/32
    }
    
    // These strongly control the approaximate length and self-similarity of a "song"
    let phraseNotes = randRange_int(spec.PhraseLength)
    
    // Each voice gets a random insrtrument, and will sings in its own range
    let numVoices = randRange_int(spec.Voices)
    randomizeInstruments(numVoices)
    for (let i = 0; i < numVoices; i++) {
      addVoice()
    }
    
    let parts = []
    let prev
    
    console.log("Voices: " + numVoices)
    //  Rhythmic complexity - maximum number of beats to hold a note
    //let rhythmicComplexity = Math.floor(Math.random()*4)+1
    let cmplxSpec = randSelect(spec.Complexity)
    //let rhythmicComplexity = randRange_int(1, 5)
    let rhythmicComplexity = cmplxSpec.RhythmicComplexity
    let restMaxbeats = cmplxSpec.RestMaxBeats
    let bpm = randRange_int(cmplxSpec.Tempo)
    let chance_RandlengthNote = cmplxSpec.Chance_RandlengthNote
    
    let spb = 60/bpm
    console.log(`Rhythmic Complexity: ${rhythmicComplexity}`)
    console.log(`Tempo:  ${bpm} beats per minute`)
    
    let dur = []
    let timing = []
    let phraseLen = 0
    let atkPow = []
    
    // Generate a set of themes which all voices may sing.
    let mainTheme
    
    //let themes = {}
    for (let name in spec.Themes) {
      let tdef = spec.Themes[name]
      if (tdef.range) {
        tdef.notes = []
        if (typeof(tdef.range) == "object") {
          tdef.range = randRange_int(tdef.range)
        }
        for (let i = 0; i < phraseNotes; i++) {
          tdef.notes.push( rand_int(tdef.range) )
        }
      }
      if (name == "Main") {
        mainTheme = tdef.notes
      }
    }
    
    console.log("Themes:", spec.Themes)
    
    //target frequency of the highest voice 
    //  (NOTE:  the synth is set up to produce tones with lots of high-energy harmonics, so the base tones need to be low-ish)
    let targetHighval = randRange_float(spec.TargetLeadvoicePitch)
    
    let highVal = 0
    let highOfs = 0
    for (; highOfs < scale.all.length; highOfs++) {
      highVal = scale.all[highOfs]*fundamental
      if (highVal > targetHighval) {
        break
      }
    }
    let targetLowval = highVal/4
    let lowVal = 0
    let lowOfs = 0
    for (; lowOfs < scale.all.length; lowOfs++) {
      lowVal = scale.all[lowOfs]*fundamental
      if (lowVal > targetLowval) {
        break
      }
    }
    if (highOfs - lowOfs < numVoices) {
      lowOfs = Math.floor(highOfs - (1.5*numVoices))
    }
    let songVoiceRange = highOfs - lowOfs
    
    // Pick a random range for each voice
    //  For stylistic reasons, the first 4 voices are spaced widely apart.
    let valOffsets = []
    {
      let i = 0
      for (; i < spec.VoiceIntroOrder.length; i++) {
        valOffsets.push( lowOfs + Math.floor(spec.VoiceIntroOrder[i] * songVoiceRange))
      }
      //let valOffsets = [highOfs, highOfs-Math.floor(songVoiceRange/3), highOfs-Math.floor((songVoiceRange*2)/3), lowOfs]
      for (; i < numVoices; i++) {
        let ofs = lowOfs
        while (valOffsets.indexOf(ofs) != -1) {
          //ofs = Math.floor(lowOfs+Math.random()*songVoiceRange)
          ofs = randRange_int(lowOfs, highOfs)
        }
        valOffsets.push(ofs)
      }
    }
    
    //console.log(`Base tones: ${lowVal} - ${highVal} Note numbers: ${valOffsets}`)

    // Prepare a set of note and rest durations
    for (let i = 0; i < phraseNotes; i++) {
      //let duration = spb*Math.ceil(Math.random() * (rhythmicComplexity)+1)
      let duration = spb*(rand_int(rhythmicComplexity)+1)
      timing.push({note:true, d:duration})
      phraseLen += duration
      dur.push(duration)
      
      atkPow.push(spec.AtkpowGeneral)
    }
    let numRests = randRange_int(1,5)
    for (let i = 0; i < numRests; i++) {
      let duration = spb*(rand_int(restMaxbeats)+1)
      phraseLen += duration
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
    let numPhrases = Math.max(numVoices*2, Math.ceil(targetLen / phraseLen))
    
    console.log(`Phrases: ${numPhrases}`)
    
    // determine which voice will sing during each part of the song
    for (let i = 0; i < numPhrases; i++) {
      let part = []
      parts.push(part)
      
      // To start, introduce each voice in a fixed sequence
      for (let j = 0; j < spec.IntroPhrases; j++) {
        if ( ((i-j) < numVoices) && ((i-j) >= 0) ) {
          part.push(i-j)
        }
      }
      
      let nVoices = Math.min(i, spec.TargetActiveVoices, numVoices-1)
      
      // After the introduction is mostly complete, retain up to 3 random voices from the preceding phrase
      if (i > (numVoices-3)) {
        let sel = randSelect(prev)
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
        sel = randSelect(prev)
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
        sel = randSelect(prev)
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
      }
      
      // replace any departed voices with random ones
      for (let j = part.length; j <= nVoices; j++) {
        let v = rand_int(numVoices-1)
        while (part.indexOf(v) != -1) {
          v = rand_int(numVoices-1)
        }
        part.push(v)
      }
      prev = part
    }
    console.log("PARTS:", parts)
    
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
      let voiceTheme = []
      for (let i = 0; i < phraseNotes; i++) {
        voiceTheme.push(rand_int(spec.VoiceThemeRange))
      }
      
      for (let j = 0; j < numPhrases; j++) {
        // if the voice is listed as having a part, sing the phrase, otherwise, ignore it
        let phraseParts = parts[j]
        if (phraseParts.indexOf(v) != -1) {
          numNotes += phraseNotes
          let theme
          
          // introduce the voice with the main theme
          if (mainTheme && (j == v)) {
            theme = mainTheme
          }
          else {
            let themeSpec = randSelect(spec.Themes)
            
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
                  theme[i] = spec.VoiceThemeRange-theme[i]-1
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
            note(time.t+phraseLen*j, dur[i]-durMod, noteID, atk, voiceArr[v])
          }
        }
      }
    }
    console.log(`Notes: ${numNotes}`)
    
    //load the song into the csound and start it.
    let score = toScore()
    let configs = {}
    for (let i = 0; i < instruments.length; i++) {
      configs[i+1] = instruments[i]
    }
    
    let len = updateSynth({
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
    return len
  }
}

window.Do_a_really_bad_job = false