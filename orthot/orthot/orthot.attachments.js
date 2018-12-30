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
  this.mdlgen = function() {
    let r = libek.getAsset("portal_pane")
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }
  
  Object.assign(this, align)
}
orthot.SmallButton = function(align, color) {
  this.type = "button"
  this.minForce = orthot.Strength.NORMAL    //Can be pressed by player
  this.mdlgen = function() {
    let r = libek.getAsset("smallbutton_up")
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }
  
  Object.assign(this, align)
}
orthot.BigButton = function(align, color) {
  this.type = "button"
  this.minForce = orthot.Strength.HARD      //require assistance to press
  this.objgen = function() {
    let r = libek.getAsset("bigbutton_up")
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }
  
  Object.assign(this, align)
}