import { on, next, time } from '../libek/nextevent.js'
import { initSynth, Synth, updateSynth } from '../libek/synth.js'
import { deepcopy } from '../libek/util.js'

export { AutoEketek }

let AutoEketek = function(audio_destNode) {
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
  
  // A musical key generator.
  // This accepts a set of partial components, cross-multiples them to generate a harmonic series
  //  The series is then scaled by simple multiplication with a series of exponents of some base
  var key = function(hSeriesAmount, hSeriesBase, partials) {
  
    // a simpler method of specifying partial components
    if (!Array.isArray(partials)) {
      if (partials.repeat) {
        let _partials = []
        for (let i = 0; i < partials.repeat; i++) {
          _partials.push(partials.data)
        }
        partials = _partials
      }
    }
    else if (!Array.isArray(partials[0])) {
      partials = [partials]
    }
    
    let hSeries = []
    
    // multiply the partial-components in every set with the components in every other set
    let idx = []
    let idxT = 1
    for (let i = 0; i < partials.length; i++) {
      idx.push(0)
      idxT *= partials[i].length
    }
    let j = 0
    outer:
    for (let i = 0; i < idxT; i++) {
      let v = 1
      for (let k = 0; k < partials.length; k++) {
        v *= partials[k][idx[k]]
      }
      hSeries.push(v)
      for (let j = 0; j < partials.length; j++) {
        if (idx[j] == (partials[j].length-1)) {
          idx[j] = 0
        }
        else {
          idx[j] += 1
          break
        }
      }
    }
    
    // remove duplicate entries and sort, yielding a properly formatted representation of a single harmonic series
    for (let i = 0; i < hSeries.length; i++) {
      if (hSeries.indexOf(hSeries[i]) < i) {
        hSeries.splice(i,1)
        i--
      }
    }
    hSeries.sort( (a,b)=>{
      return a-b
    })
    
    let key_all = []
    let key_each = []
    
    //expand the harmonic series to generate the entire musical key
    if (!Array.isArray(hSeriesBase)) {
      let base = hSeriesBase
      let base_acc = 1
      hSeriesBase = []
      for (let i = 0; i < hSeriesAmount; i++) {
        hSeriesBase.push(base_acc)
        base_acc *= base
      }
    }
    for (let baseID = 0; baseID < hSeriesBase.length; baseID++) {
      let base = hSeriesBase[baseID]
      let scale_b = []
      key_each[baseID] = scale_b
      for (let partial of hSeries) {
        let val = partial * base
        scale_b.push(val)
        key_all.push(val)
      }
    }
    // remove any duplicate entries in the completed key
    for (let i = 0; i < key_all.length; i++) {
      if (key_all.indexOf(key_all[i]) < i) {
        key_all.splice(i,1)
        i--
      }
    }
    key_all.sort( (a,b)=>{
      return a-b
    })
    
    return {
      hSeries:hSeries,
      all:key_all,
      each:key_each
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
      let useSineSynth = Math.random() > 0.8
      let numPartials = 1
      let partialMagnitude = 1
      if (Math.random() > 0.25) {
        numPartials = Math.floor(Math.random()*4+2)
        partialMagnitude = 1/numPartials
      }
      let pMag = [1.5]
      let pFMul = [1]
      let waveTypes = [Math.floor(Math.random()*3+1)]
      let dcycleParams = [Math.random()]
      let tMag = 0
      for (let i = 1; i < numPartials; i++) {
        let mag = 1.5*(Math.random()*partialMagnitude*(numPartials-i)/numPartials)**2
        tMag += mag
        pMag.push(mag)
        if (Math.random() > 0.9) {
          pFMul.push(i+1+Math.random()*0.05)
        }
        else {
          pFMul.push(i+1)
        }
        waveTypes.push(Math.floor(Math.random()*3+1))
        dcycleParams.push(Math.random())
      }
      let mScale = (Math.random()*0.5+0.25) / (tMag * numPartials)
      for (let i = 1; i < numPartials; i++) {
        pMag[i] *= mScale
      }
      if (!useSineSynth) {
        for (let i = 0; i < numPartials; i++) {
          pMag[i] *= 0.75
        }
      }
      let pan = i==0 ? 0.4 : Math.random()*0.8
      instruments.push({
        def:useSineSynth ? "sine_additive" : "vco_additive",
        iAtkLen:Math.random()*0.05,
        iDecpow:Math.random()*0.3,
        iDeclen:Math.random()*0.05,
        iSuspow:Math.random()*0.2,
        iRellen:Math.random()*0.15,
        iCutoff:(Math.random()**2)*7500,
        iRes:Math.random()*0.15,
        iPMag:pMag,
        iPFreqMul:pFMul,
        iWaveType:waveTypes,
        iDcycle:dcycleParams,
        iLeft:0.2+pan,
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
    target.notes.push( {time:time, dur:dur, freq:fmul*ky.all[noteval], pow:pow} )
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
  
  let ky
  let fundamental
  let fmul
  //let center_hSeries_ID
  //let center_hSeries_toneID
  //let center_value
  //let center_ID
  
  let setKey = function(hSeriesAmount, hSeriesBase, partials) {
    ky = key(hSeriesAmount, hSeriesBase, partials)
    if (fundamental) {
      setFundamental(fundamental)
    }
  }
  
  let setFundamental = function(freq) {
    fundamental = freq
    if (ky) {
      //center_hSeries_toneID = 0
      //center_hSeries_ID = Math.floor(ky.each.length / 2)
      //center_value = ky.each[center_hSeries_ID][center_hSeries_toneID]
      //center_ID = ky.all.indexOf(center_value)
      //fmul = freq / center_value
      fmul = fundamental / ky.all[0]
    }
  }
  
  let shuffle = function(arr) {
    for (let k = arr.length-1; k >= 0; k--) {
      let l = Math.floor(Math.random()*k)
      let tmp = arr[k]
      arr[k] = arr[l]
      arr[l] = tmp
    }
  }
  
  this.compose_and_play = function() {
    reset()
    
    // This was going to be random, but deviating significantly from these factors tends to cause more dissonance than its worth 
    //    (particularly since everything else is random).
    setKey(23,2, [[4,6,8,9,12],[4,6,8,9,12]])
    
    //pick a random fundamental
    setFundamental(Math.random()+0.5)
    
    // These strongly control the approaximate length and self-similarity of a "song"
    let phraseLen = Math.floor(Math.random()*16)+16
    let numPhrases = 24
    
    // Each voice gets a random insrtrument, and will sings in its own range
    let numVoices = Math.floor(Math.random()*16+4)
    randomizeInstruments(numVoices)
    for (let i = 0; i < numVoices; i++) {
      addVoice()
    }
    
    let parts = []
    let prev
    
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
      
      let nVoices = Math.min(i, 6)
      
      // After the introduction is mostly complete, retain up to 4 random voices from the preceding phrase
      if (i > (numVoices-3)) {
        let si = Math.floor(Math.random()*prev.length)
        let sel = prev[si]
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
        si = (si + Math.floor(Math.random()*prev.length-1))%prev.length
        sel = prev[si]
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
        si = (si + Math.floor(Math.random()*prev.length-1))%prev.length
        sel = prev[si]
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
        si = (si + Math.floor(Math.random()*prev.length-1))%prev.length
        sel = prev[si]
        if (part.indexOf(sel) == -1) {
          part.push(sel)
        }
      }
      
      // replace any departed voices with random ones
      for (let j = part.length; j < nVoices; j++) {
        let v = Math.floor(Math.random() * i)
        while (part.indexOf(v) != -1) {
          v = Math.floor(Math.random() * i)
        }
        part.push(v)
      }
      prev = part
    }
    
    //tempo, seconds per beat
    let spb = Math.random()*0.2+0.10
    console.log(`Tempo:  ${60/spb} beats per minute`)
    
    
    let dur = []
    let timing = []
    let _t = 0
    let atkPow = []
    
    // Generate a set of themes which all voices may sing.
    let mainTheme = []
    let altMainTheme1 = []
    let altMainTheme2 = []
    let themeRange = Math.floor(Math.random()*6+6)
    for (let i = 0; i < phraseLen; i++) {
      mainTheme.push(Math.floor(Math.random()*themeRange))
      altMainTheme1.push(Math.floor(Math.random()*themeRange))
      altMainTheme2.push(Math.floor(Math.random()*themeRange))
    }
    
    //target frequency of the highest voice 
    //  (NOTE:  the synth is set up to produce tones with lots of high-energy harmonics, so the base tones need to be low-ish)
    let targetHighval = (Math.random()*150+150)
    
    let highVal = 0
    let highOfs = 0
    for (; highOfs < ky.all.length; highOfs++) {
      highVal = ky.all[highOfs]*fmul
      if (highVal > targetHighval) {
        break
      }
    }
    let targetLowval = highVal/8
    let lowVal = 0
    let lowOfs = 0
    for (; lowOfs < ky.all.length; lowOfs++) {
      lowVal = ky.all[lowOfs]*fmul
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
        ofs = Math.floor(lowOfs+Math.random()*songVoiceRange)
      }
      valOffsets.push(ofs)
    }
    
    console.log(`Base tones: ${lowVal} - ${highVal} Node numbers: ${valOffsets}`)

    // Prepare a set of note and rest durations
    for (let i = 0; i < phraseLen; i++) {
      let _duration = Math.random() > 0.25 ? 2*spb : spb
      timing.push({note:true, d:_duration})
      _t += _duration
      dur.push(_duration)
      
      atkPow.push(0.3)
    }
    let numRests = Math.floor(Math.random()*5)
    for (let i = 0; i < numRests; i++) {
      timing.push({rest:true, d:spb})
    }
    _t += spb*numRests
    
    // make the first and middle notes strong.
    atkPow[0] = 0.5
    atkPow[Math.floor(mainTheme.length/2)] = 0.5
    
    for (let v = 0; v < numVoices; v++) {
      let vTarget = voiceArr[Math.floor(Math.random()*voiceArr.length)]
      
      let valOfs = valOffsets[v]
      
      //articulation: subtract a random amount of time, up to a quarter beat, from every note which the voice sings
      let durMod = Math.random()*spb*0.25
      
      // Syncopation: shuffle each beat positions/duration and each note duration [this voice]
      let _timing = deepcopy(timing)
      shuffle(_timing)
      
      // compute the actual timing of each note
      let __t = 0
      for (let time of _timing) {
        time.t = __t
        __t += time.d
      }
     
      // generate a unique theme for the voice to occasionally sing
      let voiceTheme = []
      for (let i = 0; i < phraseLen; i++) {
        voiceTheme.push(Math.floor(Math.random()*themeRange))
        let _dur = Math.random() > 0.25 ? 2*spb : spb
      }
      
      for (let j = 0; j < numPhrases; j++) {
        // if the voice is listed as having a part, sing the phrase, otherwise, ignore it
        let phraseParts = parts[j]
        if (phraseParts.indexOf(v) != -1) {
          let theme
          
          // introduce the voice with the main theme
          if (j == v) {
            theme = mainTheme
          }
          //At all other times when the voice is active:
          //  17.5%:  sing main-theme
          //  7.5%:   sing reversed main-theme
          //  8.75%:  sing alt-theme-1 
          //  3.75%:  sing reversed alt-theme-1
          //  8.75%:  sing alt-theme-2
          //  3.75%:  sing reversed alt-theme-2
          //  36%:    sing voice-theme
          //  10%:    sing reversed voice-theme
          //  4%:     sing voice-theme notes in random order
          else if (Math.random() > 0.5) {
            switch(Math.floor(Math.random()*4)) {
              case 0:
                theme = altMainTheme1
                break
              case 1:
                theme = altMainTheme2
                break
              default:
                theme = mainTheme
                break
            }
            if (Math.random() > 0.3) {
              theme = deepcopy(theme)
              theme.reverse()
            }
          }
          else {
            theme = voiceTheme
            if (Math.random() < 0.2) {
              theme = deepcopy(voiceTheme)
              theme.reverse()
            }
            else if (Math.random() < 0.2) {
              theme = deepcopy(voiceTheme)
              shuffle(theme)
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
            note(time.t+_t*j, dur[i]-durMod, noteID, atk, voiceArr[v])
          }
        }
      }
    }
    
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