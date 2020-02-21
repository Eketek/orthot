import { on, next, time } from './nextevent.js'
import { initSynth, Synth, updateSynth } from './synth.js'
import { deepcopy } from './util.js'
import { setupMainAudioController } from './sfx.js'

export { playMusic, nextSong }

var _nextSong

var nextSong = function(spec, seed) {
  if (_nextSong) {
    _nextSong(spec, seed)
  }
}

var playMusic = function(MusicSource, endAction="restart", fadeAt = -6000, fadeLen=5000, fadeSteps=100, endDelay=2000) {

  let audioCTL
  let musicSRC
  let runID = 0
  let play = _nextSong = async function(spec, seed) {
    audioCTL.transient = 1
    audioCTL.update()
    
    let endTime = musicSRC.play(spec, seed)
    
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
      audioCTL.transient = (fadeSteps-i)/fadeSteps
      audioCTL.update()
      await time(fadeLen/fadeSteps)
      if (runID != _runID) return
    }
    if (audioCTL.magnitude > 0) {
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
      audioCTL.active = false
    }
  }
  audioCTL = setupMainAudioController("musicVolume", "Music", play)
  musicSRC = new MusicSource(audioCTL.node)
  
  window.GEN_MUSIC_REFRESH = (spec, seed)=> {
    play(spec, seed)
  }
}


































