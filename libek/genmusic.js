import { on, next, time } from './nextevent.js'
import { initSynth, Synth, updateSynth } from './synth.js'
import { deepcopy } from './util.js'

export { runGenMusicPlayer }

var runGenMusicPlayer = function(Composer) {
  
  let active = false
  
  let mag = window.localStorage.musicVolume
  if ((mag == undefined) || (mag == "")) {
    mag = 1
    window.localStorage.musicVolume = mag
  }
  
  let GainController = function(audioCTX, value, transient=1, destination=undefined) {
    this.mainValue = value
    this.transientValue = transient
    this.node = audioCTX.createGain()
    if (!destination) {
      destination = audioCTX.destination
    }
    this.node.connect(destination)
    this.update = function() {
      let nmag = this.mainValue  * this.transientValue
      this.node.gain.setValueAtTime(nmag, audioCTX.currentTime)
    }
  }
  
  let musicMagnitudeController = new GainController(CSOUND_AUDIO_CONTEXT, mag)
  
  let $volContainer = $('<div class="btn_active">')
  
  let magSlider = $(`<input name="music" type="range" min="0" max="1" step="0.05">`)[0]
  magSlider.value = musicMagnitudeController.mainValue
  on(magSlider, "input", ()=>{
    musicMagnitudeController.mainValue = magSlider.value
    window.localStorage.musicVolume = magSlider.value
    musicMagnitudeController.update()
    if (!active) {
      tryActivate()
    }
  })
  $volContainer.append($('<label for="music">').text("Music"))
  $volContainer.append(magSlider)
  $("#controls").append($volContainer)
  
  let composer = new Composer(musicMagnitudeController.node)
  
  // First, prepare up a couple instruments.
  // These are mass-duplicated and expanded and parameterized through expansion logic prior to tranfer to csound.
  
  // a token to prevent the music function from overriding an [externally] re-started run
  let runID = 0
  
  // Chrome doesn't like auto-playing sound, so use the first input to get it started.
  next("keydown click", async ()=>{
    if (CSOUND_AUDIO_CONTEXT.state == "suspended") {
      CSOUND_AUDIO_CONTEXT.resume()
    }
    tryActivate()
  })
  
  let tryActivate = async function() {
    if (musicMagnitudeController.mainValue > 0) {
      await time(4000)
      compose_and_play()
    }
  }
  
  let compose_and_play = async function() {
    active = true
    musicMagnitudeController.transientValue = 1
    musicMagnitudeController.update()
    let endTime = composer.compose_and_play()
    
    let songLen = endTime - Date.now()
    console.log(`Song Length: ${songLen / 1000} seconds`)
    songLen = Math.floor(songLen)
    
    let _runID = runID + 1
    runID = _runID
    
    let fadeTime = songLen-6000
    let fadeLen = 5000
    let fadeSteps = 100
    let restartDelay = 2000
    
    await time(fadeTime)
    
    // cancel the restart if the initiating run was cancelled (evidenced by runID token being changed to something other than the local copy)
    if (runID != _runID) return
    
    let amt = fadeLen/fadeSteps
    for (let i = 0; i < fadeSteps; i++) {
      musicMagnitudeController.transientValue = (fadeSteps-i)/fadeSteps
      musicMagnitudeController.update()
      await time(fadeLen/fadeSteps)
      if (runID != _runID) return
    }
    if (musicMagnitudeController.mainValue > 0) {
      time(restartDelay, compose_and_play)
    }
    else {
      active = false
    }
  }
  window.GEN_MUSIC_REFRESH = ()=> {
    compose_and_play()
  }
  
}


































