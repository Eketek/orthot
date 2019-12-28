export { next, on, NextEventManager, time }

/*
NextEvent -- A micro-framework which provides an alternative JS event handling interface.

NextEvent wraps and augments the JavaScript Event interface.  It offers five major features:
  Event combination - This can accepts a list of EventTargets and event names, treating them as a single (logically grouped) event.
  Shortcuts / Presets - This can listen for a variety of specific mouse and keyboard buttons and treat them as distinct events ("RightClick", "mmb", "a_down", etc.).
  Async/await ingegration - A "next" function which sets up a transient event listener and returns the first matched event to an async function.
  Callback integration - An "on" function which sets up a persistent event listener and returns all matched events to a callback.
  Universal mouse tracking - If an EventTarget is a DOM Element, the mouse position relative to it will be attached to the Event (for all event types)

For both functions ("on" and "next"):
  Both functions are variadic functions, though they also can accept arrays (internally, the input gets flattened and treated as a single array).
  If the last argument in the list is a function, then it gets separated fromt he list and treated as an Event listener callback.
  The rest of the arguments are a list of space-delimited strings and EventTargets.  If it finds any jquery objects, the unrelying DOM object gets unpacked and
  used as an EventTarget.  Each string gets split by space chars.

  All String and EventTarget inputs are then processed in sequence.  If the first entry in the list is not an EventTarget, then the top-level html document
  will be used.  Strings which appear subsequently in the list get interpreted as event specifications (see below for details) to be applied to the EventTarget,
  until either the next EventTarget or the end of the list is reached.

Event Specification:
  <EventType>* - Listen for any named event
  <KeyboardEventType>:<buttons>* - Listen for a KeyboardEvent with a Key matching <buttons> (see below)
  .<Buttons> - Shorthand specification for a "keydown" KeyboardEvent with a Key matching any character literal present in <buttons>
        (except for ' ', which must be separated and spelled out)
  <Preset> - various keyboard and mouse buttons (see NEXT__DEFAULT_CONFIG.Presets)

  (*) vname
  Optionally, a virtual name *(event.vname) may be appended to any event specificaiton.  This is an alternate name that gets assigned to Event.vname property
  to make it easier to distinguish events (particularly when events of differing types are combined into a single listener (such as listening for both mouse
  movement and keyboard arrow buttons in the same place)
  If not specified, a default vname is assigned:
    for keyboard events, it will be whichever character from the event parameters was matched by Event.key,
    for mouse clicks, it will be the string that declared the event type (useful with the button-specific handling).
      (Mouse and keyboard event handling is not case sensitive, but will return a vname which reflects the input casing).
    for anything else, this will be the EventType.

There is also a special preset named "release", which [attempts to] match an input button-down/click event with an expected button-up/release event.  This is
intended to make it a lot easier to implement User-configurable buttons.
The general format for this is as follows:
  release:<type>*<vname>
  <type> is a key or mousebutton or preset indicator (this may even be a <whatever>_down indicator).
  *<vname> just a vname -- if not specified, defaults to "release", regardless of what any referenced presets use.

Universal mouse tracking:
  For all events that pass through NextEvent, if the "request target" is a DOM element, the local mouse position (relative to the request target) is added
  to the event.  Properties will be Event.reqtargetX and Event.reqtargetY.

  recent_mevt:       Most recent mousemove event
  reqtarget_bounds:  requestTarget.getBoundingClientRect()
  Event.reqtargetX:  recent_mevt.pageX - window.scrollX - reqtarget_bounds.x,
  Event.reqtargetY:  recent_mevt.pageY - window.scrollY - reqtarget_bounds.y,

usage:

  // Wait until the mouse cursor moves
  await next("mousemove")

  // Wait until A_DOM_Element is clicked
  await next(A_DOM_Element, "click")

  // Wait until the "Enter", "Shift", or "X" button is pressed and assign the matched event to 'event'
  event = await next("Enter", "x", "Shift")

  // wait until the "w", "a", "s", or "d" key is released and assign the matched event to 'event'
  event = await next("keyup:wasd")

  // wait until an "upper-right-ward" position is clicked
  await next("click", (evt)=>{return evt.clientX>evt.clientY} )

  // set up a persistent callback which is triggered by right clicks on A_DOM_Element
  on(A_DOM_Element, "rightclick", ()=>{ ... })

  // set up a transient callback which is triggered by [only] the next right click on A_DOM_Element
  next(A_DOM_Element, "rightclick", ()=>{ ... })



  // Have the handler listen for a click, then pass the click event to a suspended async function, then auto-cancel.
  handler.next("click")

  // Have the handler listen for a click, then pass it to a callback, then auto-cancel
  handler.on("click", ()=>{ ... })


  //set up a persistant event handler
  handler = new NextEventManager()
  handler.persistent = true

  // Have the handler listen for clicks, wait for three of them to be passed back, then set it to listen for a right click and wait for one,
  // then programatically cancel it.
  await handler.next("click")
  await handler.next()
  await handler.next()
  handler.next("rclick")
  handler.cancel()

  // Have the handler listen for click, then pass them to a callback, without auto-cancelling
  handler.on("click", ()=>{ ... })

*/

