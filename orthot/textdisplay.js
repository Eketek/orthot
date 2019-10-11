export { configureTextDisplay, activateTextDisplay, deactivateTextDisplay, setTextDisplayLocale }

import { centerElementOverElement } from '../libek/util.js'
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

// Ease the text-display opacity from its current value to a target value
let opa = 0
var fade = async function(len, targetOPA) {
  if (len == 0) {
    opa = targetOPA
    TextDisplay.style.opacity = targetOPA
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
  
  let time = Date.now()
  let end = time + len
  let incr = (targetOPA - opa) / len
  let pos = incr > 0
  
  while (time < end) {
    console.log(time, end, opa)
    await next(orthotCTL.event, "frame")
    let ntime = Date.now()
    opa += (ntime-time)*incr
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
    TextDisplay.style.opacity = opa
  }
  opa = targetOPA
  TextDisplay.style.opacity = opa
}

// Wait some number of milliseconds
var delay = async function(len) {
  return new Promise( resolve => {
    setTimeout(()=>{
      resolve()
    }, len)
  })
}

// Properties to apply to the text
var baseModifier = {
  css:{
    "background-color":"hsla(0,0%,100%,75%)",
    "border-color":"black",
    "border-width":2,
    "border-style":"solid",
    "max-width":"75%",
    "min-width":"40%",
    "padding":"4px"
  }
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

let prevModifier
var applyModifier = async function(props) {
  if (props != baseModifier) {
    prevModifier = props
  }
  if (props.text) {
    // One additional layer of text lookup to allow for localization
    let _text = getText(props.text)
    if (typeof(_text) == "string") {
      TextDisplay.innerText = _text
    }
    else {
      TextDisplay.innerText = entry
    }
  }
  if (props.css) {
    for (let name in props.css) {
      TextDisplay.style[name] = props.css[name]
    }
  }
  reposition()
  if (props.fade) {
    await fade(props.fade, (props.opacity != undefined) ? props.opacity : 1)
  }
  else if (props.wait) {
    await delay(props.wait)
  }
}

var unapplyModifier = function() {
  if (prevModifier) {
    if (prevModifier.css) {
      for (let name in prevModifier) {
        TextDisplay.style[name] = ""
      }
      applyModifier(baseModifier)
    }
    prevModifier = undefined
  }
}

var activateTextDisplay = async function(arg) {
  arg = getText(arg)
  console.log(arg)
  await applyModifier(baseModifier)
  if (Array.isArray(arg)) {
    for (let i = 0; i < arg.length; i++) {
      let entry = arg[i]      
      if (typeof(entry) == "string") {
        // One additional layer of text lookup to allow for localization
        let _text = getText(enrty)
        if (typeof(_text) == "string") {
          TextDisplay.innerText = _text
        }
        else {
          TextDisplay.innerText = entry
        }
        reposition()
        if (i == 0) {
          await fade(333, 1)
        }
      }
      else {
        await applyModifier(entry)
      }
    }
  }
  else {
    TextDisplay.innerText = arg
    reposition()
    await fade(3033, 1)
  }
}

var deactivateTextDisplay = async function() {
  await fade(333, 0)
  unapplyModifier()
}










