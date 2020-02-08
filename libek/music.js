import { on, next, time } from './nextevent.js'
import { initSynth, Synth, updateSynth } from './synth.js'
import { deepcopy } from './util.js'

export { playMusic, nextSong }

var _nextSong

var nextSong = function(spec, seed) {
  if (_nextSong) {
    _nextSong(spec, seed)
  }
}

var playMusic = function(Source, endAction="restart", fadeAt = -6000, fadeLen=5000, fadeSteps=100, endDelay=2000) {
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
  
  let src = new Source(musicMagnitudeController.node)
  
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
  
  let tryActivate = async function(startDelay=4000) {
    if (musicMagnitudeController.mainValue > 0) {
      active = true
      await time(startDelay)
      play()
    }
  }
  
  let play = _nextSong = async function(spec, seed) {
    musicMagnitudeController.transientValue = 1
    musicMagnitudeController.update()
    let endTime = src.play(spec, seed)
    
    let songLen = endTime - Date.now()
    songLen = Math.floor(songLen)
    let _runID = runID + 1
    runID = _runID
    
    let fadeTime = songLen+fadeAt
    
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
      await time(endDelay)
      if (typeof(endAction) == "function") {
        endAction()
      }
      else {
        switch (endAction) {
          case "restart":
            play(spec)
            break
          case "repeat":
            play(spec, seed)
            break
        }
      }
    }
    else {
      active = false
    }
  }
  window.GEN_MUSIC_REFRESH = (spec, seed)=> {
    play(spec, seed)
  }
}

