var NEXT__DEFAULT_CONFIG = {

  // Initial EventTarget to listen to each time next() is called
  MainEventTarget:document,

  // separator characters for parsing event specifications.
  EventEntrySeparator:' ',    // separate individual event entries within an event specfication
  EventDataSeparator:':',     // separates event name from pseudo-event arguments
  EventVnameSeparator:'*',    // separates a vname assignment from pseudo-event arguments

  // Event handling presets for targetting individual buttons.
  //   To reduce the amount of code, copies of a preset which differ only by name are combined and separated back out at runtime.
  //     If present, *<whatever> is appended to each entry,
  //     If present, ?<whatever> is appended to duplicates of each entry
  //
  //   Preset properties:
  //   eventtype - Actual event name
  //   button - the mouse button number (same as MouseEvent.button)
  //   vname - specifies what to set Event.vname to.
  //           If "name", use the string which matched the preset (matching is not case sensitive) (common/mouse case)
  //           If "setting", use the exact name of the preset. (unused)
  //           If "arg", use event parameters (unused)
  //           [For keyboard] If "matched", use the exact text which was matched by Event.key (common/keyboard case)
  //   key - [For keyboard] Specifies which keyboard button(s) to listen for
  //         If "arg", use Event params (common case)
  //         If "setting", use the exact name of the preset. (semi-common - used for named/special keys)
  //         If "name", use the string which matched the preset (unused, probably not necessesary)
  //         Otherwise, use preset.key directly
  //  ignore_keycase - [for keyboard] If true, letter casing is ignored when comparing Event.key with the specified key(s)
  //  exact - [for keyboard] forces a the Event.key-specified key comparison to buse 'evtkey==key' instead of 'key.indexOf(evtkey) != -1'
  Presets:{
    "lclick,leftclick,lmb,mb1,mousebutton1":{eventtype:"mousedown", button:0, vname:"name"},
    "mclick,middleclick,mmb,mb2,mousebutton2":{eventtype:"mousedown", button:1, vname:"name"},
    "rclick,rightclick,rmb,mb3,mousebutton3":{eventtype:"mousedown", button:2, vname:"name"},
    "mb4,mousebutton4":{eventtype:"click", button:3, vname:"name"},
    "mb5,mousebutton5":{eventtype:"click", button:4, vname:"name"},

    "left,lmb,mb1,mousebutton1 *_click":{eventtype:"mousedown", button:0, vname:"name"},
    "middle,mmb,mb2,mousebutton2 *_click":{eventtype:"mousedown", button:1, vname:"name"},
    "right,rmb,mb3,mousebutton3 *_click":{eventtype:"mousedown", button:2, vname:"name"},
    "mb4,mousebutton4 *_click":{eventtype:"click", button:3, vname:"name"},
    "mb5,mousebutton5 *_click":{eventtype:"click", button:4, vname:"name"},

    "left,lmb,mb1,mousebutton1 *_down":{eventtype:"mousedown", button:0, vname:"name"},
    "middle,mmb,mb2,mousebutton2 *_down":{eventtype:"mousedown", button:1, vname:"name"},
    "right,rmb,mb3,mousebutton3 *_down":{eventtype:"mousedown", button:2, vname:"name"},
    "mb4,mousebutton4 *_down":{eventtype:"mousedown", button:3, vname:"name"},
    "mb5,mousebutton5 *_down":{eventtype:"mousedown", button:4, vname:"name"},

    "left,lmb,mb1,mousebutton1 *_up":{eventtype:"mouseup", button:0, vname:"name"},
    "middle,mmb,mb2,mousebutton2 *_up":{eventtype:"mouseup", button:1, vname:"name"},
    "right,rmb,mb3,mousebutton3 *_up":{eventtype:"mouseup", button:2, vname:"name"},
    "mb4,mousebutton4 *_up":{eventtype:"mouseup", button:3, vname:"name"},
    "mb5,mousebutton5 *_up":{eventtype:"mouseup", button:4, vname:"name"},

    "Escape,Alt,Control,Shift,CapsLock,Tab,Backspace,Delete,Insert,Enter,Home,End,PageUp,PageDown,ArrowUp,ArrowDown,ArrowLeft,ArrowRight,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12 ?_down":
        {eventtype:"keydown", key:"setting", vname:"name", exact:true, target:document},

    "Escape,Alt,Control,Shift,CapsLock,Tab,Backspace,Delete,Insert,Enter,Home,End,PageUp,PageDown,ArrowUp,ArrowDown,ArrowLeft,ArrowRight,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12 *_up":
        {eventtype:"keyup", key:"setting", vname:"name", exact:true, target:document},
    "Space ?_down":{eventtype:"keydown", key:" ", vname:"name", target:document},
    "Space *_up":{eventtype:"keyup", key:" ", vname:"name", target:document},

    "arrows,arrows_down":{eventtype:"keydown", key:"list", keylist:["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"], vname:"matched", target:document},
    "arrows_up":{eventtype:"keyup", key:"list", keylist:["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"], vname:"matched", target:document},

    "release":{eventtype:"*up", vname:"release"},

    "":{eventtype:"keydown", key:"arg", vname:"matched", ignore_keycase:true, target:document },

    keydown:{eventtype:"keydown", key:"arg", vname:"matched", ignore_keycase:true, target:document},
    keyup:{eventtype:"keyup", key:"arg", vname:"matched", ignore_keycase:true, target:document},
  },

  Release:{
    mousedown:"mouseup",
    click:"mouseup",
    keydown:"keyup"
  },

  // Define handling for the simplest event specifications ( "a" -> "A" button down, " _up" -> Space button released)
  SingleCharPreset:{eventtype:"keydown", key:"name", vname:"matched", ignore_keycase:true, target:document},
  SingleCharDownPreset:{eventtype:"keydown", key:"name", vname:"matched", ignore_keycase:true, target:document},
  SingleCharUpPreset:{eventtype:"keyup", key:"name", vname:"matched", ignore_keycase:true, target:document},

  // Used to determine whether or not to look at event.key for a keyboard event or event.button for a mouse event
  UsesKeyboard:{ keyup:true, keydown:true, keypressed:true },
  UsesMouseButtons:{ click:true, mousedown:true, mouseup:true },

  Alphanumeric:"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
}

