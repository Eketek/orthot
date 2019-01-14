// Base object behavior
// This was intended to be implemented with prototypes, but that proved probematic when switching from the use of objects to the use of delegates for receiving
// tick events from orthot.Zone
orthot.OrthotObject = function(THIS, zone) {
  THIS.id = libek.UID
  THIS.zone = zone
  THIS.isOrthotObject = true
  THIS.initGraphics = function() { return false }
  THIS.ready = function(){}
  //pre-collision notifier.  This function [if overriden] is where to decide if the force should push the object and/or if it should crush the object,
  //  and this function is also where force proapgation should be handled.
  //This should return true if this object has propagated the force (to prevent infinite loop from force-propagation)
  // If the function returns true, no additional forces from the originating direction will be applied to the object during the same tick
  THIS.propagateForce = function(force){     
    force.OBJ.strike(force, THIS, orthot.collision.SIMPLE)
    THIS.struck(force, force.OBJ, orthot.collision.SIMPLE)
  }
  
  // A mechanism for allowing objects to override the default collision resolution order
  //  If true is returned for all collisions the object is involved in, this object will have the opportunity to take the space
  THIS.hasMovementPriority = function(this_force, other_force, collisiontype) { return false }
  
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
    THIS.state = orthot.state.DEFEATED
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
  THIS.applyInboundIndirectForce = function(heading, normal, from_normal, originatingForce) { }
  
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
  THIS.applyOutboundIndirectForce = function(heading, normal, from_normal, originatingForce) { }
  
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
  
  
  THIS.surfaces = [0, 0,0,0,0,0,0]
  THIS.setBaseSurface = function(sfctype) {
    THIS.surfaces.fill(sfctype)
  }
    
  THIS.types = []
  
  THIS.sides = [ 0, [],[],[],[],[],[] ]
  
  THIS.forces = []
  
  THIS.fproptick = -1
  let fpropdirs = []   
  
  THIS.__propagate_force__ = function(force, tick) {    
    if (THIS.fproptick < tick) {
      THIS.fproptick = tick
      if (fpropdirs.length != 0) {
        fpropdirs = []
      }
    }
    
    if (fpropdirs.indexOf(force.toHEADING) == -1 ) {
      THIS.propagateForce(force)
      fpropdirs.push(force.toHEADING)
    }
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
    if (sideobj.surfacetype) {
      THIS.surfaces[sideobj.up] = sideobj.surfacetype
    }
  }
  
  
}
orthot.MovableObject = function(THIS, zone) { 
  orthot.StandardObject(THIS, zone)
  
  //Minimum amount of force-strength needed to propagate force to this object
  //  By default, objects are immobile.  Recommend using orthot.strength.<WHATEVER> as values
  THIS.propforceMin = Number.MAX_SAFE_INTEGER
  
  // Strength of propgated force.  If -1, the strength of the originating force will be used.  
  THIS.propforceStrength = -1
  
  // Strength of sliding force.  If -1, the strength of the preceding force will be used.  
  THIS.slideStrength = -1
  
  // Threshhold for using "crushed" logic instead of "pushed" logic 
  //    (crushing force destroys the object if the object is obstructed)
  THIS.crushingForce = orthot.strength.CRUSHING
  
  THIS.fallStrength = orthot.strength.LIGHT
  
  let gravity
  
  THIS.update = function() {
    if (THIS.defeated) {
      zone.removeTickListener(THIS.update)
      return
    }    
    
    if (THIS.state == orthot.state.SLIDING) {
      let sforce = orthot.topology.scan_simple(zone, THIS.ctn, THIS, THIS.slideHEADING, libek.direction.code.NORTH, libek.direction.code.UP)
      sforce.OBJ = THIS
      sforce.initiator = THIS
      sforce.action = "slide"
      sforce.strength = (THIS.slideStrength != -1) ? THIS.slideStrength : THIS.slideStrength_prev
      sforce.priority = 25
      zone.addForce(sforce)
    }
    
    gravity = orthot.topology.scan_simple(zone, THIS.ctn, THIS, libek.direction.code.DOWN, libek.direction.code.NORTH, libek.direction.code.UP)
    gravity.OBJ = THIS
    gravity.initiator = THIS
    gravity.action = "fall"
    gravity.strength = THIS.fallStrength
    gravity.priority = 100
    zone.addForce(gravity)
    
  }
  
  THIS.strike = function(force, otherOBJ, collision, crash=false) { 
  
    // If THIS object strikes something while sliding, cancel the slide.
    if (THIS.state == orthot.state.SLIDING) {
      THIS.state = orthot.state.IDLE
      THIS.idle()
    }
    
    //Just to be safe...
    if (force.action == "slide") {
      force.cancelled = true
    }
    return false     
  } 
  
  prev_ticknum = -10
  THIS.move = function(force) {
    if (force.cancelled) {          
      return trit.FALSE
    }
    if (force.isTraversable()) {    
      zone.putGameobject(force.toCTN, THIS)
      if (force.action == "fall") {
        THIS.state = orthot.state.FALLING
      }
      else {   
        zone.addTickListener(THIS.update)
        if (force.toHEADING == libek.direction.code.DOWN) {
          THIS.state = orthot.state.FALLING
        }
        else {
          THIS.state = orthot.state.WALKING
          if (force.toHEADING != libek.direction.code.UP) {
            let ngrav = orthot.topology.scan_simple(zone, THIS.ctn, THIS, libek.direction.code.DOWN, libek.direction.code.NORTH, libek.direction.code.UP)
            let gravOBJ = zone.getObstructor(THIS, ngrav.toCTN)
            if (gravOBJ) {
              let gravSFC = gravOBJ.surfaces[libek.direction.invert[ngrav.toHEADING]]   
              let sfc_interaction = orthot.surface.interact(THIS.surfaces[libek.direction.code.DOWN], gravSFC)
              
              if (sfc_interaction == orthot.surface.interaction.SLIDE) {
                THIS.state = orthot.state.SLIDING
                THIS.slideHEADING = force.toHEADING
                THIS.slideStrength_prev = force.strength
              }
            }
          }
        }
      }
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, THIS)
      }
      if ( (force.initiator == force.pusher) && ( zone.ticknum > (prev_ticknum+1) ) ) {
        THIS.animCTL.impulseShift(force)
      }
      else {
        THIS.animCTL.shift(force)
      }
      prev_ticknum = zone.ticknum
      return trit.TRUE
    }
    else if ((!force.deferred) && (force.strength > orthot.strength.NONE)) {
      force.toCTN.push(force)
      return trit.MAYBE
    }
    else if (force.action == "fall") {
      if (THIS.state == orthot.state.FALLING) {
        THIS.animCTL.impactDown(force)
      }
      
      THIS.state = orthot.state.IDLE
      zone.removeTickListener(THIS.update)
      THIS.idle()
      return trit.FALSE
    }
    else if (force.action == "crushed") {
      THIS.defeat()
      zone.removeTickListener(THIS.update)
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, THIS)
      }
      return trit.TRUE
    }
    else {
      //console.log(THIS.state, force)
      //zone.removeTickListener(THIS.update)
      THIS.idle()
      return trit.FALSE
    }
  }
  
  THIS.propagateForce = function(force) {
    if (THIS.state == orthot.state.DEFEATED) {
      return
    }
    
    force.OBJ.strike(force, THIS, orthot.collision.SIMPLE)
    THIS.struck(force, force.OBJ, orthot.collision.SIMPLE)
    
    if (force.strength >= THIS.propforceMin) { 
      let pbf = orthot.topology.scan_simple(zone, THIS.ctn, THIS, force.toHEADING, libek.direction.code.SOUTH, libek.direction.code.UP)
      
      pbf.pusher = force.OBJ
      pbf.initiator = force.initiator
      pbf.action = force.strength >= THIS.crushingForce ? "crushed" : "pushed"      
      pbf.priority = 50
      
      switch(force.toHEADING) {
        case libek.direction.code.DOWN:
          pbf.strength = THIS.fallStrength
          break
        case libek.direction.code.UP:
          break
        default: {
            pbf.strength = (THIS.propforceStrength != -1) ? THIS.propforceStrength : force.strength
            let grav = orthot.topology.scan_simple(zone, THIS.ctn, THIS, libek.direction.code.DOWN, libek.direction.code.SOUTH, libek.direction.code.UP)
            let gravOBJ = zone.getObstructor(THIS, grav.toCTN)
            let gravSFC = gravOBJ ? gravOBJ.surfaces[libek.direction.invert[grav.toHEADING]] : orthot.surface.type.FRICTIONLESS
            
            let sfc_interaction = orthot.surface.interact(THIS.surfaces[libek.direction.code.DOWN], gravSFC)
            
            // Interpreting force-strength as traction, if the force is too weak, fail.
            switch(sfc_interaction) {
              case orthot.surface.interaction.SLIDE:  
                if (force.strength < orthot.strength.LIGHT) return
                break
              case orthot.surface.interaction.RESIST:
              case orthot.surface.interaction.DRAG:
                if (THIS.propforce_threshold < orthot.strength.NORMAL) return
                break
              case orthot.surface.interaction.IMPEDE:
                if (THIS.propforce_threshold < orthot.strength.HARD) return
                break        
              case orthot.surface.interaction.BLOCK:
                if (THIS.propforce_threshold < orthot.strength.CRUSHING) return
                break        
            }
          }
          break
      }
      zone.addForce(pbf)
    }
  }
  
  THIS.hasMovementPriority = function(this_force, other_force, collisiontype) { 
    if ( (collisiontype == orthot.collision.CORNER_RAM) && (this_force.fromHEADING == libek.direction.code.DOWN) ) {
      return true
    }
    return false 
  }
  
  THIS.applyOutboundIndirectForce = function(heading, normal, from_normal, originatingForce) {    
    let sfc_interaction = orthot.surface.interact(THIS.surfaces[normal], originatingForce.OBJ.surfaces[from_normal])
    switch(this.state) {
      case orthot.state.DEFEATED:
      case orthot.state.FALLING:
        return
      default:
        //If the object below moved, move with it!  (this is to be replaced with a much more general solution based on surface interactions)
        if (normal == libek.direction.code.DOWN) {
          let pforce = orthot.topology.scan_simple(zone, THIS.ctn, THIS, heading, libek.direction.code.SOUTH, libek.direction.code.UP)
          if (heading == libek.direction.code.DOWN) {
            pforce.initiator = originatingForce.initiator
            pforce.strength = orthot.strength.LIGHT
            pforce.action = "fall"
            zone.addForce(pforce)
            originatingForce.stacked = pforce
          }
          else {
            if (sfc_interaction >= orthot.surface.interaction.DRAG) {
              pforce.strength = orthot.strength.LIGHT
              pforce.priority = 200
              pforce.action = "ride"
              zone.addForce(pforce)
            }
          }
          zone.addTickListener(THIS.update)
        }
        break
    }
  }
  
}




