/*

Creatures wander around under their own volition and will defeat Player on contact.  

Mouse
A mouse moves forward along the edges and/or walls to its right.  If it doesn't have an edge or wall to follow, it moves forward until it finds one.  Mice 
defeat the player on contact and make no effort to avoid.

Moose
Moose are just like mice, except they follow edges and walls to the left

Robot
Robots turn every time they reach an obstruction or edge.  

Ball
Balls move and bounce back and forth horizontally between obstructions.  They will fall off ledges if they encounter them.  Balls push wall-attached buttons.  
They also defeat Player.

Little Dog
Little Dog chases and defeats Player.

Big Dog
Like the smaller variety, except larger, somewhat more obvious, and will also jump off ledges to get at Player.

Kitten
Kitten avoids Player.  If Kitten is cornered (no path to a wide-open area away from Player that avoids Player), Kitten will change strategy, approach and defeat 
Player.

Cat
Like Kitten, but also can also climb one-unit high walls.  Elevated cat thinks Player also can climb one-unit high walls.

*/
export { Mouse, Moose }

import { trit, getUID, getAsset } from '../libek/libek.js'
import { direction, setOrientation } from '../libek/direction.js'

import { orthotCTL } from './orthot.js'
import { StandardObject } from './object.js'
import { ObjectState, Strength, Collision } from './enums.js'
import { AnimateCreature } from './animation.js'
import { scan_simple, scan_ramp } from './topology.js'
import { Surface, getSurfaceInteraction } from './surface.js'


