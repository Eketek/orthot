export { OrthotObject, StandardObject, MovableObject }

import { getUID, releaseAsset, trit } from '../libek/libek.js'
import { direction } from '../libek/direction.js'

import { orthotCTL } from './orthot.js'
import { Surface, getSurfaceInteraction } from './surface.js'
import { Strength, Collision, ObjectState } from './enums.js'
import { AnimateBlock, VanishAnim } from './animation.js'
import { scan_simple } from './topology.js'

// Base object behavior
// This was intended to be implemented with prototypes, but that proved probematic when switching from the use of objects to the use of delegates for receiving
// tick events from orthot.Zone
var OrthotObject = function(zone) {
  this.id = getUID()
  this.zone = zone
  this.isOrthotObject = true
  this.initGraphics = function() { return false }
  this.ready = function(){}
  //pre-collision notifier.  This function [if overriden] is where to decide if the force should push the object and/or if it should crush the object,
  //  and this function is also where force proapgation should be handled.
  //This should return true if this object has propagated the force (to prevent infinite loop from force-propagation)
  // If the function returns true, no additional forces from the originating direction will be applied to the object during the same tick
  this.propagateForce = function(force){
    force.OBJ.strike(force, this, Collision.SIMPLE)
    this.struck(force, force.OBJ, Collision.SIMPLE)
  }

  // A mechanism for allowing objects to override the default collision resolution order
  //  If true is returned for all collisions the object is involved in, this object will have the opportunity to take the space
  this.hasMovementPriority = function(this_force, other_force, collisiontype) { return false }

  /*  Called when this object has been struck by another object.
      force:  The striking force
      otherOBJ:  The object doing the striking
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  this.struck = function(force, otherOBJ, collision, crash=false) { return false }

  /*  Called when this object is striking another object.
      force:  The striking force
      otherOBJ:  The object being struck
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  this.strike = function(force, otherOBJ, collision, crash=false) { return false }

  this.idle = function() {}

  //Called if requested by preStruck() and there either is space ahead or the space ahead is being vacated and strike()/struck() didn't veto the move
  this.move = function(force) { return false }

  this.cancelMove = function(force) {}

  //Called if requested by preStruck() and move either was not requested or was requested and subsequently vetoed by strike()/struck()
  this.crush = function(force) { }

  this.push = function(force) {}

  //isTraversableBy:function(otherOBJ) {return true},

  this.intruded = function(other) {}
  this.intrude = function(other) {}

  // Called when a force originating from this object and pointed directly at another object either causes the object to leave or results in its destruction.
  //  (This is mainly used to trigger the Player pushwalk animation)
  this.notify_ForcePropagationClearedObstruction = function(force, other) { }

  // Called when a push from this object and pointed directly at another object either causes the object to leave or results in its destruction.
  this.notify_PushClearedObstruction = function(force, other) { }
  this.notify_CrushClearedObstruction = function(force, other) { }

  this.defeat = function() {
    delete this.SpatialClass    //A reasonably simple way to disappear the object
    this.state = ObjectState.DEFEATED
    if (this.obj) {
      if (orthotCTL.lwmode) {
        zone.removeGameobject(this)
      }
      else {
        VanishAnim(zone, this, {
          end:(function() {
            zone.removeGameobject(this)
          }).bind(this),
          pos:this.worldpos
        })
      }
    }
    this.defeated = true
  }
  /*
  // Wake any objects up to possibly trigger gravity
  // called whenever anything is removed from lower container (if there is a contiguous stack of non-immobile objects between the the object location
  // and the location of whatever moved)
  this.bump = function(stackfall=false) {
    if (this.AutoGravity) {
      zone.addTickListener(this.update)
      return true
    }
  }

  this.stackFall = function(force) {
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
  this.__applyInboundIndirectForce__ = function(heading, normal, from_normal, originatingForce) {
    if (this.hasSides) {
      let slist = this.sides[normal]
      for (let attachment of slist) {
        if (attachment.stress) {
          let ss = 0
          let oobj = originatingForce.OBJ
          if (oobj.shearStrength) {
            ss = oobj.shearStrength[from_normal]
          }
          attachment.stress(originatingForce, ss)
        }
      }
    }
    this.applyInboundIndirectForce(heading, normal, from_normal, originatingForce)
  }
  this.applyInboundIndirectForce = function(heading, normal, from_normal, originatingForce) {

  }

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
  this.__applyOutboundIndirectForce__ = function(heading, normal, from_normal, originatingForce) {
    if (this.hasSides) {
      let slist = this.sides[normal]
      for (let attachment of slist) {
        if (attachment.relax) {
          let ss = 0
          let oobj = originatingForce.OBJ
          if (oobj.shearStrength) {
            ss = oobj.shearStrength[from_normal]
          }
          attachment.relax(originatingForce, ss)
        }
      }
    }
    this.applyOutboundIndirectForce(heading, normal, from_normal, originatingForce)
  }
  this.applyOutboundIndirectForce = function(heading, normal, from_normal, originatingForce) { }

  this.destroy = (function() {
    if (this.destroyed) {
      return false
    }
    this.destroyed = true
    if (this.animCTL && this.animCTL.destroy) {
      this.animCTL.destroy()
    }
    else if (this.obj) {
      //console.log("destroy ... ", this)
      if (this.obj.parent) {
        this.obj.parent.remove(this.obj)
      }
      releaseAsset(orthotCTL.assets, this.obj)
    }
    if (this.sides) {
      for (let i = 1; i < this.sides.length; i++) {
        for (let sideobj of this.sides[i]) {
          if (sideobj.obj) {
            releaseAsset(orthotCTL.assets, sideobj.obj)
          }
        }
      }
    }
    return true
  }).bind(this)

  this.getSideobject_bytype = function(side, type) {
    if (this.sides) {
      for (let sideobj of this.sides[side]) {
        if (sideobj.type == type) {
          return sideobj
        }
      }
    }
  }


  this.surfaces = [0, 0,0,0,0,0,0]
  this.setBaseSurface = function(sfctype) {
    this.surfaces.fill(sfctype)
  }

  let _shearStrength
  Object.defineProperty(this, 'shearStrength', {
    set:function(arg) {
      if (typeof(arg) == "object") {
        _shearStrength = arg
      }
      else {
        _shearStrength = [0, arg,arg,arg,arg,arg,arg]
      }
    },
    get:function() {
      return _shearStrength
    }
  })

  this.types = []

  this.sides = [ 0, [],[],[],[],[],[] ]

  this.forces = []

  this.fproptick = -1
  let fpropdirs = []

  this.__propagate_force__ = function(force, tick) {
    if (this.fproptick < tick) {
      this.fproptick = tick
      if (fpropdirs.length != 0) {
        fpropdirs = []
      }
    }

    if (fpropdirs.indexOf(force.toHEADING) == -1 ) {
      this.propagateForce(force)
      fpropdirs.push(force.toHEADING)
    }
  }
}

var StandardObject = function(zone) {
  OrthotObject.call(this, zone)

  this.initGraphics = function() {
    AnimateBlock(zone, this)
    return true
  }

  this.attach = function(sideobj) {
    //console.log("attach", sideobj, "to", this)
    sideobj.host = this
    this.sides[sideobj.up].push(sideobj)
    if (sideobj.surfacetype) {
      this.surfaces[sideobj.up] = sideobj.surfacetype
    }
  }
}

var MovableObject = function(zone) {
  StandardObject.call(this, zone)

  //Minimum amount of force-strength needed to propagate force to this object
  //  By default, objects are immobile.  Recommend using orthot.strength.<WHATEVER> as values
  this.propforceMin = Number.MAX_SAFE_INTEGER

  // Strength of propgated force.  If -1, the strength of the originating force will be used.
  this.propforceStrength = -1

  // Strength of sliding force.  If -1, the strength of the preceding force will be used.
  this.slideStrength = -1

  // Threshhold for using "crushed" logic instead of "pushed" logic
  //    (crushing force destroys the object if the object is obstructed)
  this.crushingForce = Strength.CRUSHING

  this.fallStrength = Strength.LIGHT

  let gravity

  this.update = (function() {
    if (this.defeated) {
      zone.removeTickListener(this.update)
      return
    }

    if (this.state == ObjectState.SLIDING) {
      let sforce = scan_simple(zone, this.ctn, this, this.slideHEADING, direction.code.NORTH, direction.code.UP)
      sforce.OBJ = this
      sforce.initiator = this
      sforce.action = "slide"
      sforce.strength = (this.slideStrength != -1) ? this.slideStrength : this.slideStrength_prev
      sforce.priority = 25
      zone.addForce(sforce)
    }

    gravity = scan_simple(zone, this.ctn, this, direction.code.DOWN, direction.code.NORTH, direction.code.UP)
    gravity.OBJ = this
    gravity.initiator = this
    gravity.action = "fall"
    gravity.strength = this.fallStrength
    gravity.priority = 100
    zone.addForce(gravity)

  }).bind(this);

  this.strike = function(force, otherOBJ, collision, crash=false) {

    // If this object strikes something while sliding, cancel the slide.
    if (this.state == ObjectState.SLIDING) {
      this.state = ObjectState.IDLE
      this.idle()
    }

    //Just to be safe...
    if (force.action == "slide") {
      force.cancelled = true
    }
    return false
  }

  let prev_ticknum = -10
  this.move = function(force) {
    if (force.cancelled) {
      return trit.FALSE
    }
    if (force.isTraversable()) {
      zone.putGameobject(force.toCTN, this)
      if (force.action == "fall") {
        this.state = ObjectState.FALLING
      }
      else {
        zone.addTickListener(this.update)
        if (force.toHEADING == direction.code.DOWN) {
          this.state = ObjectState.FALLING
        }
        else {
          this.state = ObjectState.WALKING
          if (force.toHEADING != direction.code.UP) {
            let ngrav = scan_simple(zone, this.ctn, this, direction.code.DOWN, direction.code.NORTH, direction.code.UP)
            let gravOBJ = zone.getObstructor(this, ngrav.toCTN)
            if (gravOBJ) {
              let gravSFC = gravOBJ.surfaces[direction.invert[ngrav.toHEADING]]
              let sfc_interaction = getSurfaceInteraction(this.surfaces[direction.code.DOWN], gravSFC)

              if (sfc_interaction == Surface.interaction.SLIDE) {
                this.state = ObjectState.SLIDING
                this.slideHEADING = force.toHEADING
                this.slideStrength_prev = force.strength
              }
            }
          }
        }
      }
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
      if ( (force.initiator == force.pusher) && ( zone.ticknum > (prev_ticknum+1) ) ) {
        this.animCTL.impulseShift(force)
      }
      else {
        this.animCTL.shift(force)
      }
      prev_ticknum = zone.ticknum
      return trit.TRUE
    }
    else if ((!force.deferred) && (force.strength > Strength.NONE)) {
      force.toCTN.push(force)
      return trit.MAYBE
    }
    else if (force.action == "fall") {
      if (this.state == ObjectState.FALLING) {
        this.animCTL.impactDown(force)
      }

      this.state = ObjectState.IDLE
      zone.removeTickListener(this.update)
      this.idle()
      return trit.FALSE
    }
    else if (force.action == "crushed") {
      this.defeat()
      zone.removeTickListener(this.update)
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
      return trit.TRUE
    }
    else {
      //console.log(this.state, force)
      //zone.removeTickListener(this.update)
      this.idle()
      return trit.FALSE
    }
  }

  this.propagateForce = function(force) {
    if (this.state == ObjectState.DEFEATED) {
      return
    }

    force.OBJ.strike(force, this, Collision.SIMPLE)
    this.struck(force, force.OBJ, Collision.SIMPLE)

    if (force.strength >= this.propforceMin) {
      let pbf = scan_simple(zone, this.ctn, this, force.toHEADING, direction.code.SOUTH, direction.code.UP)

      pbf.pusher = force.OBJ
      pbf.initiator = force.initiator
      pbf.action = force.strength >= this.crushingForce ? "crushed" : "pushed"
      pbf.priority = 50

      switch(force.toHEADING) {
        case direction.code.DOWN:
          pbf.strength = this.fallStrength
          break
        case direction.code.UP:
          break
        default: {
            pbf.strength = (this.propforceStrength != -1) ? this.propforceStrength : force.strength
            let grav = scan_simple(zone, this.ctn, this, direction.code.DOWN, direction.code.SOUTH, direction.code.UP)
            let gravOBJ = zone.getObstructor(this, grav.toCTN)
            let gravSFC = gravOBJ ? gravOBJ.surfaces[direction.invert[grav.toHEADING]] : Surface.type.FRICTIONLESS

            let sfc_interaction = getSurfaceInteraction(this.surfaces[direction.code.DOWN], gravSFC)

            // Interpreting force-strength as traction, if the force is too weak, fail.
            switch(sfc_interaction) {
              case Surface.interaction.SLIDE:
                if (force.strength < Strength.LIGHT) return
                break
              case Surface.interaction.RESIST:
              case Surface.interaction.DRAG:
                if (this.propforce_threshold < Strength.NORMAL) return
                break
              case Surface.interaction.IMPEDE:
                if (this.propforce_threshold < Strength.HARD) return
                break
              case Surface.interaction.BLOCK:
                if (this.propforce_threshold < Strength.CRUSHING) return
                break
            }
          }
          break
      }
      zone.addForce(pbf)
    }
  }

  this.hasMovementPriority = function(this_force, other_force, collisiontype) {
    if ( (collisiontype == Collision.CORNER_RAM) && (this_force.fromHEADING == direction.code.DOWN) ) {
      return true
    }
    return false
  }

  this.applyOutboundIndirectForce = function(heading, normal, from_normal, originatingForce) {
    switch(originatingForce.action) {
      case "walk":
      case "fall":
      case "pushed":
      case "retract":
      case "extend":
        break
      default:
        return
    }
    let sfc_interaction = getSurfaceInteraction(this.surfaces[normal], originatingForce.OBJ.surfaces[from_normal])
    switch(this.state) {
      case ObjectState.DEFEATED:
      case ObjectState.FALLING:
        return
      default:
        //If the object below moved, move with it!  (this is to be replaced with a much more general solution based on surface interactions)
        if (normal == direction.code.DOWN) {
          let pforce = scan_simple(zone, this.ctn, this, heading, direction.code.SOUTH, direction.code.UP)
          if (heading == direction.code.DOWN) {
            pforce.initiator = originatingForce.initiator
            pforce.strength = Strength.LIGHT
            pforce.action = "fall"
            zone.addForce(pforce)
            originatingForce.stacked = pforce
          }
          else {
            if (sfc_interaction >= Surface.interaction.DRAG) {
              pforce.strength = Strength.LIGHT
              pforce.priority = 200
              pforce.action = "ride"
              zone.addForce(pforce)
              
              //console.log("RIDE", this, originatingForce, originatingForce.action)
            }
          }
          zone.addTickListener(this.update)
        }
        break
    }
  }

}