var mpvx = 0
var mpvy = 0

NEXT__DEFAULT_CONFIG.MainEventTarget.addEventListener("mousemove", (evt)=>{
  mpvx = evt.pageX - window.scrollX
  mpvy = evt.pageY - window.scrollY
})

var NextEventManager = function() {
  let cfg = NEXT__DEFAULT_CONFIG

  // Set this to true if the EventManager should retain its EventListeners when invoked (this is for setting up callbacks)
  this.persistent = false;

  // Set to true if the top-level document object is the preffered EventTarget for all keyboard events
  //  (This is intended to for use with universal mouse tracking if when multiple DOM elements are in use)
  this.useEventTargetOverrides = false

  // expand shorthand presets
  let _presets = {}
  if (!cfg.PROCESSED) {
    cfg.PROCESSED = true
    for (let k in cfg.Presets) {
      let parts = k.split(' ', 2)

      let suffix = ""
      let suffix_optional = false

      if (parts.length == 2) {
        suffix = parts[1]
        if (suffix[0] == '*') {
          suffix = suffix.slice(1)
        }
        else if (suffix[0] == '?') {
          suffix_optional = true
          suffix = suffix.slice(1)
        }
      }

      parts = parts[0].split(',')
      for (let name of parts) {
        let lc_name = name.toLowerCase()

        let presetCopy = Object.assign( {}, cfg.Presets[k] )
        presetCopy.settingName = name+suffix
        _presets[lc_name+suffix] = presetCopy

        if (suffix_optional) {
          let alt_presetCopy = Object.assign( {}, cfg.Presets[k] )
          alt_presetCopy.settingName = name
          _presets[lc_name] = alt_presetCopy
        }
      }
    }
    cfg.Presets = _presets
    window.ncfg = cfg
  }

  let getPreset = function(evttype, lc_evttype) {
    //console.log("get-preset...", evttype, lc_evttype)
    let pr
    if (evttype.length == 1) {
      pr = cfg.SingleCharPreset
    }
    else if ( (evttype.length == 6) && evttype.endsWith("_down") ) {
      pr = cfg.SingleCharDownPreset
    }
    else if ( (evttype.length == 3) && evttype.endsWith("_up") ) {
      pr = cfg.SingleCharUpPreset
    }
    else {
      pr = cfg.Presets[lc_evttype]
    }

    if (pr == undefined) {
      if (cfg.Alphanumeric.indexOf(lc_evttype[0]) == -1) {
        pr = cfg.SingleCharPreset
      }
    }
    return pr
  }

  //console.log(cfg)

  this.RECV = undefined
  let cmd
  let evt_info = []

  // send an arbitrary message to the listener
  this.sendMSG = function(MSG) {
    if (this.RECV) {
      this.RECV(MSG)
    }
  }

  // cancel the event handler and optionally send an arbitrary message to the listener
  this.cancel = function(cancelMSG) {
    for (let entry of evt_info) {
      entry[0].removeEventListener(entry[1], entry[2])
    }
    evt_info = []
    cmd = undefined
    if (cancelMSG && this.RECV) {
      this.RECV(cancelMSG)
    }
  }

  let out = (function(_evt, reqTarget) {

    // if the event target is a DOM object, but the preset dictates that the event had to be obtained from something else,
    //  add the local mouse position [relative to the "request-target" DOM element]   ("Event.reqtargetX"and "Event.reqtargetY")
    if (reqTarget.getBoundingClientRect) {
      let tvb = reqTarget.getBoundingClientRect()
      _evt.reqtargetX = mpvx-tvb.x
      _evt.reqtargetY = mpvy-tvb.y
      //console.log("ADDED LOCAL MOUSE POSITION", [_evt.reqtargetX, _evt.reqtargetY], [_evt.clientX, _evt.clientY], "TO EVENT", _evt)
    }

    if (cmd) {
      if (this.RECV) {
        this.RECV(cmd(_evt))
      }
      else {
        cmd(_evt)
      }
    }
    else if (this.RECV) {
      this.RECV(_evt)
    }
    if (!this.persistent) {
      this.cancel()
    }
  }).bind(this);

  this.on = function(... args) {
    args = flatten(args)
    let req_target = cfg.MainEventTarget
    if (evt_info.length != 0) {
      this.cancel()
    }

    cmd = args[args.length-1]
    if (typeof(cmd) == "function") {
      args.pop()
    }
    else {
      cmd = undefined
    }

    for (let i = 0; i < args.length; i++) {
      let arg = args[i]
      //let test = undefined
      switch(typeof(arg)) {
        //case "function":
        //  test = arg
        //break
        case "object":
          // If a jquery object, unwrap it...  Does jquery wrap anything other than DOM elements?
          if (arg.jquery && (arg.length > 0)) {
            arg = arg[0]
          }
          //It is EventTarget enough if it has addEventListener()
          if (arg.addEventListener) {
            req_target = arg
          }
        break
        case "string":
          let entries = arg.split(cfg.EventEntrySeparator)
          for (let j = 0; j < entries.length; j++) {
            let _req_target = req_target
            let entry = entries[j]

            // Hack to allow " *exit" to be handled as "Space*exit"
            //    (and thus to allow a vname override to be included in a single-char shorthand for the space key)
            if (entry == "") {
              if (j == entries.length-1) {
                break
              }
              j++
              entry = " " + entries[j]
            }
            let parts = entry.split(cfg.EventVnameSeparator,2)
            let vname = parts[1]

            parts = parts[0].split(cfg.EventDataSeparator,2)
            let evttype = parts[0]
            let evtparams = parts[1]

            let lc_evttype = evttype.toLowerCase()
            //let evtparams = evttype

            let preset = getPreset(evttype, lc_evttype)

            let listener
            let actual_evttype, actual_button, actual_key

            let actual_evttarget = _req_target

            // If a preset is matched, use a pre-defined event handler
            if (preset) {
              actual_evttype = preset.eventtype
              actual_button = preset.button
              actual_key = preset.key

              if (actual_evttype == "*up") {
                if (vname == undefined) {
                  vname = preset.vname
                }
                let release_evttype = cfg.Release[evtparams.toLowerCase()]
                if (release_evttype) {
                  evttype = release_evttype
                  preset = undefined
                }
                else {
                  let vpreset = getPreset(evtparams, evtparams.toLowerCase())
                  //console.log(
                  if (!vpreset) {
                    throw new Error("No release-type event known for '" + entry + "'")
                  }
                  let release_evttype = cfg.Release[vpreset.eventtype]
                  if (!release_evttype) {
                    throw new Error("No release-type event known for '" + entry + "'")
                  }
                  //console.log(vpreset)
                  //console.log(evtparams)
                  actual_evttype = release_evttype
                  actual_button = vpreset.button
                  actual_key = vpreset.key
                  preset = vpreset
                }
              }
            }
            if (preset) {
              if (this.useEventTargetOverrides && preset.target) {
                actual_evttarget = preset.target
              }
              let uses_keyboard = cfg.UsesKeyboard[actual_evttype]
              let uses_mousebtns = cfg.UsesMouseButtons[actual_evttype]

              listener = function(evt) {
                //let _test = test
                let listenkey
                let evtkey
                let matched
                let _listenkey
                // If a keypress event, compare the Event.key with the key or keyset defined by the preset
                if (uses_keyboard) {
                  evtkey = evt.key
                  if (preset.key == "arg") {
                    listenkey = evtparams
                  }
                  else if (preset.key == "name") {
                    listenkey = evttype
                  }
                  else if (preset.key == "setting") {
                    listenkey = preset.settingName
                  }
                  else if (preset.key == "list") {
                    let mi = preset.keylist.indexOf(evtkey)
                    if (mi == -1) {
                      return
                    }
                    else {
                      matched = evtkey
                    }
                  }
                  else {
                    listenkey = actual_key
                  }
                  _listenkey = listenkey

                  if (listenkey || evtparams) {
                    if (preset.ignore_keycase) {
                      evtkey = evtkey.toLowerCase()
                      listenkey = listenkey.toLowerCase()
                    }

                    if (preset.exact) {
                      if (listenkey == evtkey) {
                        matched = _listenkey
                      }
                      else {
                        return
                      }
                    }
                    else if (evtkey.length == 1) {
                      if ( !listenkey || (listenkey.indexOf(evtkey) == -1 ) ) {
                        return
                      }
                      else {
                        let mi = listenkey.indexOf(evtkey)
                        matched = _listenkey.substring(mi, mi+evtkey.length)
                      }
                    }
                    else {
                      return
                    }
                  }

                  // If no listenkey was defined by the preset no params where passed in, use generic event handling as a fallback
                  else if (!matched) {
                    matched = evttype
                  }
                }
                // If a mouseclick event, compare Event.button with preset.button
                else if (uses_mousebtns) {
                  evt.preventDefault()
                  if (evt.button != actual_button) {
                    return
                  }
                  else {
                  }
                }
                //if (_test && !_test(evt)) {
                //  return
                //}

                if (vname) {
                  evt.vname = vname
                }
                else if (preset.vname == "name") {
                  evt.vname = evttype
                }
                else if (preset.vname == "arg") {
                  evt.vname = evtparams
                }
                else if (preset.vname == "matched") {
                  evt.vname = matched
                }
                else if (preset.vname == "setting") {
                  evt.vname = preset.settingName
                }
                else {
                  evt.vname = preset.vname
                }
                out(evt, _req_target)
              }
            }

            // If not preset, use a generic event handler
            else {
              actual_evttype = evttype
              let uses_keyboard = cfg.UsesKeyboard[actual_evttype]
              let uses_mousebtns = cfg.UsesMouseButtons[actual_evttype]

              listener = function(evt) {
                //let _test = test

                //if (_test && !_test(evt)) {
                //  return
                //}
                if (vname) {
                  evt.vname = vname
                }
                else {
                  evt.vname = evttype
                }
                out(evt, _req_target)
              }
            }

            //console.log([_req_target, actual_evttype, listener, preset])
            evt_info.push([_req_target, actual_evttype, listener])
            actual_evttarget.addEventListener(actual_evttype, listener)
          }
        break
      }
    }
  }

  this.next = async function(... args) {
    if (args.length != 0) {
      this.on(args)
    }
    return new Promise(resolve => {
      this.RECV = function(val) {
        resolve(val)
      }
    })
  }

}

