
/*  A system for reading DOM events with coroutine-type code 
      (a more reasonable alternative to registering a bunch of callbacks and maintaining extra state). 
*/
libek.event = {    
  Manager:function(evt_target){
  
  
    this.EventReaders = []
    //this.DownKeys = {}   
    
      //console.log(this)
    
    this.addReader = function(reader) {
      this.EventReaders.push(reader)
      this.EventReaders.sort(function(a,b) {
        return a-b
      })
    }
    
    this.removeReader = function(reader) {
      this.EventReaders.splice(this.EventReaders.indexOf(reader), 1)        
    }
    
    let _this = this
    
    let reset_keystate_store = function() {
      _this.DownKeys = {
        get Shift() { return _this.DownKeys.ShiftLeft | _this.DownKeys.ShiftRight },
        get Alt() { return _this.DownKeys.AltLeft | _this.DownKeys.AltRight },
        get Control() { return _this.DownKeys.ControlLeft | _this.DownKeys.ControlRight },
      }
    }
    reset_keystate_store()
  
    let recent_mbtns = 0
    
    this.mpos = new THREE.Vector2()
  
    let recv_event = function(evt) {
      _this.dispatch_libek_event(evt.type)
    }
    let recv_keydown = function(evt) {
      if (evt.repeat) return
      let kname = evt.code
      _this.DownKeys[kname] = true
      _this.dispatch_libek_event( kname + "_down", evt.key )
      
      //console.log(evt)
    }
    let recv_keyup = function(evt) {
      let kname = evt.code
      _this.DownKeys[kname] = false
      _this.dispatch_libek_event( kname + "_up", evt.key)
    }
    
    let recv_focusout = function(evt) {
      _this.dispatch_libek_event(evt.type)
      //DownKeys = {}
      
      reset_keystate_store()
    }      
    
    let mbnames = ["lmb", "mmb", "rmb", "m4", "m5"]
    
    let recv_mousedown = function(evt) {
      _this.dispatch_libek_event( mbnames[evt.button] + "_down" , _this.mpos)
    }
    let recv_mouseup = function(evt) {
      _this.dispatch_libek_event(mbnames[evt.button] + "_up", _this.mpos)
    }
    let recv_mousemove = function(evt) {
      _this.mpos.x =  ((evt.pageX - evt.target.offsetLeft) / evt.target.clientWidth) * 2 - 1
      _this.mpos.y = -((evt.pageY - evt.target.offsetTop)  / evt.target.clientHeight) * 2 + 1   
      
      _this.dispatch_libek_event("mousemove", _this.mpos)
    }
    
    let recv_mousewheel = function(evt) {
      //console.log(evt)
      //mpos.x =  ((evt.pageX - evt.target.offsetLeft) / evt.target.clientWidth) * 2 - 1
      //mpos.y = -((evt.pageY - evt.target.offsetTop)  / evt.target.clientHeight) * 2 + 1   
              
      _this.dispatch_libek_event( evt.deltaY > 0 ? "mousewheel_pos" :"mousewheel_neg")
      _this.dispatch_libek_event("mousewheel", new THREE.Vector3(evt.deltaX, evt.deltaY, evt.deltaZ) )
    }
    
    let recv_mousein = function(evt) {
      
      _this.mpos.x =  ((evt.pageX - evt.target.offsetLeft) / evt.target.clientWidth) * 2 - 1
      _this.mpos.y = -((evt.pageY - evt.target.offsetTop)  / evt.target.clientHeight) * 2 + 1  
      
      _this.dispatch_libek_event("mousein", _this.mpos)
      
      if (recent_mbtns != evt.buttons) {
        if ( (recent_mbtns & 1) && !(evt.buttons & 1) ) {
          _this.dispatch_libek_event("lmb_up", _this.mpos)
        }
        else if ( !(recent_mbtns & 1) && (evt.buttons & 1) ) {
          _this.dispatch_libek_event("lmb_down", _this.mpos)
        }
        if ( (recent_mbtns & 2) && !(evt.buttons & 2) ) {
          _this.dispatch_libek_event("rmb_up", _this.mpos)
        }
        else if ( !(recent_mbtns & 2) && (evt.buttons & 2) ) {
          _this.dispatch_libek_event("rmb_down", _this.mpos)
        }
        if ( (recent_mbtns & 4) && !(evt.buttons & 4) ) {
          _this.dispatch_libek_event("mmb_up", _this.mpos)
        }
        else if ( !(recent_mbtns & 4) && (evt.buttons & 4) ) {
          _this.dispatch_libek_event("mmb_down", _this.mpos)
        }
        if ( (recent_mbtns & 8) && !(evt.buttons & 8) ) {
          _this.dispatch_libek_event("mb4_up", _this.mpos)
        }
        else if ( !(recent_mbtns & 8) && (evt.buttons & 8) ) {
          _this.dispatch_libek_event("mb4_down", _this.mpos)
        }
        if ( (recent_mbtns & 16) && !(evt.buttons & 16) ) {
          _this.dispatch_libek_event("mb5_up", _this.mpos)
        }
        else if ( !(recent_mbtns & 16) && (evt.buttons & 16) ) {
          _this.dispatch_libek_event("mb5_down", _this.mpos)
        }
      }
    }
    let recv_mouseout = function(evt) {
      _this.mpos.x =  ((evt.pageX - evt.target.offsetLeft) / evt.target.clientWidth) * 2 - 1
      _this.mpos.y = -((evt.pageY - evt.target.offsetTop)  / evt.target.clientHeight) * 2 + 1  
      recent_mbtns = evt.buttons
      _this.dispatch_libek_event("mouseout")
    }      
    
    this.dispatch_libek_event = function(code, data) {
      //console.log("DISP-" + code)
      for (let reader of _this.EventReaders) {
        if (reader.receiveEvent(code, data)) {
          if (code == "lmb_down") {
            console.log("lmbdown-handler", reader)
          }
          return
        }
      }
    }
  
    evt_target.addEventListener("focus", recv_event)
    evt_target.addEventListener("focusout", recv_focusout)
    evt_target.addEventListener("keydown", recv_keydown)
    evt_target.addEventListener("keyup", recv_keyup)
    evt_target.addEventListener("mousedown", recv_mousedown)
    evt_target.addEventListener("mouseup", recv_mouseup)
    evt_target.addEventListener("mousemove", recv_mousemove)
    evt_target.addEventListener("mouseover", recv_mousein)
    evt_target.addEventListener("mouseout", recv_mouseout)
    evt_target.addEventListener("wheel", recv_mousewheel)
  },
  
  //Event reader policies - these control whether or not an event.Reader returns an event and whether or not the event bubbles
  EventReaderAction: {
    READ:1,        //Read the event and allow it to bubble
    CONSUME:2,     //Read the event and prevent it from bubbling
    IGNORE:3,      //Ignore the event and allow it to bubble
    DROP:4,        //Ignore the event and prevent it from bubbling
    DEFER:5
  },
  
  // Code table for converting characters into JS key codes (KeyboardEvent.code)
  keycode:{
    '`':'Backquote', '~':'Backquote',
    '1':'Digit1', '2':'Digit2', '3':'Digit3', '4':'Digit4', '5':'Digit5', 
    '6':'Digit6', '7':'Digit7', '8':'Digit8', '9':'Digit9', '0':'Digit0',    
    '!':'Digit1', '@':'Digit2', '#':'Digit3', '$':'Digit4', '%':'Digit5', 
    '^':'Digit6', '&':'Digit7', '*':'Digit8', '(':'Digit9', ')':'Digit0',    
    '-':'Minus', '_':'Minus', 
    '=':'Equal', '+':'Equal',
    '[':'BracketLeft', '{':'BracketLeft',
    ']':'BracketRight', '}':'BracketRight',
    '\\':'Backslash', '|':'Backslash',
    ';':'Semicolon', ':':'Semicolon',
    '"':'Quote', '\'':'Quote', 
    ',':'Comma', '<':'Comma', 
    '.':'Period', '>':'Period', 
    '/':'Slash', '?':'Slash', 
    ' ':'Space',
  },
  
  // Various accepted names for mouse buttons
  mousebutton:{
    lmb:"lmb", m1:"lmb", mb1:"lmb", mouse1:"lmb", left:"lmb",
    mmb:"mmb", m2:"mmb", mb2:"mmb", mouse2:"mmb", middle:"mmb",
    rmb:"rmb", m3:"rmb", mb3:"rmb", mouse3:"rmb", right:"rmb",
    m4:"m4", mb4:"m4", mouse4:"m4",
    m5:"m5", mb5:"m5", mouse5:"m5",
  },
  
  //Sets of logically grouped mouse-actions
  mouseaction:{
    all:["mousemove", "mousein", "mouseout", "mousewheel_pos", "mousewheel_neg", "lmb", "mmb", "rmb", "m4", "m5"],
    focus:["mousein", "mouseout"],
    move:"mousemove",
    wheel:["mousewheel_pos", "mousewheel_neg", "mmb"],
    buttons:["lmb", "mmb", "rmb", "m4", "m5"]
  },
  
  // Build and return a new EventReader policy
  policy:function(... commands) {
    let pol = {}
    libek.event.policy_impl(pol, Array.from(commands) )
    return pol
  },
  // Alter an existing EventReader policy
  modPolicy:function(policy, ... commands) {
    libek.event.policy_impl(policy, Array.from(commands))
  },
  // Generate an altered copy of an existing EventReader policy
  subPolicy:function(policy, ... commands) {
    let pol = Object.assign({}, policy)
    libek.event.policy_impl(pol, Array.from(commands))
    return pol
  },
  
  //internal policy generation/editing utility function
  policy_impl:function(policy, commands) {
  
    let toAction = function(str) {
      let action = libek.event.EventReaderAction[str.toUpperCase()]
      if (action) {
        return action
      }
      console.log("UNRECOGNIZED EventReaderAction:  '" + str + "'")
      return libek.event.EventReaderAction.IGNORE
    }
  
    ParseCommands:
    for (cmd of commands) {
    
      //Overall command format is <EventReaderAction.*> <word> <word> <word>:<extra-data>  
    
      let parts = cmd.split(':', 2)
      let hdr = parts[0]
      let ftr = parts[1]
      parts = hdr.split(' ')
      
      let action = 0
      let up = false
      let down = false
      let keys = false
      let mouse = false
      
      let nbuttons = []        
      
      //examine the first "word" - if it is "default", then the second word is the default EventReaderAction, otherewise the first word is the action
      switch(parts[0]) {
        case 'default':
          policy.default = toAction(parts[1])
          continue ParseCommands
        break
        default:
          action = toAction(parts[0])
        break
      }
      
      //console.log(action)
      
      // Each subsequent word is a minor command
      for (let i = 1; i < parts.length; i++) {
        let word = parts[i]
        switch(word) {
        
          // Main modifier - indicates whether a button-press should trigger on the "down" event or the "up" event.  If none is specified, "down" is used
          case "up": up=true; break;        // Hook button-up events for any listed buttons
          case "down": down=true; break;    // Hook button-down events for any listed buttons        
          
          // main shorthand specifications
          case "keys": keys=true; break;    // Hook any listed keyboard buttons (after ':') or all buttons if no ':' is present
          case "mouse": mouse=true; break;  // Hook any listed mouse actions (after ':') or all actions if no ':' is present
          
          // Various logically grouped sets of keys
          case "numpad":                    // Hook all numpad keys
            nbuttons = nbuttons.concat([
                'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 
                'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'Numpad0', 
                'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 
                'NumpadDecimal', 'NumpadEnter', 'NumpadEqual', 'NumpadComma'
            ])
          break  
          case "digits":                   // Hook all digit keys
            nbuttons = nbuttons.concat([
                'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 
                'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'
            ])
          break
          case "letters":                   // Hook all letter keys
            nbuttons = nbuttons.concat([
                'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 
                'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 
                'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM' 
            ])
          break
          case "fkeys":                   // Hook all function keys
            nbuttons = nbuttons.concat([
              'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12' 
            ])
          break
          case "arrows":                   // Hook all arrow keys
            nbuttons = nbuttons.concat([
              'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
            ])
          break
          case "misckeys":                   // Hook various other keys
            nbuttons = nbuttons.concat([
              'Escape', 'Minus', 'Equal', 'Backspace', 'Tab', 'BracketLeft', 'BracketRight', 
              'Enter', 'ControlLeft', 'ControlRight' , 'Semicolon', 'Quote', 'Backquote', 'Backslash', 'Comma', 
              'Period', 'Slash', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'Space', 'Capslock', 'Pause', 'ScrollLock'
            ])
          break
          case "space":
            nbuttons.push("Space")
          break
          case "enter":
            nbuttons.push("Enter")
          break
          case "escape":
            nbuttons.push("Escape")
          break
          case "alt":
             nbuttons =  nbuttons.concat([ 'AltLeft', 'AltRight' ])
          break
          case "ctrl":
             nbuttons =  nbuttons.concat([ 'ControlLeft', 'ControlRight' ])
          break
          case "shift":
             nbuttons =  nbuttons.concat([ 'ShiftLeft', 'ShiftRight' ])
          break
          
          // Anything the event manager is configured to receive - basically for direct hooking of anything that isn't a button.
          default:
            policy[word] = action
          break
        }
      }
      
      //enable the use of button-down events if no stroke is specified
      if (!down && !up) {
        down = true
      }
      
      //add shorthand-specified hooks
      if (ftr) {
        if (keys && mouse) {
          console.log('WARNING:  "keys" and "mouse" shorthand specifications conflict.  This won\'t do what you want.')
        }
        if (keys) {
          //the "keys" shorthand spec is just a direct mapping of characters to key-codes
          //  This presumes a standard QWERTY keyboard.
          //    This also writes off ALL Unamericans.
          for (let c of ftr) {
            nbuttons.push(libek.event.keycode[c])
          }
        }
        else {
          //The entries in the "mouse" shorthand spec may reference either the mouse buttons directly or logically grouped sets of mouse events
          parts = ftr.split(' ')
          for (let maction of parts) {
            let mb = libek.event.mousebutton[maction]
            if (mb) {
              //mouse-button referenced directly
              nbuttons.push(mb)
            }
            else {
              let ma = libek.event.mouseaction[maction]
              if (ma) {
                if (typeof(ma) == 'object') {
                  //group of mousebuttons and/or related events
                  for (let _ma of ma) {
                    mb = libek.event.mousebutton[maction]
                    if (mb) {
                      //If it's a button, register it as a button
                      nbuttons.push(mb)
                    }
                    else {
                      //Otherwise, it's a very NON-button event and should be written to the policy directly
                      policy[_ma] = action
                    }
                  }
                }
                else {
                  //Single mouse-related non-button
                  policy[ma] = action
                }
              }
            }
          }
        }
      }
      else {
        if (keys) {
          //If no shorthand data is included but "keys" is specified, configure the policy to receive ALL keyboard events
          nbuttons.push('key_all')
        }
        if (mouse) {
          //If no shorthand data is included but "mouse" is specified, configure the policy to receive ALL mouse events
          nbuttons.push('mouse_all')
          
          policy.mousein = action
          policy.mouseout = action
          policy.mousemove = action
          policy.mousewheel_pos = action
          policy.mousewheel_neg = action
        }
      }
      
      //set up the requested button event hooks
      if (up) {
        for (let btn of nbuttons) {
          policy[btn+"_up"] = action
        }
      }
      if (down) {
        for (let btn of nbuttons) {
          policy[btn+"_down"] = action
        }
      }
    }
  },
  
  ReadReturnType:{
    Object:1,
    Code:2,
    Data:3
  },
  
  
  
  Reader:function(evt_manager, priority=0, policy=null) {
    //Associative array:  "event-name":<read OR consume OR ignore OR drop>
    this.policy = policy ? policy : { default:libek.event.EventReaderAction.IGNORE }
    this.priority = priority
    this.returnType = libek.event.ReadReturnType.Object      
    evt_manager.addReader(this)
    
    // Called by EventManager for every event
    this.receiveEvent = function(code, data) {
      // Get policy for the input event-code        
      let pol = this.policy[code]
      if (!pol) {
        pol = this.policy.default
      }
      if (!pol) {
        pol = libek.event.EventReaderAction.IGNORE
      }
      
      // Select an action to perform on the basis of the policy assigned to the event
      //    (action - whether or not to forward the event to the reader callback 
      //              AND whether or not the event should bubble to lower-priority event readers)
      switch(pol) {
        case libek.event.EventReaderAction.READ:
          this.RECV(this.pack(code, data))
          return false
        break
        case libek.event.EventReaderAction.CONSUME:
          this.RECV(this.pack(code, data))
          return true
        break
        case libek.event.EventReaderAction.IGNORE:
          return false
        break
        case libek.event.EventReaderAction.DROP:
          return true
        break
        case libek.event.EventReaderAction.DEFER:
          return this.RECV(this.pack(code, data))
        break
      }
    }
    
    // Internal function - Prepare the event output (wrap it into a simple object, or pick either the event code or event data to return)
    this.pack = function(code, data) {      
      switch(this.returnType) {
        case libek.event.ReadReturnType.Object:
          return {code:code, data:data}
        break
        case libek.event.ReadReturnType.Code:
          return code
        break
        case libek.event.ReadReturnType.Data:
          return data
        break
      }
    }
    
    // Wraps the callback up so the reader can be used through asynchronous imperative logic
    this.next = async function(policy = undefined) {
      if (policy) this.policy = policy
      return new Promise(resolve => {
        this.RECV = function(val) {
          resolve(val)
        }
      });
    }
    
    // Call this when the reader is no longer in use
    this.close = function() {
      evt_manager.removeReader(this)
      //evt_manager.EventReaders.splice(evt_manager.EventReaders.indexOf(this), 1)
    }
  }    
}