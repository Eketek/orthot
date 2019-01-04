// Base object behavior
// This was intended to be implemented with prototypes, but that proved probematic when switching from the use of objects to the use of delegates for receiving
// tick events from orthot.Zone
orthot.OrthotObject = function(THIS, zone) {
  THIS.zone = zone
  THIS.isOrthotObject = true
  THIS.initGraphics = function() { return false }
  THIS.ready = function(){}
  //pre-collision notifier.  This function [if overriden] is where to decide if the force should push the object and/or if it should crush the object,
  //  and this function is also where force proapgation should be handled.
  //This should return true if this object has propagated the force (to prevent infinite loop from force-propagation)
  // If the function returns true, no additional forces from the originating direction will be applied to the object during the same tick
  THIS.propagateForce = function(force){ return true }
  
  // A mechanism for allowing objects to override the default collision resolution order
  //  If true is returned for all collisions the object is involved in, this object will have the opportunity to take the space
  THIS.hasMovementPriority = function(other_OBJ, other_fromDIR, obj_toDIR, collisiontype) { return false }
  
  /*  Called when this object has been struck by another object.  
      force:  The striking force
      otherOBJ:  The object doing the striking
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  THIS.struck = function(force, otherOBJ, collision, crash=false) { return false }
  
  /*  Called when this object is striking another object.  
      force:  The striking force
      otherOBJ:  The object being struck
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  THIS.strike = function(force, otherOBJ, collision, crash=false) { return false } 
  
  THIS.idle = function() {}
  
  //Called if requested by preStruck() and there either is space ahead or the space ahead is being vacated and strike()/struck() didn't veto the move
  THIS.move = function(force) { return false }
  
  THIS.cancelMove = function(force) {}
  
  //Called if requested by preStruck() and move either was not requested or was requested and subsequently vetoed by strike()/struck()
  THIS.crush = function(force) { }
    
  THIS.push = function(force) {}
  
  //isTraversableBy:function(otherOBJ) {return true},
  
  THIS.intruded = function(other) {}
  THIS.intrude = function(other) {}
  
  // Called when a force originating from this object and pointed directly at another object either causes the object to leave or results in its destruction.
  //  (This is mainly used to trigger the Player pushwalk animation)
  THIS.notify_ForcePropagationClearedObstruction = function(force, other) { }
  
  // Called when a push from this object and pointed directly at another object either causes the object to leave or results in its destruction.
  THIS.notify_PushClearedObstruction = function(force, other) { }
  
  THIS.defeat = function() {
    delete THIS.SpatialClass    //A reasonably simple way to disappear the object
    THIS.state = orthot.ObjectState.DEFEATED
    if (THIS.obj) {
      orthot.VanishAnim(zone, THIS, {
        end:(function() {
          zone.removeGameobject(THIS)
        }).bind(THIS),
        pos:THIS.worldpos
      })
    }
    THIS.defeated = true
  }
  /*
  // Wake any objects up to possibly trigger gravity
  // called whenever anything is removed from lower container (if there is a contiguous stack of non-immobile objects between the the object location
  // and the location of whatever moved)
  THIS.bump = function(stackfall=false) {
    if (THIS.AutoGravity) {
      zone.addTickListener(THIS.update)
      return true
    }
  }
  
  THIS.stackFall = function(force) {
    return false
  }
  */
  
  
  /*  An object is moving out of some container other than this one, into a container which is adjacent to this container
   *
   *  heading:
   *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
   *    which points at the location the object is moving into
   *  normal:
   *    A vector pointing toward the space which the object is moving into
   *  originatingForce:
   *    The [primary] force which is causing this secondary force to be applied
   */
  THIS.applyInboundIndirectForce = function(heading, normal, originatingForce) { }
  
  /*  An object is moving out of some container other than this one, into a container which is adjacent to this container
   *
   *  heading:
   *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
   *    which points at the location the object is moving into
   *  normal:
   *    A vector pointing toward the space which the object is moving into
   *  originatingForce:
   *    The [primary] force which is causing this secondary force to be applied
   */
  THIS.applyOutboundIndirectForce = function(heading, normal, originatingForce) { }
  
  THIS.destroy = function() { 
    if (THIS.destroyed) {
      return false
    }
    THIS.destroyed = true
    if (THIS.animCTL && THIS.animCTL.destroy) {
      THIS.animCTL.destroy()
    }
    else if (THIS.obj) {
      //console.log("destroy ... ", this)
      if (THIS.obj.parent) {
        THIS.obj.parent.remove(THIS.obj)
      }
      libek.releaseAsset(THIS.obj)
    }
    if (THIS.sides) {
      for (let i = 1; i < THIS.sides.length; i++) {
        for (let sideobj of THIS.sides[i]) {
          if (sideobj.obj) {
            libek.releaseAsset(sideobj.obj)
          }
        }
      }
    }
    return true
  }  
  
  THIS.getSideobject_bytype = function(side, type) {  
    if (THIS.sides) {
      for (let sideobj of THIS.sides[side]) {
        if (sideobj.type == type) {
          return sideobj
        }
      }
    }
  }
    
  THIS.types = []
  
  THIS.sides = [ 0, [],[],[],[],[],[] ]
  
  let fproptick = -1
  let fpropdirs = []   
  
  THIS.__propagate_force__ = function(force, tick) {    
    if (fproptick < tick) {
      if (fpropdirs.length != 0) {
        fpropdirs = []
      }
    }
    if ( (fproptick < tick) || (fpropdirs.indexOf(force.fromDIR) == -1) ) {
      if (THIS.propagateForce(force)) {
        fpropdirs.push(force.fromDIR)
        fproptick = tick
        return true
      }
    }
    return false
  }
}

