export { sfxGlobals, setCommonScale, playSound, setupMainAudioController }

// This is used for coordination between sound effects and music.  For now, this is only used for consistant tonality.
var sfxGlobals = {
  scale:undefined,
  fundamental:1
}

// Generate an WebAudio gain node with an associated GUI slider that sets its magnitide
//  and optionally trigger a callback if/when the audio system is ready
var setupMainAudioController = function(actlName, actlUIname, play, defualtMag=1) {

  let mag = window.localStorage[actlName]
  if ((mag == undefined) || (mag == "")) {
    mag = defualtMag
    window.localStorage[actlName] = mag
  }
    
  let audioCTX = CSOUND_AUDIO_CONTEXT
  
  
  let ctl = {
    active:false,
    magnitude:Number.parseFloat(mag),
    transient:1,
    node:audioCTX.createGain()
  }
  
  let destination = audioCTX.destination
  ctl.node.connect(destination)
  
  let update = ctl.update = function() {
    ctl.node.gain.setValueAtTime(ctl.magnitude * ctl.transient, audioCTX.currentTime)
  }
  
  let $volContainer = $('<div class="btn_active">')
  
  let magSlider = $(`<input name="${actlUIname}" type="range" min="0" max="1" step="0.05">`)[0]
  magSlider.value = mag
  on(magSlider, "input", ()=>{
    mag = magSlider.value
    ctl.magnitude = mag
    window.localStorage[actlName] = magSlider.value
    ctl.update()
    if (!ctl.active) {
      tryActivate()
    }
  })
  $volContainer.append($(`<label for="${actlUIname}">`).text(actlUIname))
  $volContainer.append(magSlider)
  $("#controls").append($volContainer)
  
  
  // First, prepare up a couple instruments.
  // These are mass-duplicated and expanded and parameterized through expansion logic prior to tranfer to csound.
  
  // Chrome doesn't like auto-playing sound, so use the first input to get it started.
  next("keydown click", async ()=>{
    if (CSOUND_AUDIO_CONTEXT.state == "suspended") {
      CSOUND_AUDIO_CONTEXT.resume()
    }
    tryActivate()
  })
  
  let tryActivate = async function(startDelay=4000) {
    if (mag > 0) {
      ctl.active = true
      await time(startDelay)
      if (play) {
        play()
      }
    }
  }
  return ctl
}

var setCommonScale = function(values, name="scale", octaves=20, denom=1, base=2) {
  let scale = sfxGlobals[name] = []
  let m = 1/denom
  for (let i = 0; i < octaves; i++) {
    for (let val of values) {
      scale.push(val*m)
    }
    m *= base
  }
  return scale
}

// Default to 12-tone pythagorean tuning
setCommonScale([1024/729, 256/243, 128/81, 32/27, 16/9, 4/3, 1/1, 3/2, 9/8, 27/16, 81/64, 243/128, 729/512])

let categoryPresets = {}
let prepareSoundCategory = function(audio_outputnode, category, max_concurrency, synthProgram, synthDefs, synthConfig) {
  if (synthProgram == undefined) {
    synthProgram = `
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
          iPMag = 1
          iPFreqMul = 1
          iWaveType = 1
          iDcycle = 1
          
          aValue = aValue + vco( iPMag, iPFreqMul*iFreq, iWaveType )
          
          aValue = moogladder(aValue, iCutoff, iRes)
               
          aOut = aValue * aEnv
          out aOut*iLeft, aOut*iRight

        </CsInstruments>
      </CsoundSynthesizer>
    `
  }
  categoryPresets[category] = {
    group_name:category,
    group_maxsize:max_concurrency,
    program:synthProgram,
    defs:synthDefs,
    config:synthConfig,
    score:"",
    dest_node:audio_outputnode
  }
  updateSynth(preset)
  preset.play = true
}

var playSound = function(category, effect) {
  let preset = categoryPresets[category]
  if (preset) {
    updateSynth(preset)
    /*
    updateSynth({
      group_name:category,
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
    */
  }
}










