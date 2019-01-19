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
orthot.Button = function(zone, align, color, size, press) {
  this.type = "button"
  let mdlname
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
  this.push = function() {
    zone.signal(press)
  }
  this.mdlgen = function() {
    let r = libek.getAsset(mdlname)
    if (color) {
      libek.assignMaterials(r, color)
    }
    return r
  }  
  Object.assign(this, align)
}