var Creature = function(zone, align, mdlName, victoryStatement) {  
  StandardObject.call(this, zone)
  this.UID = getUID()
  this.isCreature = true
  this.types.push("creature")
  this.SpatialClass = "creature"
  this.shoe_sfctype = Surface.type.SMOOTH
  this.can_skate = false
  this.slideStrength = Strength.NORMAL
  
  this.setBaseSurface(Surface.type.ROUGH)
    
  this.state = ObjectState.IDLE
  
  this.forward = direction.code.SOUTH
  this.up = direction.code.UP
  
  this.hasMovementPriority = function(this_force, other_force, collisiontype) {
    if (other_force.OBJ.isCreature) {
      return this.UID < other_force.OBJ.UID
    }
  }
  
  let nmap = {
    stand:mdlName,
    walk:mdlName,
    climb:mdlName,
    leap:mdlName,
    push:mdlName,
    pushwalk:mdlName,
    pushleap:mdlName,
    slide1:mdlName,
    slide2:mdlName,
    slide3:mdlName,
    slide4:mdlName,
    slide5:mdlName      
  }
  
  if (align) {
    this.forward = align.forward
    this.up = align.up
  }
  
  let orientation = {}
  setOrientation(orientation, this.forward, this.up)
  this.AutoGravity = true
  
  zone.addTickListener(this.update)
  
  this.initGraphics = (function() {
    AnimateCreature(zone, this, nmap, orientation, false)    
    setOrientation(this.animCTL.orientation, this.forward, this.up)   
    this.ready()
    
    return true
  }).bind(this)
  
  this.intruded = this.intrude = function(other) {
    if (other.isPlayer) {
      zone.addTickListener_temp(() => { other.defeat(victoryStatement) } )
      //console.log("sceneportal-data", this._ekvxdata_)
      //other.defeat()
    }
  }
  
  this.strike = function(force, other, collision, crash=false) { 
    if (force.action == "slide") {
      this.animCTL.slidestrike(force)
      force.cancelled = true
      this.state = ObjectState.IDLE
      this.ready()
    }
  }
  
  let getGravShearSurfaceinteraction = (function(fgrav) {
    if (!fgrav) {
      fgrav = scan_simple(zone, this.ctn, this, direction.code.DOWN, this.forward, this.up)
    }
    let gravOBJ = zone.getObstructor(this, fgrav.toCTN)
    if (gravOBJ) {
      let sfci = getSurfaceInteraction(this.shoe_sfctype, gravOBJ.surfaces[direction.invert[fgrav.toHEADING]])
      if (sfci == Surface.interaction.SLIDE) {
        console.log(this, gravOBJ, this.shoe_sfctype, gravOBJ.surfaces[direction.invert[fgrav.toHEADING]])
        zone.HALT("because")
      }
      return sfci
    }
    return Surface.interaction.NONE
  }).bind(this)
  
  this.setFWD = (function(fwd) {
    if (fwd != this.forward) {
      this.forward = fwd
    }
  }).bind(this)
  
  this.move = (function(force) { 
    if (this.state == ObjectState.DEFEATED) {
      return trit.TRUE
    }
    
    let sfc_interaction = getGravShearSurfaceinteraction()
    
    switch(force.action) {
      case "crushed":
        if (force.isTraversable()) {
          this.state = ObjectState.SHOVED
          zone.putGameobject(force.toCTN, this)
          this.animCTL.slide(force)
        }
        else {
          this.defeat()
        }
        return trit.TRUE          
        break
      
      case "slide":
        this.setFWD(force.toHEADING)
        if (force.isTraversable()) {
          zone.putGameobject(force.toCTN, this)
          this.animCTL.slide(force)
          if ( (force.toHEADING != direction.code.DOWN) && (force.toHEADING != direction.code.UP) ) {   
            sfc_interaction = getGravShearSurfaceinteraction()       
            if (sfc_interaction == Surface.interaction.SLIDE) {
              this.slideHEADING = force.toHEADING
            }
            else {
              this.state = ObjectState.IDLE
            }
          }
          //console.log("SLIDE-result:  ", this.state, this.state == ObjectState.SLIDING)
          return trit.TRUE
        }
        else {
          this.animCTL.slidestrike(force)
          this.state = ObjectState.IDLE          
        }
        break
      case "walk":    
        this.setFWD(force.toHEADING)
        if (force.isTraversable()) { 
          zone.putGameobject(force.toCTN, this)
          this.animCTL.walk(force)
          
          if ( (force.toHEADING != direction.code.DOWN) && (force.toHEADING != direction.code.UP) ) {
            sfc_interaction = getGravShearSurfaceinteraction()       
            if (sfc_interaction == Surface.interaction.SLIDE) {
              this.state = ObjectState.SLIDING
              this.slideHEADING = force.toHEADING
            }
          }
          return trit.TRUE
        }
        else if (!force.deferred) {
          force.toCTN.push(force)
          return trit.MAYBE
        }
        /*  Creatures ... that can climb ladders ... Not quite there yet
        else {
          let ldr = force.toCTN.getSideobject_bytype(direction.invert[force.toHEADING], "ladder")
          if (ldr) {
            this.animCTL.grabLadder(force)  
            this.state = ObjectState.CLIMBING
          }
          else {
            this.animCTL.pushfixedobjectAnim(force)            
          }
          return trit.FALSE
        }
          */
        break
      case "fall":
        if (force.isTraversable()) {
          if (this.state != ObjectState.DEFEATED) {        
            zone.putGameobject(force.toCTN, this)
            this.animCTL.fall(force)
            
            if ( (force.toHEADING != direction.code.DOWN) && (force.toHEADING != direction.code.UP) ) {
              sfc_interaction = getGravShearSurfaceinteraction()       
              if (sfc_interaction == Surface.interaction.SLIDE) {
                this.state = ObjectState.SLIDING
                this.slideHEADING = force.toHEADING
              }
              else {
                this.state = ObjectState.IDLE
              }
            }
          }
          return trit.TRUE
        }
        else if (!force.deferred) {
          force.toCTN.push(force)
          return trit.MAYBE
        }
        else {
          return trit.FALSE
        }
        break
      case "climbup":
        //else {
        //  this.forward = force.toFORWARD
        //  this.up = force.toUP
        //}
        if (force.isTraversable()) {
          if (force.isLADDEREXIT) {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.exitLadder(force)
            this.state = ObjectState.WALKING
            return trit.TRUE
          }
          else if (force.isLADDER) {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.climbupLadder(force)
            return trit.TRUE
          }
          else {
            //isLADDERTERMINAL
            this.animCTL.hopoffLadder(this.forward, this.up)  
            this.state = ObjectState.IDLE
          }
        }
        break
      case "climbdown":
        //else {
        //  this.forward = force.toFORWARD
        //  this.up = force.toUP
        //}
        if (force.isTraversable()) {
          if (force.isLADDER) {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.climbdownLadder(force)
            return trit.TRUE
          }
          else {
            //isLADDERTERMINAL
            this.animCTL.hopoffLadder(this.forward, this.up)  
            this.state = ObjectState.IDLE
          }
        }
        else {
          //isLADDERTERMINAL
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = ObjectState.IDLE
        }
        break
      default:
        console.log(force)
        break
    }
    return trit.FALSE
  }).bind(this);
  this.actions = {
    [ObjectState.SLIDING]:  (function() {
      let sforce = scan_simple(zone, this.ctn, this, this.slideHEADING, this.slideHEADING, direction.code.UP)
      sforce.OBJ = this
      sforce.initiator = this
      sforce.action = "slide"
      sforce.strength = (this.slideStrength != -1) ? this.slideStrength : this.slideStrength_prev
      sforce.priority = 25
      zone.addForce(sforce)
      this.setFWD(this.slideHEADING)
    }).bind(this),
  }
  this.update = (function() {
    if (this.defeated) {
      zone.removeTickListener(this.update)
      return
    }    
    
    let istate = this.state
    if (this.actions[this.state]) {
      this.actions[this.state]()
    }
    
    let gravity = scan_simple(zone, this.ctn, this, direction.code.DOWN, direction.code.NORTH, direction.code.UP)
    gravity.OBJ = this
    gravity.initiator = this
    gravity.action = "fall"
    gravity.strength = this.fallStrength
    gravity.priority = 100
    zone.addForce(gravity)
    
    //console.log("UPDATE ... ", istate, "->", this.state)
    
  }).bind(this);
  
  zone.addTickListener(this.update)
}

