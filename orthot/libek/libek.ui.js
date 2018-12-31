/*
  A GUI-building utility.  This will probably get deleted and replaced with a "Someone-Else's HTML5 UI library".
  
  All visual and interactive functionality of libek.UI controls is deferred
  
  All libek.ui controls are intended to be instantiated in the following ways:
    
    Single control with unique parameterization:
    Control(control_params)()
    
    Control with a base parameterization:
    Control(control_params)(base_params)
    
    Group of controls with a common base parameterization:
    Group(group_params, ... Control(control_params))
  
  There are two types of control groups.  
  
    A basic group is a simple collection of controls.  
    Controls within a basic group interact with app code independently through message-passing callbacks assigned to each control.
    This is intended mainly for Controls which trigger functions which are mostly independent of each other
    
    An async group is a collection of controls which interact with async code.
    Controls within these groups are auto-assigned a callback which is used to pass messages to an async function which treats the control group as a single control.
    This is intended mainly for UI elements which are related to each other (mainly multiple choice dialogs, controls which do not auto-trigger program functions,
    and controls which process outputs from other controls)
*/
libek.ui = function(Control) {
  if (!Control) {
    Control = {
      Label:{
        build:function(text, style, callback) {},
        text:function(obj, text) {},
        dispose:function(obj) {}
      },
      Button:{
        build:function(name, style, callback) {},     
        text:function(obj, text) {},
        style:function(obj, style) {},
        dispose:function(obj) {},
      }
    }
  }
  
  
  // A basic pushbutton.  Presumably shows text, Click it -> Presumably something maybe happens.
  this.Button = function(params) {  
    let obj
    let base_params
    return {    
      init:function(_base_params) {  
        if (obj) {
          return
        } 
        
        base_params = _base_params
        
        let text = libek.util.property( "text", "TEXT", params, base_params )
        let value = libek.util.property( "value", "VALUE", params, base_params )
        let style = libek.util.property( "style", "", params, base_params )
        let location = libek.util.property( "location", "", params, base_params )
        let callback = libek.util.property( "callback", undefined, params, base_params )
        
        obj = Control.Button.build(text, style, location, function() {
          if (callback) {
            callback(value)
          }
        })
      },
    
      dispose:function() { 
        Control.Button.dispose(obj)
      },
      
      text:function(txt) {
        if (!txt) {
          txt = libek.util.property( "text", "TEXT", params, base_params )
        }
        Control.Button.text(obj, txt)
      },
      style:function(style) {
        if (!style) {
          style = libek.util.property( "style", "", params, base_params )
        }
        Control.Button.style(obj, style)
      }        
    }
  }
  
  this.Label = function(params) {  
    let obj
    let base_params
    return {    
      init:function(_base_params) {  
        if (obj) {
          return
        } 
        
        base_params = _base_params
        
        let text = libek.util.property( "text", "TEXT", params, base_params )
        let style = libek.util.property( "style", "", params, base_params )      
        let location = libek.util.property( "location", "", params, base_params )  
        obj = Control.Label.build(text, style, location)
      },    
      dispose:function() { 
        Control.Button.dispose(obj)
      },      
      text:function(txt) {
        if (!txt) {
          txt = libek.util.property( "text", "TEXT", params, base_params )
        }
        Control.Button.text(obj, txt)
      }    
    }
  }
  
  // A logical grouping of UI controls.  
  // params:  Base property list for all attached controls
  // controls:  A set of UI controls to add.
  this.Group = function( params, ... controls ) {  
    let elems = []
    
    for (let control of controls.flat()) {
      elems.push(control)
      control.init(params)
    }
    
    return {
      dispose:function() {
        for (let elem of elems) {
          elem.dispose()
        }
      }
    }
  }
  
  //  async wrapper for a single Control
  //
  //  control:  Any standalone libek.ui Control
  //
  //  result.dispose:  triggers UI element disposal
  //                   if anything is waiting on input(), send undefined
  //  result.input:    if anything is waiting on input(), when the Control is triggered, send an input (varies depending on what the Control does)
  this.AsyncControl = function (control) { 
    let resolve        
    control.init({callback:function(val) {
      if (resolve) {
        resolve(val)
        resolve = undefined
      }
    }})
    
    return {
      dispose:function() {
        control.dispose()
        if (resolve) {
          resolve()
        }
      },
      input:function() {
        return new Promise(r => {
          resolve = r
        })
      } 
    }
    
  },
  
  // async wrapper for a collection of Controls
  //
  //  controls:  A list of standalone libek.ui Control.  This list may include Arrays of controls
  //
  //  result.dispose:  triggers UI element disposal for all controls
  //                   if anything is waiting on input(), send undefined
  //  result.input:    if anything is waiting on input(), when a Control is triggered, send its input (varies depending on what the Control does)
  this.AsyncGroup = function( params, ... controls ) {  
    let resolve    
    let _params = Object.assign({}, params)
    _params.callback = function(val) {
      if (resolve) {
        resolve(val)
        resolve = undefined
      }
    }
    
    let elems = []
    
    for (let control of controls.flat()) {
      control.init(_params)
      elems.push(control)
    }
        
    return {
      dispose:function() {
        for (let elem of elems) {
          elem.dispose()
        }
        if (resolve) {
          resolve()
        }
      },
      input:function() {
        return new Promise(r => {
          resolve = r
        })
      } 
    }
  }
}