orthot.Player = function(zone) {   
  orthot.StandardObject(this, zone)
  this.isPlayer = true
  this.types.push("creature")
  this.types.push("player")

  this.SpatialClass = "player"
    
  this.state = orthot.ObjectState.IDLE
  
  let orientation = {}
  libek.direction.setOrientation(orientation, "south", "up")
  
  this.forward = libek.direction.code.SOUTH
  this.up = libek.direction.code.UP
    
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
  
  this.initGraphics = function() {
    orthot.AnimateCreature(zone, this, nmap_walk, orientation, true)
    return true
  }
    
  this.OnUpdateCTN = function() {
    sviewCTL.refocustarget.set(this.ctn.x, this.ctn.y + (this.ctn.getObject_bytype("ramp") ? 1 : 0.5), this.ctn.z)
  }
  
  this.recvInput = function(inputs) {
    if (this.state == orthot.ObjectState.DEFEATED) {
      return
    }
    
    let iUP = inputs.KeyW || inputs.ArrowUp
    let iDOWN = inputs.KeyS || inputs.ArrowDown
    let iLEFT = inputs.KeyA || inputs.ArrowLeft
    let iRIGHT = inputs.KeyD || inputs.ArrowRight
        
    //If an arrow key is down, determine where it points [in relation to where the camera is pointing]
    let dir   
    if (iDOWN) {    
      dir = libek.direction.getKeyDirection("down", sviewCTL.campos.theta)
    }
    else if (iUP) {
      dir = libek.direction.getKeyDirection("up", sviewCTL.campos.theta)
    }
    else if (iRIGHT) {
      dir = libek.direction.getKeyDirection("right", sviewCTL.campos.theta)
    }
    else if (iLEFT) {
      dir = libek.direction.getKeyDirection("left", sviewCTL.campos.theta)
    }
    
    //If gravity is valid (or eventually "enabled"), set up a high-priority downward force.  
    if (this.state != orthot.ObjectState.CLIMBING) {
      let force_gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, this.forward, this.up)
      force_gravity.priority = 100
      force_gravity.initiator = this
      force_gravity.action = "fall"
      force_gravity.inputDIR = dir
      force_gravity.strength = orthot.Strength.NORMAL
      zone.addForce(force_gravity)
    }
    //process input
    switch(this.state) {
      case orthot.ObjectState.IDLE:
        if (dir) {    
          this.forward = dir.code
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir.code, this.forward, this.up)
          force.initiator = this
          force.action = "walk"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          this.animCTL.setNMAP(nmap_walk)
          zone.addForce(force)
          
          this.state = orthot.ObjectState.WALKING
        }
      break
      case orthot.ObjectState.WALKING:
        if (dir) {    
          this.forward = dir.code
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir.code, this.forward, this.up)
          force.initiator = this
          force.action = "walk"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          this.animCTL.setNMAP(nmap_walk)
          zone.addForce(force)
        }
        else {
          this.animCTL.setNMAP(nmap_walk)
          this.ready()
          this.state = orthot.ObjectState.IDLE
        }
        break
      case orthot.ObjectState.CLIMBING:   
        if (inputs.Space) {
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = orthot.ObjectState.IDLE
        }
        else if (iDOWN) {
          let force = orthot.topology.scan_downladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbdown"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          zone.addForce(force)
        }    
        else if (iUP || iLEFT || iRIGHT) {
          let force = orthot.topology.scan_upladder(zone, this.ctn, this, this.forward, this.up)
          force.initiator = this
          force.action = "climbup"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          zone.addForce(force)
        }  
        break
      case orthot.ObjectState.SLIDING:
        break
      case orthot.ObjectState.FALLING:
        if (dir) {          
          libek.direction.setOrientation(this.animCTL.orientation, dir.code, "up")   
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
    if (this.state != orthot.ObjectState.DEFEATED) {
      this.state = orthot.ObjectState.DEFEATED
      this.animCTL.defeat()
    }
    await libek.delay(4000)
    zone.reset()
    
  }
  
  this.notify_ForcePropagationClearedObstruction = function(force, other) { 
    this.animCTL.setNMAP(nmap_push)
  }
  
  this.notify_PushClearedObstruction = function(force, other) { 
    this.animCTL.setNMAP(nmap_push)
  }
  
  this.propagate = function(force) { }  
  this.struck = function(force, collision) { 
    //console.log("PLAYER-struck", force, collision) 
  }  
  this.strike = function(force, collision) { 
    //console.log("PLAYER-strike", force, collision) 
  }  
  this.move = function(force) { 
    switch(force.action) {
      case "walk":
        if ( (force.toHEADING != libek.direction.code.UP) && (force.toHEADING != libek.direction.code.DOWN) ) {        
          this.forward = force.toHEADING
        }
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.pushfixedobjectAnim(force)
          }
          else {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.walk(force)
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
            this.state = orthot.ObjectState.CLIMBING
          }
          else {
            this.animCTL.pushfixedobjectAnim(force)            
          }
          return trit.FALSE
        }
      break
      case "fall":
        if (force.isTraversable()) {
          if (this.state != orthot.ObjectState.DEFEATED) {        
            zone.putGameobject(force.toCTN, this)
            this.animCTL.fall(force)
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
          this.forward = force.toFORWARD
        }
        //else {
        //  this.forward = force.toFORWARD
        //  this.up = force.toUP
        //}
        if (force.isTraversable()) {
          if (force.isLADDEREXIT) {
            zone.putGameobject(force.toCTN, this)
            this.animCTL.exitLadder(force)
            this.state = orthot.ObjectState.WALKING
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
            this.state = orthot.ObjectState.IDLE
          }
        }
      break
      case "climbdown":
        if ( (force.toFORWARD != libek.direction.UP) && (force.toFORWARD != libek.direction.DOWN) ) {  
          this.forward = force.toFORWARD
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
            this.state = orthot.ObjectState.IDLE
          }
        }
        else {
          //isLADDERTERMINAL
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = orthot.ObjectState.IDLE
        }
      break
    }
    return trit.FALSE
  }
}
//orthot.Player.prototype = orthot.OrthotObject













