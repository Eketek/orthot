export { 
  configureTextDisplay, activateTextDisplay, deactivateTextDisplay, setTextDisplayLocale
}

import { clamp, centerElementOverElement } from '../libek/util.js'
import { on, next, NextEventManager } from '../libek/nextevent.js'

import { orthotCTL, renderCTL } from './orthot.js'

var TextDisplay, BeneathElement
var configureTextDisplay = function(textdisp, beneath) {
  TextDisplay = textdisp
  TextDisplay.opacity = 0
  BeneathElement = beneath
}

var LOCALE = "EN"
var setTextDisplayLocale = function(locale) {
  LOCALE = locale
}

var reposition = function() {
  centerElementOverElement(TextDisplay, BeneathElement)
}

// speed factor -- used by the deactivator to speed up a running text program so it can be closed sooner.
var speed = 1

// Ease the text-display opacity from its current value to a target value
//let opa = 0
var fade = async function(len, opa, targetOPA, elem) {
  if (elem == undefined) {
    elem = TextDisplay
  }
  if (len == 0) {
    opa = targetOPA
    elem.style.opacity = targetOPA
    return
  }  
  if (targetOPA < 0) {
    targetOPA = 0
  }
  else if (targetOPA > 1) {
    targetOPA = 1
  }  
  if (targetOPA == opa) {
    return
  }
  let startTime = Date.now()
  if (!elem.style) {
    return
  }
  elem.style.opacity = opa
  
  let time = Date.now()
  let end = time + len
  let incr = (targetOPA - opa) / len
  let pos = incr > 0
  
  while (time < end) {
    await next(orthotCTL.event, "frame")
    let ntime = Date.now()
    opa += (ntime-time)*incr*speed
    time = ntime
    if (pos) {
      if (opa > targetOPA) {
        break
      }
    }
    else {
      if (opa < targetOPA) {
        break
      }
    }
    elem.style.opacity = opa
  }
  opa = targetOPA
  elem.style.opacity = opa
}

// Wait some number of milliseconds
var delay = async function(len) {
  return new Promise( resolve => {
    setTimeout(()=>{
      resolve()
    }, len)
  })
}

var setText = function(txt) {
  TextDisplay.innerText = txt
  reposition()
}

// Properties to apply to the text
var resetStyle = function() {
  TextDisplay.style["background-color"] = "hsla(0,0%,100%,75%)"
  TextDisplay.style["border-color"] = "black"
  TextDisplay.style["border-width"] = 2
  TextDisplay.style["border-style"] = "solid"
  TextDisplay.style["max-width"] = "75%"
  TextDisplay.style["min-width"] = "10%"
  TextDisplay.style["min-height"] = ""
  TextDisplay.style["max-height"] = ""
  TextDisplay.style["padding"] = "4px"
  TextDisplay.style["font-family"] = "monospace"
}

var lockAndClear = function() {
}

// Search for a text matching a name
// Priority:  fixed-builtin > Content > General-builtin
// Localization can be accomplished by assigning locale designations to the texts (in the format <locale>-<name>)
var getText = function(name) {
  let lname = LOCALE + "-" + name
  let txt 
  txt = orthotCTL.fixedTexts[lname];if (txt) return txt
  txt = orthotCTL.fixedTexts[name];if (txt) return txt
  if (orthotCTL.gdatapack) {
    txt = orthotCTL.gdatapack[lname];if (txt) return txt
    txt = orthotCTL.gdatapack[name];if (txt) return txt
  }
  txt = orthotCTL.texts[lname];if (txt) return txt
  txt = orthotCTL.texts[name];if (txt) return txt
  return name
}

var toHtmlText = function(segment) {
  let r = ""
  for (let line of segment.texts) {
    let i = 2
    for (;i < line.length; i++) {
      if (line[i] != ' ') break
      r = r + '\u00A0'
    }
    r = r + line.substring(i) + "\n"
  }
  return r
}

var toTestText = function(block) {
  let testTXT = ""
  for (let seg of block.segments) {
    for (let line of seg.texts) {
      for (let i = 0;i < line.length; i++) {
        if (line[i] != ' ') break
        testTXT = testTXT + '\u00A0'
      }
      testTXT = testTXT + line.substring(2) + "\n"
    }
  }
  return testTXT
}

