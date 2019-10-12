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

let NBSP = "\u00A0"
var LOCALE = "EN"
var setTextDisplayLocale = function(locale) {
  LOCALE = locale
}


var reposition = function() {
  centerElementOverElement(TextDisplay, BeneathElement)
}

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
    opa += (ntime-time)*incr
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
  TextDisplay.style["min-width"] = "0px"
  TextDisplay.style["max-width"] = "75%"
  TextDisplay.style["min-height"] = "0px"
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
      r = r + NBSP
    }
    r = r + line.substring(i) + "\n"
  }
  return r
}

var toTestText = function(block) {
  let testTXT = ""
  for (let seg of block.segments) {
    if (seg.command == ".") {
      testTXT = testTXT + "\n"
    }
    for (let line of seg.texts) {
      //for (let i = 0;i < line.length; i++) {
      //  if (line[i] != ' ') break
      //  testTXT = testTXT + '\u00A0'
      //}
      testTXT = testTXT + line.substring(2) + "\n"
    }
  }
  return testTXT
}

var autosize = function(block) {
  TextDisplay.innerText = toTestText(block)
  reposition()
  let bounds = TextDisplay.getBoundingClientRect()
  TextDisplay.style["max-width"] = bounds.width
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
  resetStyle()
  
  let numLines = 0
  
  let fadeinPromise = fade(750,0,1)
  
  if (typeof(arg) == "string") {
    setText(arg)
    //await fade(333, 0, 1)
  }
  else if (typeof(arg) == "object") {
    if (arg.isAnimText) {
      let block = arg
      autosize(block)
      processSegments:
      for (let seg of block.segments) {
        if (autocancel) {
          break
        }
        let space = block.space
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
        let textElem
        if (seg.texts.length > 0) {
          textElem = document.createElement("div")
          textElem.innerText = toHtmlText(seg)
        }
        switch(cmd) {
          case "force-nbsp": {
            if (block.space == NBSP) {
              continue processSegments
            }
            block.space = NBSP
            space = NBSP
            for (let _seg of block.segments) {
              for (let i = 0; i < _seg.texts.length; i++) {
                let line = "";
                for (let char of _seg.texts[i]) {
                  if (char == ' ') {
                    line = line + NBSP
                  }
                  else {
                    line = line + char
                  }
                }
                _seg.texts[i] = line
              }
            }
          } break
          case "":
            if (seg.texts.length == 0) break
          case "text": {
            if (textElem) {
              setText(toHtmlText(seg))
              if (block.segments.length == 1) {
                TextDisplay.appendChild(textElem)
                await fade(100, 0, 1, textElem)
              }
            }
          } break
          case '.':
            TextDisplay.appendChild(document.createElement("br"))
            if (textElem) {
              TextDisplay.appendChild(textElem)
            }
            break
          case "wait": {
            let waitTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
            await delay(waitTime)
            if (textElem) {
              TextDisplay.appendChild(textElem)
            }
          } break
          case "fade": {
            if (textElem) {
              let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
              let fadeTo = clamp(Number.parseFloat(cmdparts[0]), 0, 1)
              TextDisplay.appendChild(textElem)
              await fade(fadeTime, fadeTo, textElem)
            }
          } break
          case "fadein": {
            if (textElem) {
              let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
              TextDisplay.appendChild(textElem)
              await fade(fadeTime, 0, 1, textElem)
            }
          } break
          case "fadeout": {
            if (textElem) {
              let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 15000)
              textElem = TextDisplay.lastChild
              if (textElem) {
                await fade(fadeTime, 1, 0, textElem)
                TextDisplay.removeChild(textElem)
              }
              else {
                console.log("TextDisplay ERROR:  Nothing left to fade out!")
              }
            }
          } break
          case "fadeinwords": {
            if (textElem) {
              let elem
              let fadeTime = clamp(Number.parseFloat(cmdparts[0]), 0, 1000)
              textElem.innerText = ""
              TextDisplay.appendChild(textElem)
              for (let i = 0; i < seg.texts.length; i++) {
                let line = seg.texts[i]
                line = line.substring(2)
                let word = ""
                for (let c of line) {
                  if (autocancel) {
                    break processSegments
                  }
                  switch(c) {
                    default:
                      word = word + c
                      break
                    case space:
                      if (word.trim() != "") {
                        elem = document.createElement("span")
                        elem.innerText = word
                        textElem.appendChild(elem)
                        await fade(fadeTime, 0, 1, elem)
                        word = ""
                      }
                      word = word + space
                      break
                  }
                }
                if (word.trim() != "") {
                  elem = document.createElement("span")
                  elem.innerText = word
                  textElem.appendChild(elem)
                  await fade(fadeTime, 0, 1, elem)
                  word = ""
                }
                if (i != seg.texts.length-1) {
                  elem = document.createElement("br")
                  textElem.appendChild(elem)
                }
              }
            }
          } break
          case "stairwords": {
            let dir = cmdparts[0]
            let fadeTime = clamp(Number.parseFloat(cmdparts[1]), 0, 1000)
            textElem.innerText = ""
            TextDisplay.appendChild(textElem)
            let words = seg.texts[0]
            //console.log(seg)
            if (!words) break
            words = words.substring(2)
            words = words.split(space)
            //console.log(words)
            let spaces = ""
            let elems = []
            for (let i = 0; i < words.length; i++) {
              let wordElem = document.createElement("div")
              elems.push(wordElem)
              wordElem.style.opacity = 0
              wordElem.innerText = spaces + words[i]
              spaces = spaces + NBSP.repeat(words[i].length+1)
              //console.log(space+words[i], '|' + space + nbsp.repeat(words[i].length+1) + '|')
              //console.log(dir, wordElem)
              if (dir.toLowerCase() == "up") {
                //console.log("prepend?")
                textElem.insertBefore(wordElem, textElem.firstChild)
              }
              else {
                //console.log("append?")
                textElem.appendChild(wordElem)
              }
            }
            for (let i = 0; i < words.length; i++) {
              await fade(fadeTime, 0, 1, elems[i])
              if (autocancel) {
                break processSegments
              }
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
  let fadeoutPromise = fade(750, 1, 0)
  let wantAmt = 750/TextDisplay.childNodes.length
  while (true) {
    let textElem = TextDisplay.lastChild
    if (!textElem) break
    if (!textElem.tagName) break
    await fade(30, 1, 0, textElem)
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
    autocancel = true
  }
  else {
    fadeoutTextDisplay() 
  }
  //unapplyModifier()
}










