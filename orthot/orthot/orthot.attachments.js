/*  Objects that get attached to the sides/faces of solid objects and terrain
    These generally should only be params objects to hold properties and 3D model generators
      (rather than proper objects which handle their own stated functions)
*/

orthot.Ladder = function(align, color) {
  this.type = "ladder"
  this.mdlgen = function() {
    let r = libek.getAsset("ladder")
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }
  
  Object.assign(this, align)
}

orthot.Portal = function(align, color, pclass, pname, ptarget) {
  this.pclass = pclass
  this.pname = name
  this.ptarget = ptarget
  this.type = "portal"
  this.sources = []
  this.surfacetype = orthot.surface.type.FRICTIONLESS
  this.mdlgen = function() {
    let r = libek.getAsset("portal_pane")
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }
  
  Object.assign(this, align)
}

orthot.Icefloor = function(align) {
  this.type = "icefloor"
  this.sources = []
  this.surfacetype = orthot.surface.type.SLICK
  this.mdlgen = function() {
    return libek.getAsset("icefloor")
  }
  
  Object.assign(this, align)
}

/* Buttons send signals when pressed and released.
   Buttons may be pressed directly by pushing and pressed indirectly through shearing forces. 
   
   Button "animation" is a lazy hack because buttons are the only planned side-attached puzzle element that needs to be animated.
*/
orthot.Button = function(zone, align, color, size, pressSIG, releaseSIG) {
  this.type = "button"
  let mdlname
  let models = []
  switch(size) {
    case "small":   //Can be pressed by player
      mdlname = "smallbutton_up"
      this.minForce = orthot.strength.NORMAL
      break
    case "large":   //Can not be pressed by player
      mdlname = "bigbutton_up"
      this.minForce = orthot.strength.HARD
      break
  }
  
  // send press and release signals when the button is pressed or released
  //  This uses deferred actions to only sign
  let prevpressed = false
  let pressed = false
  let presser
  
  this.push = function(force) {
    if (force.strength >= this.minForce) {      
      presser = force.OBJ
      if (!pressed) {
        pressed = true
        zone.addDeferredAction(this.sendSignal)
      }
    }
    if (force.action != "fall") {
      this.relax(force)
    }
  }
  this.stress = function(force, shearstrength) {    
    if ( shearstrength >= this.minForce ) {
      presser = force.OBJ
      if (!pressed) {
        pressed = true
        zone.addDeferredAction(this.sendSignal)
      }
    }
  }
  this.relax = function(force, shearstrength) {
    let doRelax = true
    if (doRelax) {
      if (presser == force.OBJ) {
        zone.addTickListener_temp( () => {
          if (pressed && (presser == force.OBJ)) {
            pressed = false
            zone.addDeferredAction(this.sendSignal)
          }
        })
      }
    }
  }
    
  this.sendSignal = (function() {
    if (pressed != prevpressed) {
      if (pressed) {
        if (pressSIG) {
          zone.signal(pressSIG)
        }
        for (let mdl of models) {
          mdl.position.y -= 0.125
        }
      }
      else {
        if (releaseSIG) {
          zone.signal(releaseSIG)
        }
        for (let mdl of models) {
          mdl.position.y += 0.125
        }
      }
      prevpressed = pressed
    }
  }).bind(this)
  
  this.mdlgen = function() {
    let mdl = libek.getAsset(mdlname)
    if (color) {
      libek.assignMaterials(mdl, color)
    }
    models.push(mdl)
    let r = new THREE.Object3D()
    r.add(mdl)
    return r
  }  
  this.mdlungen = function(mdl) {
    let i = models.indexOf(mdl)
    if (i != -1) {
      models.splice(i, 1)
    }
  }  
  Object.assign(this, align)
}








