orthot.Wall = function(zone) { 
  orthot.OrthotObject(this, zone)
  this.SpatialClass = "solid"  
  this.hasSides = true
  
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

orthot.ScenePortal = function(zone) {  
  orthot.OrthotObject(this, zone)
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

/*  Object thta allows movement up and down along a diagonal vector.
    Stairs are regarded as "ramps" for every purpose other than graphical representation
*/
orthot.Stair = function(zone, color, align) {
  orthot.OrthotObject(this, zone)
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

// I still don't know what to call a pushblock.  A pushblock is a pushblock.
// Please don't upload this comment somewhere embarassing, such as the Internet.
orthot.PushBlock = function(zone, color) {
  orthot.StandardObject(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"    
  this.state = orthot.ObjectState.IDLE
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("pushblock")
    if (color) {
      mdl.children[1].material = libek.Material(color)
    }
    return mdl
  }
  
  this.propagateForce = function(force){
    if (this.state == orthot.ObjectState.DEFEATED) {
      return
    }
    if (force.strength >= orthot.Strength.NORMAL) {
      let pbf = orthot.topology.scan_simple(zone, this.ctn, this, force.toHEADING, libek.direction.code.SOUTH, libek.direction.code.UP)
      pbf.OBJ = this
      pbf.pusher = force.OBJ
      pbf.initiator = force.initiator
      pbf.action = force.strength >= orthot.Strength.CRUSHING ? "crushed" : "pushed"
      pbf.strength = orthot.Strength.LIGHT
      zone.addForce(pbf)
      return true
    }
    return false
  }
}

orthot.Crate = function(zone) {
  orthot.StandardObject(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"    
  this.state = orthot.ObjectState.IDLE
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("crate")
    return mdl
  }
  
  this.propagateForce = (function(force){
    if (this.state == orthot.ObjectState.DEFEATED) {
      return
    }
    if (force.strength >= orthot.Strength.NORMAL) {
      let pbf = orthot.topology.scan_simple(zone, this.ctn, this, force.toHEADING, libek.direction.code.SOUTH, libek.direction.code.UP)
      pbf.OBJ = this
      pbf.pusher = force.OBJ
      pbf.initiator = force.initiator
      pbf.action = force.strength >= orthot.Strength.CRUSHING ? "crushed" : "pushed"
      pbf.strength = force.strength   //crates propagate the input force completely
      zone.addForce(pbf)
      return true
    }
    return false
  }).bind(this)
}


orthot.Key = function(zone, color, code) {
  orthot.StandardObject(this, zone)
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.itemType = "key"
  this.SpatialClass = "item"  
  
  if (!color) {
    color = "white"
  }
  if (!code) {
    code = color
  }    
  if (code.isColor) {
    code = color.getHexString()
  }
  if (!color.isColor) {
    color = libek.util.color.parse(color)
  }
  this.color = color
  this.code = code
  
  this.description = "Key-[" + code + "]"
  
  this.visualizer = function(enable) {
    if (enable) {
      zone.showLocks(code, color)
    }
    else {
      zone.clearReticle()
    }
  }
  
  this.initGraphics = function() {
    orthot.AnimateBlock(this.zone, this)
    let axes = [ new THREE.Vector3(-0.5,1,0).normalize(), new THREE.Vector3(0,1,0) ]
    let speed = [0.4*Math.random() + 1, (-0.25)*Math.random()]
    this.animCTL.startContinuousMultiaxialRotator(speed, axes, new THREE.Vector3(0,0.5,0))
    return true
  }
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("key")
    mdl.children[0].material = libek.Material(color)
    return mdl
  }
  
  this.intruded = function(other) {
    if (other.isPlayer) {
      this.animCTL.pickedup(other.forward)
    
      zone.addTickListener_temp( () => {
        zone.removeGameobject(this)
        other.pickupItem(this)
      })      
    }
  }
}

orthot.Lock = function(zone, color, code) {
  orthot.StandardObject(this, zone)
  this.hasSides = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"  
  
  if (!color) {
    color = "white"
  }
  if (!code) {
    code = color
  }    
  if (code.isColor) {
    code = color.getHexString()
  }
  if (!color.isColor) {
    color = libek.util.color.parse(color)
  }
  this.color = color
  this.code = code
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("lock")
    mdl.children[0].material = libek.Material(color)    
    return mdl
  }
  
  this.push = function(force) {
    if (force.OBJ.isPlayer) {
      let player = force.OBJ
      let inv = player.inventory
      let i = 0
      for (; i < inv.length; i++) {
        let key = inv[i]
        if ((key.itemType == "key") && (key.code == this.code)) {
          player.removeItem(key)
          this.defeat()
          return true
        }
      }
    }
  }
  
  this.initGraphics = function() {
    orthot.AnimateBlock(zone, this)
    return true
  }
}










