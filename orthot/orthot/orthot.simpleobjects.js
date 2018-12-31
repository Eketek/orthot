orthot.Wall = function(zone) {
  this.__init__(zone)
  this.SpatialClass = "solid"
  
  this.isTraversableBy = function(otherOBJ) {return false}
  this.struck = function(force, otherOBJ, collision) { console.log("WALL-struck", force, collision) }
  this.strike = function(force, otherOBJ, collision) { console.log("WALL-strike", force, collision) }
  
  this.push = function(force) { 
  }
  
  this.attach = function(sideobj) {
    sideobj.host = this
    this.sides[sideobj.up].push(sideobj)
    sideobj.obj = sideobj.mdlgen()
    sideobj.obj.__ISDIRTY = true
    let orientation = {}
    libek.direction.setOrientation(orientation, sideobj.forward, sideobj.up, false)
    sideobj.obj.position.set(this.ctn.x, this.ctn.y, this.ctn.z)
    sideobj.obj.position.add(orientation.position)
    sideobj.obj.setRotationFromEuler(orientation.rotation)
    this.zone.scene.add(sideobj.obj)
  }
}
orthot.Wall.prototype = orthot.OrthotObject

orthot.ScenePortal = function(zone) {
  this.__init__(zone)
  this.initGraphics = (function() {
    this.obj = libek.getAsset("scene_portal")
    return true
  }).bind(this)
  this.intruded = function(other) {
    if (other.isPlayer) {
      //console.log("sceneportal-data", this._ekvxdata_)
      orthot.loadScene(this.destination, this.target)
    }
  }
}
orthot.ScenePortal.prototype = orthot.OrthotObject

/*  Object thta allows movement up and down along a diagonal vector.
    Stairs are regarded as "ramps" for every purpose other than graphical representation
*/
orthot.Stair = function(zone, color, align) {
  this.__init__()
  this.SpatialClass = "ramp" 
  
  //set up some boundaries
  //  This is somewhat of a hack to prevent creatures from falling through ramps that do not have a solid object placed underneath.
  this.sides[libek.direction.invert[align.up]].push({SpatialClass:"wall"})
  
  this.types.push("ramp")
  
  this.initGraphics = function() {
    this.obj = libek.getAsset("stair_ramp")
    this.obj.children[0].material = libek.Material(color)
    let orientation = {}
    libek.direction.setOrientation(orientation, libek.direction.invert[align.forward], align.up)
    this.obj.position.set(orientation.position)
    this.obj.setRotationFromEuler(orientation.rotation)
    return true
  }
  
  this.ascendDIR = align.forward
  this.descendDIR = libek.direction.invert[align.forward]
}
orthot.Stair.prototype = orthot.OrthotObject

// I still don't know what to call a pushblock.  A pushblock is a pushblock.
// Please don't upload this comment somewhere embarassing, such as the Internet.
orthot.PushBlock = function(zone, color) {
  this.__init__(zone)
  this.AutoGravity = true
  zone.activate(this)
  
  this.SpatialClass = "solid"    
  this.state = orthot.ObjectState.IDLE
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("pushblock")
    if (this.color) {
      mdl.children[1].material = libek.Material(this.color)
    }
    return mdl
  }
  
  this.initGraphics = function() {
    orthot.AnimateBlock(zone, this)
    return true
  }
  
  this.attach = function(sideobj) {
    sideobj.host = this
    this.sides[sideobj.up].push(sideobj)
  }
  
  this.update = function() {
    if (this.defeated) {
      zone.deactivate(this)
      return
    }
    let gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, libek.direction.code.NORTH, libek.direction.code.UP)
    gravity.OBJ = this
    gravity.initiator = this
    gravity.action = "fall"
    gravity.strength = orthot.Strength.NORMAL
    
    switch(this.state) {
      case orthot.ObjectState.FALLING:
        zone.addForce(gravity)
        break
      case orthot.ObjectState.IDLE:
      case orthot.ObjectState.WALKING:
        if (gravity.isTraversable()) {
          this.state = orthot.ObjectState.FALLING
          let uctn = this.zone.getAdjacentCTN(this.ctn, libek.direction.code.UP)
          zone.addForce(gravity)
          uctn.stackFall(gravity)
        }
        else {
          zone.deactivate(this)
        }
        break
      default:
        zone.deactivate(this)
        break
    }
  }
  
  this.stackFall = function(force) {
    let gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN)
    gravity.OBJ = this
    gravity.initiator = force.initiator
    gravity.action = "fall"
    gravity.puller = force.OBJ
    gravity.strength = orthot.Strength.NORMAL
    this.state = orthot.ObjectState.FALLING
    zone.addForce(gravity)
    zone.activate(this)
    return gravity
  }
  
  this.struck = function(force) {
    
  }
  this.strike = function(force) {
    //if (forc
    //this.animCTL.impactDown(force)
  }
  
  this.push = function(force) { 
    
  }
  
  let prev_ticknum = -10
  this.move = function(force) { 
    if (force.isTraversable()) {
      if (force.action == "fall") {
        this.state = orthot.ObjectState.FALLING
      }
      else {        
        zone.activate(this)
      }
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
      zone.putGameobject(force.toCTN, this)
      if ( (force.initiator == force.pusher) && ( zone.ticknum > (prev_ticknum+1) ) ) {
        this.animCTL.impulseShift(force)
        this.state = orthot.ObjectState.WALKING
      }
      else {
        this.animCTL.shift(force)
      }
      prev_ticknum = zone.ticknum
      return trit.TRUE
    }
    else if ((!force.deferred) && (force.strength > orthot.Strength.NONE)) {
      //force.action = "pushwalk"
      force.toCTN.push(force)      
      return trit.MAYBE
    }
    else if (force.action == "fall") {
      if (this.state == orthot.ObjectState.FALLING) {
        this.state = orthot.ObjectState.IDLE
        this.animCTL.impactDown(force)
      }
      
      this.state = orthot.ObjectState.IDLE
      zone.deactivate(this)   
      return trit.FALSE
    }
    else if (force.action == "crushed") {
      this.defeat()
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
      return trit.TRUE
    }
    else {
      return trit.FALSE
    }
  }
  
  this.propagateForce = (function(force){ 
  
    if (this.state == orthot.ObjectState.DEFEATED) {
      return
    }
    if (force.strength >= orthot.Strength.NORMAL) {
      let pbf = orthot.topology.scan_simple(zone, this.ctn, this, force.toHEADING, force.toFORWARD)
      pbf.OBJ = this
      pbf.pusher = force.OBJ
      pbf.initiator = force.initiator
      pbf.action = force.strength >= orthot.Strength.CRUSHING ? "crushed" : "pushed"
      pbf.strength = orthot.Strength.LIGHT
      zone.addForce(pbf)
      return true
    }
    return false
  }).bind(this)
}
orthot.PushBlock.prototype = orthot.OrthotObject













