import { on, next, time } from '../libek/nextevent.js'
import { initSynth, Synth, updateSynth } from '../libek/synth.js'
import { deepcopy } from '../libek/util.js'

export { AutoEketek }

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
    return rand(curve)*max
  }
  let randRange_float = function(min, max, curve) {
    return rand(curve)*(max-min) + min
  }
  let rand_int = function(max, curve) {
    return Math.floor(rand_float(max, curve))
  }
  let randRange_int = function(min, max, curve) {
    return Math.floor(randRange_float(max, min, curve))
  }
  
  let chance = function(n) {
    return rand() < n
  }
  
  let randSelect = function(arr, curve) {
    return arr[rand_int(arr.length, curve)]
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
        dcycleParams.push(rand_float())
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
        iAtkLen:randRange_float(0.025, 0.075),
        iDecpow:randRange_float(0.05, 0.15),
        iDeclen:randRange_float(0.025, 0.075),
        iSuspow:randRange_float(0.05, 0.1),
        iRellen:rand_float(0.15),
        iCutoff:rand_float(7500, 2),
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
  
  this.compose_and_play = function(seed) {
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
    
    if (window.Do_a_really_bad_job) {
      scale = Scale([8192,10000,10240,12500,12800,15625,16000], 2)
      fundamental = randRange_float(0.5, 1.5)/4096
    }
    else {
      // On further analysis, what AutoEketek has is a Pentatonic scale with a Pythagorean tuning.  
      //      Which... is probably a best-practice without any other logic behind note selection.
      //  So might as well declare it explicitly.
      scale = Scale([64,72,81,96,108], 2)
      fundamental = randRange_float(0.5, 1.5)/32
    }
    
    // These strongly control the approaximate length and self-similarity of a "song"
    //let phraseNotes = Math.floor(Math.random()*8)+12
    let phraseNotes = randRange_int(8, 20)
    
    // Each voice gets a random insrtrument, and will sings in its own range
    //let numVoices = Math.floor(Math.random()*4+4)
    let numVoices = randRange_int(4, 8)
    randomizeInstruments(numVoices)
    for (let i = 0; i < numVoices; i++) {
      addVoice()
    }
    
    let parts = []
    let prev
    
    console.log("Voices: " + numVoices)
    
    //  Rhythmic complexity - maximum number of beats to hold a note
    //let rhythmicComplexity = Math.floor(Math.random()*4)+1
    let rhythmicComplexity = randRange_int(1, 5)
    let bpm, restMaxbeats
    
    switch(rhythmicComplexity) {
      default:
        rhythmicComplexity = 1
      case 1:
        restMaxbeats = 1
        bpm = randRange_float(150,450)
        // Reduce the odds of zero rhythmic complexity to 1.25%.
        if (chance(0.95)) {
          rhythmicComplexity = 2
        }
        break
      case 2:
        bpm = randRange_float(175,500)
        restMaxbeats = 1
        break
      case 3:
        bpm = randRange_float(200,500)
        restMaxbeats = 1
        break
      case 4:
        bpm = randRange_float(225,400)
        restMaxbeats = 2
        break
    }
    
    let spb = 60/bpm
    console.log(`Rhythmic Complexity: ${rhythmicComplexity}`)
    console.log(`Tempo:  ${bpm} beats per minute`)
    
    let dur = []
    let timing = []
    let phraseLen = 0
    let atkPow = []
    
    // Generate a set of themes which all voices may sing.
    let mainTheme = []
    let altMainTheme1 = []
    let altMainTheme2 = []
    let themeRange = randRange_int(6,9)
    for (let i = 0; i < phraseNotes; i++) {
      mainTheme.push( rand_int(themeRange) )
      altMainTheme1.push(rand_int(themeRange))
      altMainTheme2.push(rand_int(themeRange))
    }
    
    console.log("Main Theme:", mainTheme)
    console.log("Alt Theme 1:", altMainTheme1)
    console.log("Alt Theme 2:", altMainTheme2)
    
    //target frequency of the highest voice 
    //  (NOTE:  the synth is set up to produce tones with lots of high-energy harmonics, so the base tones need to be low-ish)
    let targetHighval = randRange_float(200, 275)
    
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
    
    let valOffsets = [highOfs, highOfs-Math.floor(songVoiceRange/3), highOfs-Math.floor((songVoiceRange*2)/3), lowOfs]
    for (let i = 3; i < numVoices; i++) {
      let ofs = lowOfs
      while (valOffsets.indexOf(ofs) != -1) {
        //ofs = Math.floor(lowOfs+Math.random()*songVoiceRange)
        ofs = randRange_int(lowOfs, highOfs)
      }
      valOffsets.push(ofs)
    }
    
    //console.log(`Base tones: ${lowVal} - ${highVal} Note numbers: ${valOffsets}`)

    // Prepare a set of note and rest durations
    for (let i = 0; i < phraseNotes; i++) {
      //let duration = spb*Math.ceil(Math.random() * (rhythmicComplexity)+1)
      let duration = spb*(rand_int(rhythmicComplexity)+1)
      timing.push({note:true, d:duration})
      phraseLen += duration
      dur.push(duration)
      
      atkPow.push(0.25)
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
        atkPow[i] = 0.4
      }
      else {
        let pos = Math.ceil(i*phraseNotes/numEmphasized)
        atkPow[pos] = 0.325
      }
    }
    
    let targetLen = randRange_float(200,300)
    let numPhrases = Math.max(24, Math.ceil(targetLen / phraseLen))
    
    console.log(`Phrases: ${numPhrases}`)
    
    // determine which voice will sing during each part of the song
    for (let i = 0; i < numPhrases; i++) {
      let part = []
      parts.push(part)
      
      // To start, introduce each voice in a fixed sequence
      if (i < numVoices) {
        part.push(i)
      }
      if (i < (numVoices-1)) {
        part.push(i-1)
      }
      if (i < (numVoices-2)) {
        part.push(i-2)
      }
      if (i < (numVoices-3)) {
        part.push(i-3)
      }
      
      let nVoices = Math.min(i, 6, numVoices)
      
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
      for (let j = part.length; j < nVoices; j++) {
        let v = rand_int(numVoices)
        while (part.indexOf(v) != -1) {
          v = rand_int(numVoices)
        }
        part.push(v)
      }
      prev = part
    }
    
    let numNotes = 0
    
    for (let v = 0; v < numVoices; v++) {
      let vTarget = voiceArr[v]
      let valOfs = valOffsets[v]
      
      //articulation: subtract a random amount of time, up to a quarter beat, from every note which the voice sings
      let durMod = rand_float(spb*0.25)
      
      // Syncopation: shuffle each beat positions/duration and each note duration [this voice]
      let _timing = deepcopy(timing)
      shuffle(_timing)
      
      // compute the actual timing of each note
      let t = 0
      for (let time of _timing) {
        time.t = t
        t += time.d
      }
      
      //console.log(`Voice #${v} timing:`, _timing)
     
      // generate a unique theme for the voice to occasionally sing
      let voiceTheme = []
      for (let i = 0; i < phraseNotes; i++) {
        voiceTheme.push(rand_int(themeRange))
      }
      
      for (let j = 0; j < numPhrases; j++) {
        // if the voice is listed as having a part, sing the phrase, otherwise, ignore it
        let phraseParts = parts[j]
        if (phraseParts.indexOf(v) != -1) {
          numNotes += phraseNotes
          let theme
          
          // introduce the voice with the main theme
          if (j == v) {
            theme = mainTheme
          }
          //At all other times when the voice is active:
          //  50%:  sing main-theme
          //  25%:  sing alt-theme-1
          //  25%:  sing alt-theme-2
          
          // Then the theme is transformed at the following rates:
          //  5%:      shuffle          (random re-arrangement of pitch values)
          //  48.45%:  no change        (theme is played exactly as defined)
          //  32.3%:   invert           (exchange high & low pitches [within the voice range] across the theme)
          //  8.55%:   reverse          (reverse the order in which the pitches are played
          //  5.7%:    reverse+invert   (combionation of reverse and invert)
          else {
            switch(rand_int(8)) {
              case 0:
                theme = altMainTheme1
                break
              case 1:
                theme = altMainTheme2
                break
              case 2:
              case 3:
                theme = mainTheme
              default:
                theme = voiceTheme
                break
            }
            theme = deepcopy(theme)
            
            if (chance(0.05)) {
              shuffle(theme)
            }
            else {
              if (chance(0.15)) {
                theme.reverse()
              }
              if (chance(0.4)) {
                for (let i = 0; i < theme.length; i++) {
                  theme[i] = themeRange-theme[i]-1
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