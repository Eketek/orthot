export { sfxGlobals, setCommonScale, playSound, setupMainAudioController, configureSFX, testSFX }

import { updateSynth, initSynth } from './synth.js'

// This is used for coordination between sound effects and music.  For now, this is only used for consistant tonality.
var sfxGlobals = {
  scale:undefined,
  fundamental:1,
  forever:3600*365*5
}

// Generate an WebAudio gain node with an associated GUI slider that sets its magnitide
//  and optionally trigger a callback if/when the audio system is ready
var setupMainAudioController = function(actlName, actlUIname, play, defualtMag=1, startDelay=4000) {

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
  update()
  
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
  
  let tryActivate = async function() {
    if (mag > 0) {
      ctl.active = true
      if (play) {
        await time(startDelay)
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

let sfxHandles = {}

// setup a synth back-end for sound effects
let configureSFX = function(params) {
  if (params.synthProgram == undefined) {
    params.synthProgram = `
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
          
          instr 1
            iFreq = p4
            iAtkpow = p5
            iAtklen = 0.05
            iDecpow = 0.2
            iSuspow = 0.05
            iDeclen = 0.4
            iSuslen = p3-iAtklen-iDeclen
            iRellen = 0.1
            iCutoff = 5000

            aEnv linsegr 0, iAtklen, iAtkpow, iDeclen, iDecpow, iSuslen, iSuspow, iRellen, 0

            aValue = vco( 1, iFreq, 1 )
            aValue = moogladder(aValue, iCutoff, 0.25)
                 
            aOut = aValue * aEnv
            out aOut, aOut
          endin
        </CsInstruments>
      </CsoundSynthesizer>
    `
  }
  let sfxSynthHandle = sfxHandles[params.category] = {
    group_name:params.category,
    group_maxsize:1,
    program:params.synthProgram,
    defs:params.synthDefs,
    config:params.synthConfig,
    score:``,
    dest_node:params.audio_outputnode,
    play:true,
    end:sfxGlobals.forever,
    forced:true
  }
  updateSynth(sfxSynthHandle)
}

// Play sound from simple sound-effect definition.
// read notation, convert to csound score, submit to csound through readScore()
// This is to use a shorthand music notation. (raw csound scores, old-school-ish sound effect strings, and possibly also ABC)
var playSound = function(category, effect) {
  let sfxSynthHandle = sfxHandles[category]
  if (sfxSynthHandle) {
    if (typeof(effect) == "string") {
      sfxSynthHandle.synth.csound.readScore(effect)
    }
  }
}

// test:  press k -> sound plays some notes
//        press k many times, the same synth plays the sequence multiple times concurrently
var testSFX = async function() {
  await initSynth()
  let sndCTL = setupMainAudioController("SoundVolume", "Sound")
  configureSFX({
    audio_outputnode:sndCTL.node,
    category:"sfx",
    max_concurrency:1
  })
  on("k", ()=>{
    playSound("sfx", `
      i1 0 0.25 200 0.25
      i1 0.25 0.25 220 0.25
      i1 0.5 0.25 242 0.25
      i1 0.75 0.25 220 0.25
      i1 1 0.25 200 0.25
    `)
  })
}








