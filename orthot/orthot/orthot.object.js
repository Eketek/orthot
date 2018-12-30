orthot.OrthotObject = {
  isOrthotObject:true,
  initGraphics:function() { return false },
  ready:function(){},
  //pre-collision notifier.  This function [if overriden] is where to decide if the force should push the object and/or if it should crush the object,
  //  and this function is also where force proapgation should be handled.
  //This should return true if this object has propagated the force (to prevent infinite loop from force-propagation)
  // If the function returns true, no additional forces from the originating direction will be applied to the object during the same tick
  propagateForce:function(force){ return true }, 
  
  // A mechanism for allowing objects to override the default collision resolution order
  //  If true is returned for all collisions the object is involved in, this object will have the opportunity to take the space
  hasMovementPriority:function(other_OBJ, other_fromDIR, self_toDIR, collisiontype) { return false },
  
  /*  Called when this object has been struck by another object.  
      force:  The striking force
      otherOBJ:  The object doing the striking
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  struck:function(force, otherOBJ, collision, crash=false) { return false }, 
  
  /*  Called when this object is striking another object.  
      force:  The striking force
      otherOBJ:  The object being struck
      collision:  (orthot.collision) symbol indicating what sort of collision the strike is
      crash:  If true, the collision is caused by the Movement Engine being unable to resolve the collision, which, in theory, should only occur if a loop
              of forces is constructed (an edge case requiring creative usage of portals, force propagators, and gravity)
  */
  strike:function(force, otherOBJ, collision, crash=false) { return false },   
  
  //Called if requested by preStruck() and there either is space ahead or the space ahead is being vacated and strike()/struck() didn't veto the move
  move:function(force) { return false },
  
  //Called if requested by preStruck() and move either was not requested or was requested and subsequently vetoed by strike()/struck()
  crush:function(force) { },
    
  push:function(force) {},  
  
  //isTraversableBy:function(otherOBJ) {return true},
  
  intruded:function(other) {},
  
  // Called when a force originating from this object and pointed directly at another object either causes the object to leave or results in its destruction.
  //  (This is mainly used to trigger the Player pushwalk animation)
  notify_ForcePropagationClearedObstruction:function(force, other) { },
  
  defeat:function() {
    delete this.SpatialClass    //A reasonably simple way to disappear the object
    this.state = orthot.ObjectState.DEFEATED
    if (this.obj) {
      orthot.VanishAnim(this.zone, this, {
        end:(function() {
          this.zone.removeGameobject(this)
        }).bind(this),
        pos:this.worldpos
      })
    }
    this.defeated = true
  },
  
  // Wake any objects up to possibly trigger gravity
  // called whenever anything is removed from lower container (if there is a contiguous stack of non-immobile objects between the the object location
  // and the location of whatever moved)
  bump:function(stackfall=false) {
    if (this.AutoGravity) {
      this.zone.activate(this)
      return true
    }
  },
  
  stackFall:function(force) {
    return false
  },
  
  destroy:function() { 
    if (this.destroyed) {
      return
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
      libek.releaseAsset(this.obj)
    }
    if (this.sides) {
      for (let i = 1; i < this.sides.length; i++) {
        for (let sideobj of this.sides[i]) {
          if (sideobj.obj) {
            libek.releaseAsset(sideobj.obj)
          }
        }
      }
    }
  },
  
  
  getSideobject_bytype:function(side, type) {  
    if (this.sides) {
      for (let sideobj of this.sides[side]) {
        if (sideobj.type == type) {
          return sideobj
        }
      }
    }
  },
  __init__:function(zone) {
    
    this.zone = zone
    this.types = []
    
    this.sides = [ 0, [],[],[],[],[],[] ]
    
    let fproptick = -1
    let fpropdirs = []   
    
    this.__propagate_force__ = function(force, tick) {    
      if (fproptick < tick) {
        if (fpropdirs.length != 0) {
          fpropdirs = []
        }
      }
      if ( (fproptick < tick) || (fpropdirs.indexOf(force.fromDIR) == -1) ) {
        if (this.propagateForce(force)) {
          fpropdirs.push(force.fromDIR)
          fproptick = tick
          return true
        }
      }
      return false
    }
  }
}