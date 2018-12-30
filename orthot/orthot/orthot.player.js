orthot.Player = function(zone) {    
  //this.ctn = startctn
  
  this.__init__(zone)
  this.isPlayer = true
  this.types.push("creature")
  this.types.push("player")

  this.SpatialClass = "player"
    
  this.state = orthot.ObjectState.IDLE
  
  let orientation = {}
  libek.direction.setOrientation(orientation, "south", "up")
  
  this.forward = libek.direction.code.SOUTH
  this.up = libek.direction.code.UP
    
  
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
    let force_gravity
    switch(this.state) {
      case orthot.ObjectState.DEFEATED:
        return
      case orthot.ObjectState.FALLING:
        force_gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, this.forward, this.up)
        if (!force_gravity.isTraversable()) {
          this.state = orthot.ObjectState.IDLE
        }
        break
      case orthot.ObjectState.IDLE:
      case orthot.ObjectState.WALKING:
        force_gravity = orthot.topology.scan_simple(zone, this.ctn, this, libek.direction.code.DOWN, this.forward, this.up)
        if (force_gravity.isTraversable()) {
          this.animCTL.setNMAP(nmap_walk)
          this.state = orthot.ObjectState.FALLING
        }
        break
      case orthot.ObjectState.CLIMBING:
        break
      
    }
        
    //If an arrow key is down, determine where it points [in relation to where the camera is pointing]
    let dir    
    if (inputs.ArrowDown) {    
      dir = libek.direction.getKeyDirection("down", sviewCTL.campos.theta)
    }
    else if (inputs.ArrowUp) {
      dir = libek.direction.getKeyDirection("up", sviewCTL.campos.theta)
    }
    else if (inputs.ArrowRight) {
      dir = libek.direction.getKeyDirection("right", sviewCTL.campos.theta)
    }
    else if (inputs.ArrowLeft) {
      dir = libek.direction.getKeyDirection("left", sviewCTL.campos.theta)
    }
    
    //process input
    switch(this.state) {
      case orthot.ObjectState.IDLE:
        if (dir) {    
          //console.log("try-walk")
          //console.log(dir)
          this.forward = dir.code
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir.code, this.forward, this.up)
          force.OBJ = this
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
          //console.log("try-walk")
          //console.log(dir)
          this.forward = dir.code
          let force = orthot.topology.scan_ramp(zone, this.ctn, this, dir.code, this.forward, this.up)
          force.OBJ = this
          force.initiator = this
          force.action = "walk"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          this.animCTL.setNMAP(nmap_walk)
          zone.addForce(force)
        }
        else {
          this.animCTL.setNMAP(nmap_walk)
          //this.animCTL.nmap = walk_nmap
          this.ready()
          this.state = orthot.ObjectState.IDLE
        }
      break
      case orthot.ObjectState.CLIMBING:   
        if (inputs.Space) {
          this.animCTL.hopoffLadder(this.forward, this.up)  
          this.state = orthot.ObjectState.IDLE
        }
        else if (inputs.ArrowDown) {
          //console.log(inputs)
          let force = orthot.topology.scan_downladder(zone, this.ctn, this, this.forward, this.up)
          force.OBJ = this
          force.initiator = this
          force.action = "climbdown"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          zone.addForce(force)
        }    
        else if (inputs.ArrowUp || inputs.ArrowLeft || inputs.ArrowRight) {
          //console.log(inputs)
          let force = orthot.topology.scan_upladder(zone, this.ctn, this, this.forward, this.up)
          force.OBJ = this
          force.initiator = this
          force.action = "climbup"
          force.inputDIR = dir
          force.strength = orthot.Strength.NORMAL
          zone.addForce(force)
          //this.animCTL.setNMAP(zone.addForce(force) ? nmap_push : nmap_walk)
        }  
      break
      case orthot.ObjectState.SLIDING:
      break
      case orthot.ObjectState.FALLING:
          //console.log("try-fall")
        if (dir) {          
          libek.direction.setOrientation(this.animCTL.orientation, dir.code, "up")   
          this.ready()
        }        
        
        force_gravity.OBJ = this
        force_gravity.initiator = this
        force_gravity.action = "fall"
        force_gravity.inputDIR = dir
        force_gravity.strength = orthot.Strength.NORMAL
        zone.addForce(force_gravity)
        
      break
    }
    
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
  },
  
  this.propagate = function(force) { }  
  this.struck = function(force, collision) { 
    //console.log("PLAYER-struck", force, collision) 
  }  
  this.strike = function(force, collision) { 
    //console.log("PLAYER-strike", force, collision) 
  }  
  this.move = function(force) { 
    //if (force.isPortaljump) {
      //console.log(force)
    //}
    switch(force.action) {
      case "walk":
        this.forward = force.toHEADING
        //this.up = force.toUP
        if (force.isTraversable()) {
          if (force.toBLOCKINGRAMP) {
            this.animCTL.pushfixedobjectAnim(force)
          }
          else {
            //console.log("do-walk")
            zone.putGameobject(force.toCTN, this)
            this.animCTL.walk(force)
          }
          return trit.TRUE
        }
        else if (!force.deferred) {
          //console.log("defer-walk")
          force.toCTN.push(force)
          return trit.MAYBE
        }
        else {
          this.animCTL.setNMAP(nmap_walk)
          let ldr = force.toCTN.getSideobject_bytype(libek.direction.invert[force.toHEADING], "ladder")
          if (ldr) {
            console.log(ldr, libek.direction.name[libek.direction.invert[force.toHEADING]]) 
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
        console.log("CLIMB:", force)
        this.forward = force.toFORWARD
        //this.up = force.toUP
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
        console.log("CLIMB:", force)
        this.forward = force.toFORWARD
        //this.up = force.toUP
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
}
orthot.Player.prototype = orthot.OrthotObject