// recursively un-nest an array and return it.
var flatten = function(arr, levels=1000) {
  let r = []
  let doFlatten = function(arr, level) {
    for (let v of arr) {
      if (Array.isArray(v) && level > 0) {
        doFlatten(v, levels-1)
      }
      else {
        r.push(v)
      }
    }
  }
  if (Array.isArray(arr)) {
    doFlatten(arr, levels)
  }
  else {
    r.push(arr)
  }
  return r
}

/* Capture the first matching event and pass it to code which is suspended by await.
   OR
   Capture the first matching event and pass it to a transient event listener (callback).

   If the last argument is a function, then the last argument is the transient event listener callback.
   If a transient event listener is present, the triggering event will be passed to the event listener, then the event listener's output will be passed
    back to any code suspended by an await keyword.
   If no transient event listener is present, then the triggering event will be passed directly back to any code suspended by an await keyword
*/
var next = async function(... args) {
  let evtman = new NextEventManager(false)
  evtman.on(args)
  return evtman.next()
}

/* Set up a persistant event handler.

   All triggering events will be passed to the event listener.
   This returns a the event handler (which may be used to cancel the event)
*/
var on = async function(... args) {
  let evtman = new NextEventManager()
  evtman.persistent = true
  evtman.on(args)
  return evtman
}

var time = async function(t, cb) {
  if (cb) {
    setTimeout(cb, t)
  }
  else {
    return new Promise(resolve => {
      setTimeout(resolve, t)
    })
  }
}

if (true && window) {
  window.on = on
  window.next = next
  window.time = time
}

