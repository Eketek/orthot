export { Player }

import { trit, delay } from '../libek/libek.js'
import { direction, setOrientation, getKeyDirection } from '../libek/direction.js'

import { sviewCTL, renderCTL, orthotCTL } from './orthot.js'
import { StandardObject } from './object.js'
import { ObjectState, Strength, Collision } from './enums.js'
import { Surface, getSurfaceInteraction } from './surface.js'
import { AnimateCreature } from './animation.js'
import { scan_simple, scan_ramp, scan_downladder, scan_upladder } from './topology.js'

var Player = function(zone, align, init_fpmode) {   
  StandardObject.call(this, zone)
  this.isPlayer = true
  this.types.push("creature")
  this.types.push("player")
  
  window.player = this

  this.SpatialClass = "player"
    
  this.state = ObjectState.IDLE
  
  this.forward = direction.code.SOUTH
  this.up = direction.code.UP
  
  if (align) {
    this.forward = align.forward
    this.up = align.up
  }
  let orientation = {}
  setOrientation(orientation, this.forward, this.up)
  
  let dir_rad = [
    0,0,0,
    Math.PI*1.0,
    Math.PI*0.5,
    Math.PI*0.0,
    Math.PI*1.5
  ]
  
  let setFWD = (function(fwd) {
    if (fwd != this.forward) {
      this.forward = fwd
      sviewCTL.swivel_camtheta(dir_rad[this.forward], zone.ticklen) 
    }
  }).bind(this)
  
    
  let inventory = this.inventory = []
  
  let nmap_walk = {
    stand:"man",
    walk:"man_walk",
    climb:"man_climb",
    leap:"man_leap",
    push:"man_push",
    pushwalk:"man_pushwalk",
    pushleap:"man_pushleap",
    slide1:"man_slide1",
    slide2:"man_slide2",
    slide3:"man_slide3",
    slide4:"man_slide4",
    slide5:"man_slide5"      
  }
  
  let nmap_push = {
    stand:"man_push",
    walk:"man_pushwalk",
    climb:"man_climb",
    leap:"man_pushleap",
    push:"man_push",
    pushwalk:"man_pushwalk",
    pushleap:"man_pushleap",
    slide1:"man_slide1",
    slide2:"man_slide2",
    slide3:"man_slide3",
    slide4:"man_slide4",
    slide5:"man_slide5"      
  }
  let fpmode
  
  // First-person mode auto-switch notification
  //  fpmode_on:  if true, FP-mode is ON, kis false, fp-mode is OFF
  //  fpmode_moused:   If true, FP-mode view is mouse-controlled, if false, FP-mode view is keyboard controlled
  //    When FP-mode view is mouse-controlled, keys work exactly like in third-person view, allowing User to move and mouse-look independently
  //    WHen it is keyboard-controlled, the "up" key moves forward and the other keys rotate the view
  this.setFPmode = function(fpmode_on, fpmode_moused) {
    fpmode = fpmode_on && !fpmode_moused
    if (fpmode_on) {
      this.animCTL.hide()
    }
    else {
      this.animCTL.show()
    }
  }
  
  this.shoe_sfctype = Surface.type.SMOOTH
  this.can_skate = false
  
  this.initGraphics = (function() {
    AnimateCreature(zone, this, nmap_walk, orientation, true)
    
    setOrientation(this.animCTL.orientation, this.forward, this.up)   
    this.ready()
    
    if (init_fpmode) {
      sviewCTL.setFPmode(true, dir_rad[this.forward])
      this.setFPmode(true, false)
    }
    return true
  }).bind(this)
  
    
  this.OnUpdateCTN = function() {
    sviewCTL.refocustarget.set(this.ctn.x, this.ctn.y + (this.ctn.getObject_bytype("ramp") ? 1 : 0.5), this.ctn.z)
  }
  
  let getGravShearSurfaceinteraction = (function(fgrav) {
    if (!fgrav) {
      fgrav = scan_simple(zone, this.ctn, this, direction.code.DOWN, this.forward, this.up)
    }
    let gravOBJ = zone.getObstructor(this, fgrav.toCTN)
    if (gravOBJ) {
      return getSurfaceInteraction(this.shoe_sfctype, gravOBJ.surfaces[direction.invert[fgrav.toHEADING]])
    }
    return Surface.interaction.NONE
  }).bind(this)
  
  this.recvInput = function(inputs) {
    if (this.state == ObjectState.DEFEATED) {
      return
    }
    
    let iUP = inputs.KeyW || inputs.ArrowUp
    let iDOWN = inputs.KeyS || inputs.ArrowDown
    let iLEFT = inputs.KeyA || inputs.ArrowLeft
    let iRIGHT = inputs.KeyD || inputs.ArrowRight
        
        
    let dir       
    let prev_force
    
    if (fpmode) {    
      // override FP-mode view-manipulation while on ladders
      if (this.state != ObjectState.CLIMBING) {
      
        if (iUP) {
          dir = getKeyDirection("up", sviewCTL.campos.theta).code
          this.forward = dir
        }
        else {
          let _t = Math.round(sviewCTL.campos.theta / (Math.PI/2)) * (Math.PI/2)        
          if (iDOWN) {    
            _t += Math.PI
            sviewCTL.swivel_camtheta(_t, zone.ticklen)
          }
          else if (iRIGHT) {
            _t -= (Math.PI)*0.5
            sviewCTL.swivel_camtheta(_t, zone.ticklen)
          }
          else if (iLEFT) {
            _t += (Math.PI)*0.5
            sviewCTL.swivel_camtheta(_t, zone.ticklen)
          }
        }
      }
    }
    else {
      //If an arrow key is down, determine where it points [in relation to where the camera is pointing]
      if (iDOWN) {    
        dir = getKeyDirection("down", sviewCTL.campos.theta).code
      }
      else if (iUP) {
        dir = getKeyDirection("up", sviewCTL.campos.theta).code
      }
      else if (iRIGHT) {
        dir = getKeyDirection("right", sviewCTL.campos.theta).code
      }
      else if (iLEFT) {
        dir = getKeyDirection("left", sviewCTL.campos.theta).code
      }
    }
        
    //If gravity is valid (or eventually "enabled"), set up a high-priority downward force.  
    let force_gravity
    if (this.state != ObjectState.CLIMBING) {
      force_gravity = scan_simple(zone, this.ctn, this, direction.code.DOWN, this.forward, this.up)
      force_gravity.priority = 100
      force_gravity.initiator = this
      force_gravity.action = "fall"
      //force_gravity.inputDIR = dir
      force_gravity.strength = Strength.NORMAL
      zone.addForce(force_gravity)
    }
    let sfc_interaction = getGravShearSurfaceinteraction(force_gravity)
    
    //process input
    switch(this.state) {
      case ObjectState.IDLE:
        if (dir) {
          //this.forward = dir.code
          setFWD(dir)
          let force = scan_ramp(zone, this.ctn, this, dir, this.forward, this.up)
          force.initiator = this
          this.animCTL.setNMAP(nmap_walk)
          
          if (sfc_interaction == Surface.interaction.SLIDE) {
            force.strength = Strength.LIGHT
            //this.state = ObjectState.SLIDING
            force.action = "slide"
          }
          else {
            force.strength = Strength.NORMAL
            this.state = ObjectState.WALKING         
            force.action = "walk" 
          }
          zone.addForce(force)  
        }
        break
      case ObjectState.PANIC:
        // Panic is caused by getting caught by something that pushes with crushing force.  
        // Panic doesn't help much.  for now.
        // Maybe allow escape if there is something solid on the side to push against
        if (dir) {    
          setFWD(dir)
        }
        break
      case ObjectState.WALKING:
        if (dir) {    
          //this.forward = dir.code
          setFWD(dir)
          let force = scan_ramp(zone, this.ctn, this, dir, this.forward, this.up)
          force.initiator = this
          //force.inputDIR = dir
          this.animCTL.setNMAP(nmap_walk)
          
          if (sfc_interaction == Surface.interaction.SLIDE) {
            force.strength = Strength.LIGHT    
            //this.state = ObjectState.SLIDING
            force.action = "slide"
          }
          else {
            force.strength = Strength.NORMAL  
            force.action = "walk"
          }
          zone.addForce(force)
        }
        else {
          this.animCTL.setNMAP(nmap_walk)
          this.ready()
          this.state = ObjectState.IDLE
        }
        break
      case ObjectState.CLIMBING:   
        if (inputs.Space) {
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = ObjectState.IDLE
        }
        else if (iDOWN) {
          let force = scan_downladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbdown"
          //force.inputDIR = dir
          force.strength = Strength.NORMAL
          zone.addForce(force)
        }    
        else if (iUP || iLEFT || iRIGHT) {
          let force = scan_upladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbup"
          //force.inputDIR = dir
          force.strength = Strength.NORMAL
          zone.addForce(force)
        }  
        break
      // SLIDING - Player-avatar very gracefully continues moves forward, regardless of player input or intent, until he smacks into something.
      case ObjectState.SLIDING:
        if (this.can_skate && dir) {
          this.slideHEADING = dir
          setFWD(dir)
        }
        let force = scan_ramp(zone, this.ctn, this, this.slideHEADING, this.forward, this.up)
        force.initiator = this
        this.animCTL.setNMAP(nmap_walk)
        
        if (sfc_interaction == Surface.interaction.SLIDE) {
          force.strength = Strength.NORMAL
          //this.state = orthot.state.SLIDING
          force.action = "slide"
          zone.addForce(force)  
        }
        else {
          this.state = ObjectState.IDLE
          this.ready() 
        }
        break
      case ObjectState.FALLING:
        if (dir) {          
          setOrientation(this.animCTL.orientation, dir, "up")   
          this.ready()
        }
        break
    }    
  }
  
  this.pickupItem = function(item) {
    let idx = inventory.length
    inventory.push(item)
    let itype = item.itemType
    let color = item.color ? item.color : new THREE.Color("white")
    let callbacks = {
      mouseenter: evt => {
        orthotCTL.showDescription(item)
      },
      mouseleave: evt => {
        orthotCTL.hideDescription(item)
      },
      click: evt => {
        if (item.activate) {
          item.activate()
        }
      }
    }
    item.domELEM = renderCTL.build_domOBJ(orthotCTL.tiles[itype], color, "#leftside", "btn_item", callbacks)
  }
  
  this.removeItem = function(item) {    
    let doRemove = true
    
    // If the item has quantity, decrement quantity and only remove the item if quantity reaches 0
    if (typeof(item.quantity) == "number") {
      item.quanity--
      if (item.quantity > 0) {
        orthotCTL.updateDescription(item)
        doRemove = false
      }
    }
        
    if (doRemove) {      
      orthotCTL.hideDescription(item)
      let idx = inventory.indexOf(item)
      inventory.splice(idx,1)
      item.domELEM.remove()
    }    
  }
  
  let _destroy = this.destroy
  this.destroy = function() {
    if (!_destroy()) {
      return false
    }
    
    for (let item of inventory) {
      item.destroy()
      if (item.domELEM) {
        item.domELEM.remove()
      }
    }
    
    return true
  }
  
  this.defeat = async function() {
    if (this.state != ObjectState.DEFEATED) {
      this.state = ObjectState.DEFEATED
      this.animCTL.defeat()
    }
    await delay(4000)
    zone.reset()
    
  }
  
  this.notify_ForcePropagationClearedObstruction = function(force, other) { 
    if (this.state == ObjectState.WALKING) {
      this.animCTL.setNMAP(nmap_push)
    }
  }
  
  this.notify_PushClearedObstruction = function(force, other) { 
    if (this.state == ObjectState.WALKING) {
      this.animCTL.setNMAP(nmap_push)
    }
  }
  
  this.struck = function(force, other, collision, crash=false) { 
    //console.log("PLAYER-struck", force, collision) 
  }  
  this.strike = function(force, other, collision, crash=false) { 
    //console.log("PLAYER-strike force:", force, "other:", other, "collision:", collision, "state:", this.state) 
    if (force.action == "slide") {
      this.animCTL.setNMAP(nmap_walk)
      this.animCTL.slidestrike(force)
      force.cancelled = true
      this.state = ObjectState.IDLE
      this.ready()
    }
  }  
  
  
  this.propagateForce = function(force) {
    if (this.state == ObjectState.DEFEATED) {
      return
    }
    
    force.OBJ.strike(force, this, Collision.SIMPLE)
    this.struck(force, force.OBJ, Collision.SIMPLE)
    
    if (force.strength >= Strength.CRUSHING) {
      let cf = scan_simple(zone, this.ctn, this, force.toHEADING, direction.code.SOUTH, direction.code.UP)      
      cf.pusher = force.OBJ
      cf.initiator = force.initiator
      cf.action = "crushed"     
      cf.priority = 500
      zone.addForce(cf)
    }
    
  }
  
  this.move = function(force) { 
    switch(force.action) {
      case "crushed":
        if ( (force.toHEADING != direction.code.UP) && (force.toHEADING != direction.code.DOWN) ) { 
          setFWD(force.toHEADING)
        }
        
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.defeat()
          }
          else {
            this.state = ObjectState.SHOVED
            zone.putGameobject(force.toCTN, this)
            this.animCTL.slide(force)
          }
        }
        else {
          this.defeat()
        }
        return trit.TRUE          
        break
      case "slide":
        if ( (force.toHEADING != direction.code.UP) && (force.toHEADING != direction.code.DOWN) ) { 
          setFWD(force.toHEADING)
        }
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.slidestrike(force)
            this.state = ObjectState.IDLE
          }
          else {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.slide(force)
            this.state = ObjectState.SLIDING
            this.slideHEADING = force.toHEADING
            return trit.TRUE
          }
        }
        break
      case "walk":
        if ( (force.toHEADING != direction.code.UP) && (force.toHEADING != direction.code.DOWN) ) { 
          setFWD(force.toHEADING)
        }
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.pushfixedobjectAnim(force)
          }
          else {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.walk(force)
            
            if ( (force.toHEADING != direction.code.DOWN) && (force.toHEADING != direction.code.UP) ) {
              let sfc_interaction = getGravShearSurfaceinteraction()
              if (sfc_interaction == Surface.interaction.SLIDE) {
                this.state = ObjectState.SLIDING
                this.slideHEADING = force.toHEADING
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
          this.animCTL.setNMAP(nmap_walk)
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
        break
      case "fall":
        if (force.isTraversable()) {
          if (this.state != ObjectState.DEFEATED) {        
            zone.putGameobject(force.toCTN, this)
            this.animCTL.fall(force)
            
            if ( (force.toHEADING != direction.code.DOWN) && (force.toHEADING != direction.code.UP) ) {
              let sfc_interaction = getGravShearSurfaceinteraction()
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
        if ( (force.toFORWARD != direction.code.UP) && (force.toFORWARD != direction.code.DOWN) ) {  
          //this.forward = force.toFORWARD          
          setFWD(force.toFORWARD)
        }
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
        if ( (force.toFORWARD != direction.UP) && (force.toFORWARD != direction.DOWN) ) {  
          //this.forward = force.toFORWARD      
          setFWD(force.toFORWARD)
        }
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
  }
}













