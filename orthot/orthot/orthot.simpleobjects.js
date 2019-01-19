orthot.Wall = function(zone) { 
  orthot.OrthotObject(this, zone)
  this.SpatialClass = "solid"  
  this.hasSides = true
  this.setBaseSurface(orthot.surface.type.SMOOTH)
  
  this.isTraversableBy = function(otherOBJ) {return false}
  
  this.push = function(force) { 
  }
  
  this.attach = function(sideobj) {
    sideobj.host = this
    this.sides[sideobj.up].push(sideobj)    
    if (sideobj.surfacetype) {
      this.surfaces[sideobj.up] = sideobj.surfacetype
    }
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

/*  Object that allows movement up and down along a diagonal vector.
    Stairs are regarded as "ramps" for every purpose other than graphical representation
*/
orthot.Stair = function(zone, color, align) {
  orthot.OrthotObject(this, zone)
  this.SpatialClass = "ramp" 
  this.setBaseSurface(orthot.surface.type.SMOOTH)
  
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
  orthot.MovableObject(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"    
  this.state = orthot.state.IDLE
  
  this.fallStrength = orthot.strength.LIGHT
  this.setBaseSurface(orthot.surface.type.SMOOTH)  
  this.propforceMin = orthot.strength.NORMAL
  this.propforceStrength = orthot.strength.LIGHT
  this.crushingForce = orthot.strength.CRUSHING
  this.slideStrength = orthot.strength.NORMAL
    
  this.mdlgen = function() {
    let mdl = libek.getAsset("pushblock")
    if (color) {
      mdl.children[1].material = libek.Material(color)
    }
    return mdl
  }
}

orthot.Crate = function(zone) {
  orthot.MovableObject(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"    
  this.state = orthot.state.IDLE
  
  this.fallStrength = orthot.strength.LIGHT
  this.setBaseSurface(orthot.surface.type.ROUGH)
  this.propforceMin = orthot.strength.LIGHT
  this.crushingForce = orthot.strength.CRUSHING
  
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("crate")
    return mdl
  }
}

orthot.Iceblock = function(zone) {
  orthot.MovableObject(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)
  
  this.SpatialClass = "solid"    
  this.state = orthot.state.IDLE
  
  this.fallStrength = orthot.strength.LIGHT
  this.setBaseSurface(orthot.surface.type.SLICK)
  this.propforceMin = orthot.strength.LIGHT
  this.crushingForce = orthot.strength.CRUSHING
  
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("iceblock")
    return mdl
  }
}

orthot.Key = function(zone, color, code) {
  orthot.MovableObject(this, zone)
  this.AutoGravity = true
  this.state = orthot.state.IDLE
  zone.addTickListener(this.update)
  
  this.itemType = "key"
  this.SpatialClass = "item"  
  
  this.fallStrength = orthot.strength.LIGHT
  this.setBaseSurface(orthot.surface.type.COARSE)
  this.crushingForce = orthot.strength.CRUSHING
  
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
  
  this.idle = function() {
    let axes = [ new THREE.Vector3(-0.5,1,0).normalize(), new THREE.Vector3(0,1,0) ]
    let speed = [0.4*Math.random() + 1, (-0.25)*Math.random()]
    this.animCTL.startContinuousMultiaxialRotator(speed, axes, new THREE.Vector3(0,0.5,0))
  }
  
  this.initGraphics = function() {
    orthot.AnimateBlock(this.zone, this)
    this.idle()
    return true
  }
  
  this.mdlgen = function() {
    let mdl = libek.getAsset("key")
    mdl.children[0].material = libek.Material(color)
    return mdl
  }
  
  this.intruded = this.intrude = function(other) {
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
  this.setBaseSurface(orthot.surface.type.SMOOTH)
  
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










