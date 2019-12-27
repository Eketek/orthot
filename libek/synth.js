export { Synth, initSynth, updateSynth }
import { on } from './nextevent.js'
import { deepcopy } from './util.js'
import { getUID } from './libek.js'

/*
  Utility for handling CSound.

  This instantiates CSound, accepts a csound synth program + score, combines them, and submits it to csound webaudio
  
  Known issues:  
    CSound writes mono sound to a stereo audio output in the wrong buffer-format (causing loud square-wave-like noise).
    Workaround: adjust the synth program to setup and output to two channels
    
    CSoundObj.reset() does not put csound into a workable state if it has completed its synth program
    Workaround:  Insert a dummy note into the score at the 3600th second.  
    
  Potential issues:  
    During testing, zealously hammering away at start/stop/suspend/resume/re-instantiation caused CSound to fail to output sound and to fail to yield any 
    warnings or error messages.  Would very much prefer to think this is not a real issue.  -- If this is a serious issue, it will likely necessitate minimal 
    state changes and real-time interaction through the MIDI input interface (rather than loading data on as synth program input through the CsScore section).
      ( This is likely the same issue as was found with CSoundObj.reset() )
*/
var csnd_instances = []
var initSynth = async function() {
  on(window, "unload", ()=>{
    for (let inst of csnd_instances) {
      inst.stop()
      inst.destroy()
    }
  })
  
  await CsoundObj.importScripts("lib/csound/")
}


var synths = {}
var synths_by_instName = {}

/*  A synth controller.
    This updates and configures and triggers synth programs, and manages synth resources
    
    Behavior is based on the params object, "operation":
      group_name:     group the synthesizer belongs to
      group_maxsize:  maximum number of synthezisers that should belong to the group (effectively maximum number of active sounds within a particular category)
      forced:         If set AND the synth group is full AND all group synths are active, the longest-running synth will be reset [and appropriated].
      program:        If set, a new synth program to apply
      config:         If set, a new configuration to apply
      score:          If set, a new score to apply
      play:           If set, synth playback will be triggered
      end:            Amount of seconds to wait after the last note is started before re-using a synth.
*/
var updateSynth = function(operation) {
  let gname = operation.group_name
  let gmax = operation.group_maxsize
  let forced = operation.forced
  let program = operation.program
  let config = operation.config
  let score = operation.score
  let play = operation.play
  let end = operation.end
  
  let synthset = synths[gname]
  if (!synthset) {
    synthset = synths[gname] = []
  }
  
  let synth
  
  // #1:  an existing inactive synth
  for (let i = 0; i < synthset.length; i++) {
    let _synth = synthset[i]
    if (_synth.broken) {
      synth = _synth
      synthset.splice(i,1)
      _synth.repair()
      break
    }
    else if (Date.now() >= _synth.endTime) {
      synth = _synth
      synth.off()
      synthset.splice(i,1)
      break
    }
  }
  
  if (!synth) {
    // #3:  an existing active synth (if flag to cancel a running synth is set)
    if (synthset.length >= gmax) {
      if (!forced) {
        return
      }
      synth = synthset.shift(1)
      synth.off()
      //synth.csound.reset()
    }
    // #2:  a new synth
    else {
      if (!synth) {
        synth = new Synth(undefined, end)
      }
    }
  }
  
  synthset.push(synth)
  
  if (program) {
    synth.program(program)
  }
  if (config) {
    synth.configure(config)
  }
  if (score) {
    synth.score = score
  }
  if (play) {
    synth.play()
  }
  return synth
}