var solveMaze = function(hand, allow_wrongwallstart=false) {
  return function() {   
    let zone = this.zone
    let srcCTN = this.ctn
    
    let fDIR = this.forward
    let rDIR = direction.right[fDIR]
    let lDIR = direction.left[fDIR]
    let bDIR = direction.invert[fDIR]
        
    if (hand == "left") {
      let tmp = rDIR
      rDIR = lDIR
      lDIR = tmp
    }
    let force
    
    
    
    // Fake loop because JavaScript does not goto
    //    break -> goto StartWalkin
    while (true) {  
      //If movement is aligned with a ramp, move along the ramp
      let ramp = srcCTN.getObject_bytype("ramp")
      if (ramp) {
        if ((ramp.ascendDIR == fDIR) || (ramp.descendDIR == fDIR)) {
          force = scan_ramp(zone, srcCTN, this, fDIR, fDIR, this.up)
          if (force.isTraversable() && !force.hopOUT && !force.toGAP) {
            break
          }
        }
      }
      
      // If the space to the right is open and a corner can be found (searched by scanning backwards, then "left"), turn right
      //  If no corner can be found, proceed to the next check.
      // To help the mouse deal with complex geometry, if either the right-turn or the back-scanned route includes a portal or an aligned ramp,
      //  a corner is assumed.  
      //  This should probably be thought through more carefully, since this hack can easily fail if a puzzle includes wide portals and/or stairs
      //    (two or more portals which are adjacent to each other and aligned the same // two or more ramps which are adjacent to each other and aligned)
      force = scan_ramp(zone, srcCTN, this, rDIR, rDIR, this.up)
      if (force.isTraversable() && !force.hopOUT && !force.toGAP) {
        if (force.toUPRAMP || force.toDOWNRAMP || force.isPortaljump) {
          break
        }
        let auxScan = scan_ramp(zone, srcCTN, this, bDIR, bDIR, this.up)
        if (auxScan.isTraversable() && !auxScan.hopOUT && !auxScan.toGAP) {
          if (auxScan.toUPRAMP || auxScan.toDOWNRAMP || auxScan.isPortaljump) {
            break
          }
          let aux_lDIR 
          if (hand == "left") {
            aux_lDIR = direction.left[direction.invert[auxScan.toHEADING]]
          }
          else {
            aux_lDIR = direction.right[direction.invert[auxScan.toHEADING]]
          }
          auxScan = scan_ramp(zone, auxScan.toCTN, this, aux_lDIR, aux_lDIR, this.up)
          if (!(auxScan.isTraversable() && !auxScan.hopOUT && !auxScan.toGAP) ||(auxScan.toUPRAMP || auxScan.toDOWNRAMP || auxScan.isPortaljump) ) {
            break
          }
        }
        else {
          break
        }
      }
      
      //THe rest of the Mouse's decisions are simple, and it is acceptable if the mouse just runs forward to the next obstruction if it can't find a wall on 
      // the right That said there are a few cases where it would help to give the forward space the same treatment, and fewer still the left space.
      // the rear space doesn't ever need special treatment.
      force = scan_ramp(zone, srcCTN, this, fDIR, fDIR, this.up)
      if (force.isTraversable() && !force.hopOUT && !force.toGAP) {      
        break
      }
      force = scan_ramp(zone, srcCTN, this, lDIR, lDIR, this.up)
      if (force.isTraversable() && !force.hopOUT && !force.toGAP) {
        break
      }
      force = scan_ramp(zone, srcCTN, this, bDIR, bDIR, this.up)
      if (force.isTraversable() && !force.hopOUT && !force.toGAP) {
        break
      }
      this.state = ObjectState.IDLE
      return
    }
    
    // It would have been fun to have maze-solving creatures hop off the side of a downramp [due to seeing open ground] (as in Orthot II), 
    // but this time around, the underlying logic is more thoroughly defined.
    
    force.initiator = this
    this.state = ObjectState.WALKING
    force.action = "walk"
    force.strength = Strength.NORMAL
    this.setFWD(force.fromFORWARD)
    zone.addForce(force)
    return
  }
}

var Mouse = function(zone, align) { 
  Creature.call(this, zone, align, "mouse", "You were defeated by a clicktacular beast.")
  this.isMouse = true
  let mazer = solveMaze("right").bind(this)
  this.actions[ObjectState.IDLE] = mazer
  this.actions[ObjectState.WALKING] = mazer
}

var Moose = function(zone, align) {   
  Creature.call(this, zone, align, "moose", "You were defeated by a ferocious beast.")
  this.isMoose = true
  let mazer = solveMaze("left").bind(this)
  this.actions[ObjectState.IDLE] = mazer
  this.actions[ObjectState.WALKING] = mazer
}























