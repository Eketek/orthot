orthot.Player = function(zone, align, init_fpmode) {   
  orthot.StandardObject(this, zone)
  this.isPlayer = true
  this.types.push("creature")
  this.types.push("player")

  this.SpatialClass = "player"
    
  this.state = orthot.state.IDLE
  
  this.forward = libek.direction.code.SOUTH
  this.up = libek.direction.code.UP
  
  if (align) {
    this.forward = align.forward
    this.up = align.up
  }
  let orientation = {}
  libek.direction.setOrientation(orientation, this.forward, this.up)
  
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
  
  this.shoe_sfctype = orthot.surface.type.SMOOTH
  
  this.initGraphics = (function() {
    orthot.AnimateCreature(zone, this, nmap_walk, orientation, true)
    
    libek.direction.setOrientation(this.animCTL.orientation, this.forward, this.up)   
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
  
  let getSFCinteraction = (function(fgrav) {
    if (!fgrav) {
      fgrav = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, this.forward, this.up)
    }
    let gravOBJ = zone.getObstructor(this, fgrav.toCTN)
    if (gravOBJ) {
      return orthot.surface.interact(this.shoe_sfctype, gravOBJ.surfaces[libek.direction.invert[fgrav.toHEADING]])
    }
    return orthot.surface.interaction.NONE
  }).bind(this)
  
  this.recvInput = function(inputs) {
    if (this.state == orthot.state.DEFEATED) {
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
      if (this.state != orthot.state.CLIMBING) {
      
        if (iUP) {
          dir = libek.direction.getKeyDirection("up", sviewCTL.campos.theta).code
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
        dir = libek.direction.getKeyDirection("down", sviewCTL.campos.theta).code
      }
      else if (iUP) {
        dir = libek.direction.getKeyDirection("up", sviewCTL.campos.theta).code
      }
      else if (iRIGHT) {
        dir = libek.direction.getKeyDirection("right", sviewCTL.campos.theta).code
      }
      else if (iLEFT) {
        dir = libek.direction.getKeyDirection("left", sviewCTL.campos.theta).code
      }
    }
        
    //If gravity is valid (or eventually "enabled"), set up a high-priority downward force.  
    let force_gravity
    if (this.state != orthot.state.CLIMBING) {
      force_gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, this.forward, this.up)
      force_gravity.priority = 100
      force_gravity.initiator = this
      force_gravity.action = "fall"
      //force_gravity.inputDIR = dir
      force_gravity.strength = orthot.strength.NORMAL
      zone.addForce(force_gravity)
    }
    let sfc_interaction = getSFCinteraction(force_gravity)
    
    //process input
    switch(this.state) {
      case orthot.state.IDLE:
        if (dir) {
          //this.forward = dir.code
          setFWD(dir)
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir, this.forward, this.up)
          force.initiator = this
          this.animCTL.setNMAP(nmap_walk)
          
          if (sfc_interaction == orthot.surface.interaction.SLIDE) {
            force.strength = orthot.strength.LIGHT
            //this.state = orthot.state.SLIDING
            force.action = "slide"
          }
          else {
            force.strength = orthot.strength.NORMAL
            this.state = orthot.state.WALKING         
            force.action = "walk" 
          }
          zone.addForce(force)  
        }
        break
      case orthot.state.WALKING:
        if (dir) {    
          //this.forward = dir.code
          setFWD(dir)
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir, this.forward, this.up)
          force.initiator = this
          //force.inputDIR = dir
          this.animCTL.setNMAP(nmap_walk)
          
          if (sfc_interaction == orthot.surface.interaction.SLIDE) {
            force.strength = orthot.strength.LIGHT    
            //this.state = orthot.state.SLIDING
            force.action = "slide"
          }
          else {
            force.strength = orthot.strength.NORMAL  
            force.action = "walk"
          }
          zone.addForce(force)
        }
        else {
          this.animCTL.setNMAP(nmap_walk)
          this.ready()
          this.state = orthot.state.IDLE
        }
        break
      case orthot.state.CLIMBING:   
        if (inputs.Space) {
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = orthot.state.IDLE
        }
        else if (iDOWN) {
          let force = orthot.topology.scan_downladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbdown"
          //force.inputDIR = dir
          force.strength = orthot.strength.NORMAL
          zone.addForce(force)
        }    
        else if (iUP || iLEFT || iRIGHT) {
          let force = orthot.topology.scan_upladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbup"
          //force.inputDIR = dir
          force.strength = orthot.strength.NORMAL
          zone.addForce(force)
        }  
        break
      // SLIDING - Player-avatar very gracefully continues moves forward, regardless of player input or intent, until he smacks into something.
      case orthot.state.SLIDING:
        let force = orthot.topology.scan_ramp(zone, this.ctn, this, this.slideHEADING, this.forward, this.up)
        force.initiator = this
        this.animCTL.setNMAP(nmap_walk)
        
        if (sfc_interaction == orthot.surface.interaction.SLIDE) {
          force.strength = orthot.strength.NORMAL
          //this.state = orthot.state.SLIDING
          force.action = "slide"
          zone.addForce(force)  
        }
        else {
          this.state = orthot.state.IDLE
          this.ready() 
        }
        break
      case orthot.state.FALLING:
        if (dir) {          
          libek.direction.setOrientation(this.animCTL.orientation, dir, "up")   
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
        orthot.showDescription(item)
      },
      mouseleave: evt => {
        orthot.hideDescription(item)
      },
      click: evt => {
        if (item.activate) {
          item.activate()
        }
      }
    }
    item.domELEM = renderCTL.build_domOBJ(orthot.tiles[itype], color, "#leftside", "btn_item", callbacks)
  }
  
  this.removeItem = function(item) {    
    let doRemove = true
    
    // If the item has quantity, decrement quantity and only remove the item if quantity reaches 0
    if (typeof(item.quantity) == "number") {
      item.quanity--
      if (item.quantity > 0) {
        orthot.updateDescription(item)
        doRemove = false
      }
    }
        
    if (doRemove) {      
      orthot.hideDescription(item)
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
    if (this.state != orthot.state.DEFEATED) {
      this.state = orthot.state.DEFEATED
      this.animCTL.defeat()
    }
    await libek.delay(4000)
    zone.reset()
    
  }
  
  this.notify_ForcePropagationClearedObstruction = function(force, other) { 
    if (this.state == orthot.state.WALKING) {
      this.animCTL.setNMAP(nmap_push)
    }
  }
  
  this.notify_PushClearedObstruction = function(force, other) { 
    if (this.state == orthot.state.WALKING) {
      this.animCTL.setNMAP(nmap_push)
    }
  }
  
  this.struck = function(force, collision) { 
    //console.log("PLAYER-struck", force, collision) 
  }  
  this.strike = function(force, collision) { 
    //console.log("PLAYER-strike", force, collision) 
    if ( (force.action != "fall") && (this.state == orthot.state.SLIDING) ) {
      this.animCTL.setNMAP(nmap_walk)
      this.animCTL.slidestrike(force)
      force.resolved = true
      this.state = orthot.state.IDLE
      this.ready()
    }
  }  
  this.move = function(force) { 
    switch(force.action) {
      case "slide":
        if ( (force.toHEADING != libek.direction.code.UP) && (force.toHEADING != libek.direction.code.DOWN) ) { 
          setFWD(force.toHEADING)
        }
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.slidestrike(force)
            this.state = orthot.state.IDLE
          }
          else {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.slide(force)
            this.state = orthot.state.SLIDING
            this.slideHEADING = force.toHEADING
            return trit.TRUE
          }
        }
        this.state = orthot.state.IDLE
        return trit.FALSE
        break
      case "walk":
        if ( (force.toHEADING != libek.direction.code.UP) && (force.toHEADING != libek.direction.code.DOWN) ) { 
          setFWD(force.toHEADING)
        }
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.pushfixedobjectAnim(force)
          }
          else {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.walk(force)
            
            if ( (force.toHEADING != libek.direction.code.DOWN) && (force.toHEADING != libek.direction.code.UP) ) {
              let sfc_interaction = getSFCinteraction()
              if (sfc_interaction == orthot.surface.interaction.SLIDE) {
                this.state = orthot.state.SLIDING
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
          let ldr = force.toCTN.getSideobject_bytype(libek.direction.invert[force.toHEADING], "ladder")
          if (ldr) {
            this.animCTL.grabLadder(force)  
            this.state = orthot.state.CLIMBING
          }
          else {
            this.animCTL.pushfixedobjectAnim(force)            
          }
          return trit.FALSE
        }
      break
      case "fall":
        if (force.isTraversable()) {
          if (this.state != orthot.state.DEFEATED) {        
            zone.putGameobject(force.toCTN, this)
            this.animCTL.fall(force)
            
            if ( (force.toHEADING != libek.direction.code.DOWN) && (force.toHEADING != libek.direction.code.UP) ) {
              let sfc_interaction = getSFCinteraction()
              if (sfc_interaction == orthot.surface.interaction.SLIDE) {
                this.state = orthot.state.SLIDING
                this.slideHEADING = force.toHEADING
              }
              else {
                this.state = orthot.state.IDLE
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
        if ( (force.toFORWARD != libek.direction.code.UP) && (force.toFORWARD != libek.direction.code.DOWN) ) {  
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
            this.state = orthot.state.WALKING
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
            this.state = orthot.state.IDLE
          }
        }
      break
      case "climbdown":
        if ( (force.toFORWARD != libek.direction.UP) && (force.toFORWARD != libek.direction.DOWN) ) {  
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
            this.state = orthot.state.IDLE
          }
        }
        else {
          //isLADDERTERMINAL
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = orthot.state.IDLE
        }
      break
    }
    return trit.FALSE
  }
}
//orthot.Player.prototype = orthot.OrthotObject