var autosize = function(block) {
  TextDisplay.innerText = toTestText(block)
  reposition()
  let bounds = TextDisplay.getBoundingClientRect()
  TextDisplay.style["min-width"] = bounds.width
  TextDisplay.style["max-width"] = bounds.width
  TextDisplay.style["min-height"] = bounds.height
  TextDisplay.style["max-height"] = bounds.height
  TextDisplay.innerText = ""
}

var busy = false
var running = false
var autocancel = false
var showing = false
var activateTextDisplay = async function(arg, successCB) {
  arg = getText(arg)
  if (busy) {
    if (successCB) {
      successCB(false)
      return
    }
    if (typeof(arg) == "object") {
      arg = toTestText(arg)
    }
    console.log(
      "------------------------------------------------------------------------------------------------------------------------\n"+
      "  TextDisplay is too busied displaying text to be busied displaying text.  \n"+
      "  Please instead read in your readout from the JavaScript console.         \n"+
      "------------------------------------------------------------------------------------------------------------------------\n\n\n",
      arg,
      "\n\n\n----------------------------------------------------------------------------------------------------------------------"
    )
    if (successCB) {
      successCB(false)
    }
    return
  }
  if (successCB) {
    successCB(true)
  }
  autocancel = false
  busy = true
  running = true
  showing = true
  speed = 1
  resetStyle()
  
  let numLines = 0
  
  let fadeinPromise = fade(750,0,1)
  
  if (typeof(arg) == "string") {
    setText(arg)
    //await fade(333, 0, 1)
  }
  else if (typeof(arg) == "object") {
    if (arg.isAnimText) {
      //console.log(`DISPLAYING ANIM-TEXT`, arg)
      //console.log(arg)
      autosize(arg)
      processBlock:
      for (let seg of arg.segments) {
        let cmdparts, cmd
        if (seg.command) {
          cmdparts = seg.command.split(' ')
          cmd = cmdparts[0]
        }
        else {
          cmd = ""
          cmdparts = []
        }
        cmdparts = cmdparts.slice(1)
        let textElem = document.createElement("div")
        textElem.innerText = toHtmlText(seg)
        
        switch(cmd) {
          case "":
            if (seg.texts.length == 0) break
          case "text":
            setText(toHtmlText(seg))
            if (arg.segments.length == 1) {
              TextDisplay.appendChild(textElem)
              await fade(100, 0, 1, textElem)
            }
            break
          case "fade": {
            let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
            let fadeTo = clamp(Number.parseFloat(cmdparts[0]), 0, 1)
            TextDisplay.appendChild(textElem)
            await fade(fadeTime, fadeTo, textElem)
          } break
          case "fadein": {
            let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
            TextDisplay.appendChild(textElem)
            await fade(fadeTime, 0, 1, textElem)
          } break
          case "fadeout": {
            let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
            textElem = TextDisplay.lastChild
            if (textElem) {
              await fade(fadeTime, 1, 0, textElem)
              TextDisplay.removeChild(textElem)
            }
            else {
              console.log("TextDisplay ERROR:  Nothing left to fade out!")
            }
          } break
        }
      }
    }
  }
  await fadeinPromise  
  if (autocancel) {
    await fadeoutTextDisplay()
  }
  running = false
}

var fadeoutTextDisplay = async function() {
  let fadeoutPromise = fade(750*speed, 1, 0)
  while (true) {
    let textElem = TextDisplay.lastChild
    if (!textElem) break
    if (!textElem.tagName) break
    await fade(60*speed, 1, 0, textElem)
    TextDisplay.removeChild(textElem)
  }
  await fadeoutPromise  
  TextDisplay.innerText = ""
  busy = false
  showing = false
}

var deactivateTextDisplay = async function() {
  if (!showing) {
    return
  }
  if (running) {
    speed = 4
    autocancel = true
  }
  else {
    fadeoutTextDisplay() 
  }
  //unapplyModifier()
}