orthot.StandardObject = function(THIS, zone) {    
  orthot.OrthotObject(THIS, zone) 
  THIS.initGraphics = function() {
    orthot.AnimateBlock(zone, THIS)
    return true
  }
  
  THIS.attach = function(sideobj) {
    sideobj.host = THIS
    THIS.sides[sideobj.up].push(sideobj)
  }
  
  THIS.update = function() {
    if (THIS.defeated) {
      zone.removeTickListener(THIS.update)
      return
    }
    
    let gravity = orthot.topology.scan_simple(zone, THIS.ctn, THIS, libek.direction.code.DOWN, libek.direction.code.NORTH, libek.direction.code.UP)
    gravity.OBJ = THIS
    gravity.initiator = THIS
    gravity.action = "fall"
    gravity.strength = orthot.Strength.NORMAL
    
    switch(THIS.state) {    
      case orthot.ObjectState.MAYBEFALL:
      case orthot.ObjectState.FALLING:
        if (gravity.isTraversable()) {
          zone.addForce(gravity)
        }
        else {
          zone.removeTickListener(THIS.update)
          if (THIS.state == orthot.ObjectState.FALLING) {
            gravity.toCTN = THIS.ctn
            THIS.animCTL.impactDown(gravity)
          }
          THIS.state = orthot.ObjectState.IDLE
          THIS.idle()
        }
        break
      case orthot.ObjectState.IDLE:        
        if (gravity.isTraversable()) {
          THIS.state = orthot.ObjectState.MAYBEFALL
          let uctn = zone.getAdjacentCTN(THIS.ctn, libek.direction.code.UP)
          zone.addForce(gravity)
        }
      case orthot.ObjectState.WALKING:
        if (gravity.isTraversable()) {
          THIS.state = orthot.ObjectState.MAYBEFALL
          let uctn = zone.getAdjacentCTN(THIS.ctn, libek.direction.code.UP)
          zone.addForce(gravity)
        }
        else {
          zone.removeTickListener(THIS.update)
        }
        break
      default:
        break
    }
  }
  
  /*
  THIS.stackFall = function(force) {
    if (THIS.AutoGravity) {
      let gravity = orthot.topology.scan_simple(zone, THIS.ctn, THIS, libek.direction.code.DOWN)
      gravity.OBJ = THIS
      gravity.initiator = force.initiator
      gravity.action = "fall"
      gravity.puller = force.OBJ
      gravity.strength = orthot.Strength.NORMAL
      THIS.state = orthot.ObjectState.FALLING
      zone.addForce(gravity)
      zone.addTickListener(THIS.update)
      return gravity
    }
  }
  */
  
  THIS.struck = function(force) {
    
  }
  
  THIS.strike = function(force, otherOBJ, collision, crash=false) {
    /*
    console.log("strike", force, otherOBJ, collision, crash)
    if (force.action == "fall") {
      if (THIS.state == orthot.ObjectState.FALLING) {
        THIS.animCTL.impactDown(force)
      }
      
      THIS.state = orthot.ObjectState.IDLE
      zone.removeTickListener(THIS.update)   
      //THIS.idle()
    }
    */
  }
  
  THIS.push = function(force) { 
    
  }
  
  prev_ticknum = -10
  THIS.move = function(force) {
    if (force.isTraversable()) {
      if (force.action == "fall") {
        THIS.state = orthot.ObjectState.FALLING
      }
      else {        
        zone.addTickListener(THIS.update)
        THIS.state = orthot.ObjectState.WALKING
      }
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, THIS)
      }
      zone.putGameobject(force.toCTN, THIS)
      if ( (force.initiator == force.pusher) && ( zone.ticknum > (prev_ticknum+1) ) ) {
        THIS.animCTL.impulseShift(force)
        //THIS.state = orthot.ObjectState.WALKING
      }
      else {
        THIS.animCTL.shift(force)
      }
      prev_ticknum = zone.ticknum
      return trit.TRUE
    }
    else if ((!force.deferred) && (force.strength > orthot.Strength.NONE)) {
      force.toCTN.push(force)
      return trit.MAYBE
    }
    else if (force.action == "fall") {
      if (THIS.state == orthot.ObjectState.FALLING) {
        THIS.state = orthot.ObjectState.IDLE
        THIS.animCTL.impactDown(force)
      }
      
      THIS.state = orthot.ObjectState.IDLE
      zone.removeTickListener(THIS.update)   
      return trit.FALSE
    }
    else if (force.action == "crushed") {
      THIS.defeat()
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
      return trit.TRUE
    }
    else {
      return trit.FALSE
    }
  }
  THIS.cancelMove = function(force) {
    console.log("cancel-move", force)
    if (force.action == "fall") {
      if (THIS.state == orthot.ObjectState.FALLING) {
        THIS.animCTL.impactDown(force)
      }
      
      THIS.state = orthot.ObjectState.IDLE
      zone.removeTickListener(THIS.update)   
    }
  }
}