var Synth = function(code, endLen) {
  this.instName = getUID()
  synths_by_instName[this.instName] = this
  this.csound = new CsoundObj()
  csnd_instances.push(this.csound)
  
  // A hack to try to cover up a bit of internal instability.
  // Subsequent changes seem to have cleaned up a few of the exceptions, but this will remain as-is for now.
  this.repair = function() {
    this.csound = new CsoundObj()
    this.csound.setMessageCallback(recvMessage)
    csnd_instances.push(this.csound)
    this.broken = false
  }
  
  let dummyID, endID
  
  this.program = function(code) {
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
    
    // Find the instrument with the highest ID
    //  The next ID is used for a dummy instrument  
    let maxID = 0
    let lines = code.split('\n')
    for (let line of lines) {
      let parts = line.split(/\s+/)
      if (parts[0] == "") {
        parts.shift(1)
      }
      if (parts[0] == "instr") {
        let id = Number.parseInt(parts[1])
        if (id > maxID) {
          maxID = id
        }
      }
    }

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
    
    dummyID = maxID + 1
    
    {
      let instrEndPos = code.indexOf("</CsInstruments>")
      code = `
        ${code.substring(0, instrEndPos)}
          instr ${dummyID}
          aOut = 0
          out aOut, aOut
          endin
        ${code.substring(instrEndPos)}
      `
    }
    // remove score and put it in a separate section
    let scorePos = code.indexOf("<CsScore>")
    //console.log(code)
    if (scorePos != -1) {
      let scoreEnd = code.indexOf("</CsScore>")
      score = code.substring(scorePos+9, scoreEnd)
      if (endLen) {
        setEnd(score)
        //score = addEndSentinel(score, endLen)
      }
      score = `
        i${dummyID} 3600 0
        ${score}
      `
      code = code.substring(0, scorePos) + code.substring(scoreEnd+10)
    }
    this.raw = code
    this.code = undefined
    this.score = score
    //console.log(scorePos, score)
  }
  
  let setEnd = (function(score) {
    let lines = score.split('\n')
    let end = 0
    for (let line of lines) {
      let parts = line.split(/\s+/)
      if (parts.length > 1) {
        let t = Number.parseFloat((parts[0] == "" ? parts[2] : parts[1]))
        if (t != undefined) {
          t = Number.parseFloat(t)
          if ((t > end) && (parts[0] != "i"+dummyID)) {
            end = t
          }
        }
      }
    }
    this.endTime = Date.now()+1000*(end+endLen)
  }).bind(this);
  
  
  // Tweak the synth program.
  //  params is a collection of params objects which contain properties which are to replace existing synth program properties
  //  The replacement operation searches for statements cointaining assignment operators 
  //    if such a statement is found and the text on the left matches an entry in the corresponsding params object, then the text on the right
  //    is replaced by the entry in the params object.
  //  Each params object:
  //    params.main:  Property setters to manipulate in general code (not part of any instrument)
  //    params[id]:   Property setters to manipulate in an instrument code block (everything between line "instr <id>" and the next line "endin")
  //
  // If there are multiple assignemnt statements for a given property, only the first one will be adjusted
  //
  //  At some point, a mechanism for duplicating [and altering] portions of synth code might be added 
  //    (mainly to allow arbitrary numbers of partials controlled by configuration)
  //
  //  ALSO:  If anything more complex is needed, write your own synth code.
  this.configure = function(params) {
    params = deepcopy(params)
    let lines = this.raw.split('\n')
    let block = params.main
    let altered = []
    for (let line of lines) {
      line = line.trim()
      let parts = line.split(/\s+/)
      let parname = parts[0].trim()
      switch(parname) {
        case "instr":
          block = params[parts[1]]
          break
        case "endin":
          block = params.main
          break
        default:
          if ( block && (parts[1] == "=") && (block[parts[0]] != undefined) ) {
            line = `${parname} = ${block[parname]}`
            delete block[parname]
          }
          break
      }
      altered.push(line)
    }
    this.code = altered.join('\n')
  }
  
  let state = "off"
  
  this.play = function(score) {
    try {
      if (score) {
        if (score.indexOf("<CsoundSynthesizer>") != -1) {
          this.program(score)
        }
        else {
          if (endLen) {
            setEnd(score)
          }
          //this.score = "\ni3000000 15 0\n" + score + "\n"
          
          this.score = `
            i${dummyID} 3600 0
            ${score}
          `
        }
      }
      switch(state) {
        case "playing":
          state = "off"
          this.csound.stop()
          
        case "off":
          if ((this.code == undefined) && (this.raw == undefined)) {
            throw new Error("Can not operate synthesizer because:  No synthesizer program is loaded")
          }
          else if (this.score == undefined) {
            throw new Error("Can not operate synthesizer because:  No sound to synthesize")
          }
          
          let program
          let programCSD
          
          if (this.code) {
            program = this.code
          }
          else {
            program = this.raw
          }
          let closeTagPos = program.indexOf("</CsoundSynthesizer>")
          programCSD = `${program.substring(0, closeTagPos)} <CsScore>${this.score}</CsScore> ${program.substring(closeTagPos)}`
          console.log(programCSD)
          this.csound.compileCSD(programCSD)
          this.csound.start()
          state = "playing"
          break
      }
    }
    catch (err) {
      console.log(err)
      console.trace()
      this.broken = true
      this.csound.destroy()
      csnd_instances.splice(csnd_instances.indexOf(this.csound),1)
    }
  }
  
  this.off = function() {
    try {
      state = "off"
      this.csound.stop()
      this.csound.reset()
    }
    catch (err) {
      console.log(err)
      console.trace()
      this.broken = true
      this.csound.destroy()
      csnd_instances.splice(csnd_instances.indexOf(this.csound),1)
    }
  }
  
  if (code) {
    this.program(code)
  }
}













