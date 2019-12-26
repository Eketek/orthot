export { Synth, initSynth }
import { on } from './nextevent.js'

/*
  Utility for handling CSound.

  This instantiates CSound, accepts a csound synth program + score, combines them, and submits it to csound webaudio
  
  Known issues:  
    CSound writes mono sound to a stereo audio output in the wrong buffer-format (causing loud square-wave-like noise).
    A reasonable workaround is to adjust the synth program to setup and output to two channels
                 
  Potential issues:  
    During testing, abusing start/stop/suspend/resume/re-instantiation caused CSound to fail to output sound and to fail to yield any warnings or error
    messages.  Would very much prefer to think this is not a real issue.  -- If this is a serious issue, it will likely necessitate minimal state changes
    and real-time interaction through the MIDI input interface (rather than loading data on as synth program input through the CsScore section).
    ... Maybe best practice is destroy-and-rebuild...
*/
var csnd_instances = []
var initSynth = async function() {
  on(window, "unload", ()=>{
    for (let inst of csnd_instances) {
      inst.destroy()
    }
  })
  
  await CsoundObj.importScripts("lib/csound/")
}

var Synth = function(code) {
  this.csound = new CsoundObj()
  csnd_instances.push(this.csound)
  
  this.program = function(code) {
    console.trace()
    // remove block comments
    let o = ""
    while (true) {
      let posOpen = code.search(/\/\*/)
      if (posOpen == -1) {
        o = o + code
        break
      }
      else {
        o = o + code.substring(0, posOpen)
        code = code.substring(posOpen+2)
      }
      let posClose = code.search(/\*\//)
      if (posClose == -1) {
        break
      }
      else {
        code = code.substring(posClose+2)
      }
    }
    code = o
    //remove single-line comments starting with ';' or '//'
    code = code.split(/\;[^\n]*/).join('\n')
    code = code.split(/\/\/[^\n]*/).join('\n')
    
    let score
    
    // If in 'orc' format, convert to 'csd'
    if (code.indexOf('<CsoundSynthesizer>') == -1) {
      code = `
        <CsoundSynthesizer>
        <CsOptions>
        </CsOptions>
        <CsInstruments>
          ${code}
        </CsInstruments>
        </CsoundSynthesizer>`
    }
    // remove score and put it in a separate section
    let scorePos = code.indexOf("<CsScore>")
    console.log(code)
    if (scorePos != -1) {
      let scoreEnd = code.indexOf("</CsScore>")
      score = code.substring(scorePos+9, scoreEnd)
      code = code.substring(0, scorePos) + code.substring(scoreEnd+10)
    }
    this.code = code
    this.score = score
    console.log(scorePos, score)
  }
  if (code) {
    console.log("program?")
    this.program(code)
  }
  
  let state = "off"
  
  this.play = function(score) {
    if (score) {
      if (score.indexOf("<CsoundSynthesizer>") != -1) {
        this.program(score)
      }
      else {
        this.score = score
      }
    }
    switch(state) {
      case "playing":
        state = "off"
        //this.csound.stop()
        
        // Maybe best practice is destroy-and-rebuild...
        this.csound.destroy()
        csnd_instances.splice(csnd_instances.indexOf(this.csound),1)
        this.csound = new CsoundObj()
        csnd_instances.push(this.csound)
        
      case "off":
        if (this.code == undefined) {
          throw new Error("Can not operate synthesizer because:  No synthesizer program is loaded")
        }
        else if (this.score == undefined) {
          throw new Error("Can not operate synthesizer because:  No sound to synthesize")
        }
        let closeTagPos = this.code.indexOf("</CsoundSynthesizer>")
        let prgCSD = `${this.code.substring(0, closeTagPos)} <CsScore>${this.score}</CsScore> ${this.code.substring(closeTagPos)}`
        console.log(prgCSD)
        //this.csound.reset()
        
        this.csound.compileCSD(prgCSD)
        this.csound.start()
        state = "playing"
        break
      case "suspended":
        CSOUND_AUDIO_CONTEXT.resume()
        state = "playing"
        break
    }
  }
  
  this.suspend = function() {
    switch(state) {
      case "playing":
        state = "suspended"
        CSOUND_AUDIO_CONTEXT.suspend()
        break
    }
  }
  
  this.stop = function() {
    switch(state) {
      case "playing":
      case "suspended":
        state = "off"
        this.csound.stop()
        break
    }
  }
}













