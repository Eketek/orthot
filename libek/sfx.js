export { sfxGlobals, setCommonScale, playSound }

// This is used for coordination between sound effects and music.  For now, this is only used for consistant tonality.
var sfxGlobals = {
  scale:undefined,
  fundamental:1
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
  categoryPresets[category] = {
    group_name:category,
    group_maxsize:max_concurrency,
    program:synthProgram,
    defs:synthDefs,
    config:synthConfig,
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










