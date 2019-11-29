export { Wall, ScenePortal, InfoBlock, Stair, PushBlock, Crate, IceBlock, Key, Lock, Flag, Exit }

import { getAsset, releaseAsset, Material, assignMaterials } from '../libek/libek.js'
import { direction, setOrientation } from '../libek/direction.js'
import { parseColor } from '../libek/util.js'

import { orthotCTL, renderCTL } from './orthot.js'
import { OrthotObject, StandardObject, MovableObject } from './object.js'
import { Surface } from './surface.js'
import { Strength, ObjectState } from './enums.js'
import { AnimateBlock } from './animation.js'
import { activateTextDisplay, deactivateTextDisplay } from './textdisplay.js'

var Wall = function(zone) {
  OrthotObject.call(this, zone)
  this.SpatialClass = "solid"
  this.hasSides = true
  this.setBaseSurface(Surface.type.SMOOTH)

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
    setOrientation(orientation, sideobj.forward, sideobj.up, false)
    sideobj.obj.position.set(this.ctn.x, this.ctn.y, this.ctn.z)
    sideobj.obj.position.add(orientation.position)
    sideobj.obj.setRotationFromEuler(orientation.rotation)
    this.zone.scene.add(sideobj.obj)
  }
}

var ScenePortal = function(zone, dest, target, materials) {
  OrthotObject.call(this, zone)
  this.initGraphics = (function() {
    this.obj = getAsset(orthotCTL.assets, "scene_portal")
    assignMaterials(this.obj, materials)
    return true
  }).bind(this)
  this.intruded = function(other) {
    if (other.isPlayer) {
      //console.log("sceneportal-data", this._ekvxdata_)
      orthotCTL.loadScene(dest, target)
    }
  }
}

var Exit = function(zone, align, dest, target, materials) {
  OrthotObject.call(this, zone)
  if ((dest == "") || (dest == undefined)) {
    dest = orthotCTL.gdatapack.mainAreaname
  }

  this.initGraphics = function() {
    this.obj = getAsset(orthotCTL.assets, "EndBlock")
    assignMaterials(this.obj, materials)
    let orientation = {}
    setOrientation(orientation, direction.invert[align.forward], align.up)
    this.obj.position.set(orientation.position)
    this.obj.setRotationFromEuler(orientation.rotation)
    return true
  }

  this.intruded = function(other) {
    if (other.isPlayer) {
      console.log("Completed Puzzle '" + zone.name + "'")
      renderCTL.indicateCompletion()
      orthotCTL.addProgress(zone.name)
      orthotCTL.loadScene(dest, target)
    }
  }
}

/*  Object that allows movement up and down along a diagonal vector.
    Stairs are regarded as "ramps" for every purpose other than graphical representation
*/
var Stair = function(zone, materials, align) {
  OrthotObject.call(this, zone)
  this.SpatialClass = "ramp"
  this.setBaseSurface(Surface.type.SMOOTH)

  //set up some boundaries
  //  This is somewhat of a hack to prevent creatures from falling through ramps that do not have a solid object placed underneath.
  this.sides[direction.invert[align.up]].push({SpatialClass:"wall"})

  this.types.push("ramp")

  this.initGraphics = function() {
    this.obj = getAsset(orthotCTL.assets, "stair_ramp")
    assignMaterials(this.obj, materials)
    let orientation = {}
    setOrientation(orientation, direction.invert[align.forward], align.up)
    this.obj.position.set(orientation.position)
    this.obj.setRotationFromEuler(orientation.rotation)
    return true
  }

  this.ascendDIR = align.forward
  this.descendDIR = direction.invert[align.forward]
}
var InfoBlock = function(zone, visible, normMSG, defeatMSG, materials_base, materials_qmark) {
  OrthotObject.call(this, zone)

  let msg = normMSG
  if (defeatMSG) {
    msg = defeatMSG
  }
  
  // Message activation process:
  // If Player enters InfoBlock:
  //   activateTextDisplay()
  //   If it passes, reset msg (to clear defeatMSG)
  //   If it fails (because TextDisplay is [proboably] still busy fading the previous message out), 
  //      schedule another attempt for next tick (and repeat these attempts until it passes or Player departs or the zone is reset/unloaded)
  let trySend = false
  this.intruded = function(other) {
    if (other.isPlayer) {
      trySend = true
      tryShowMessage()
    }
  }
  let tryShowMessage = function() {
    if (trySend) {
      activateTextDisplay(msg, msgSuccessCB)
    }
  }
  let msgSuccessCB = function(pass) {
    if (pass) {
      msg = normMSG
    }
    else {
      zone.addTickListener_temp(tryShowMessage)
    }
  }
  
  this.departed = function(other) {
    if (other.isPlayer) {
      deactivateTextDisplay()
    }
    msg = normMSG
    trySend = false
  }
  
  if (visible) {
    let baseOBJ = getAsset(orthotCTL.assets, "InfoBlockBase")
    assignMaterials(baseOBJ, materials_base)
    this.staticObjects = [baseOBJ]
  
    let orientation = {}
    setOrientation(orientation, direction.code.NORTH, direction.code.UP)

    let _destroy = this.destroy
    this.destroy = function() {
      if (baseOBJ.parent) {
        baseOBJ.parent.remove(baseOBJ)
      }
      releaseAsset(orthotCTL.assets, baseOBJ)
      _destroy()
    }

    this.idle = function() {
      let axes = [ new THREE.Vector3(-0.1,1,0).normalize(), new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0.25).normalize() ]
      let speed = [0.5*Math.random() + 1, (-0.15)*Math.random(), -0.1*Math.random() + 1]
      this.animCTL.startContinuousMultiaxialRotator(speed, axes, new THREE.Vector3(0,0.5,0))
    }

    this.initGraphics = (function() {
      AnimateBlock(this.zone, this, orientation)
      this.idle()
      return true
    }).bind(this)

    this.mdlgen = function() {
      let mdl = getAsset(orthotCTL.assets, "InfoQMark")
      assignMaterials(mdl, materials_qmark)
      return mdl
    }
  }
}

var Flag = function(zone, align, code, materials) {
  OrthotObject.call(this, zone)

  if ( code == undefined ) {
    code = zone.name
  }

  if (align) {
    this.forward = align.forward
    this.up = align.up
  }

  let orientation = {}
  setOrientation(orientation, this.forward, this.up)

  this.idle = function() {
    this.animCTL.startContinuousRandomFlipper(1, 0.1, 25)
  }

  this.initGraphics = (function() {
    AnimateBlock(this.zone, this, orientation)
    this.idle()
    return true
  }).bind(this)

  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "flag")
    assignMaterials(mdl, materials)
    if (orthotCTL.gdatapack.progress[code]) {
    //assignMaterials(orthotCTL.assets.scene_portal, {color:"white", emissive:"white", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5})
      mdl.children[1].material = Material({color:"green", emissive:"green", emissiveIntensity:0.3 })
    }
    else {
      mdl.children[1].material = Material({color:"red", emissive:"red", emissiveIntensity:0.3 })
    }
    return mdl
  }

}

// I still don't know what to call a pushblock.  A pushblock is a pushblock.
// Please don't upload this comment somewhere embarassing, such as the Internet.
var PushBlock = function(zone, materials) {
  MovableObject.call(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)

  this.SpatialClass = "solid"
  this.state = ObjectState.IDLE

  this.shearStrength = Strength.NORMAL
  this.fallStrength = Strength.NORMAL
  this.setBaseSurface(Surface.type.SMOOTH)
  this.propforceMin = Strength.NORMAL
  this.propforceStrength = Strength.LIGHT
  this.crushingForce = Strength.CRUSHING
  this.slideStrength = Strength.NORMAL

  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "pushblock")
    assignMaterials(mdl, materials)
    return mdl
  }
}

var Crate = function(zone, materials) {
  MovableObject.call(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)

  this.SpatialClass = "solid"
  this.state = ObjectState.IDLE

  this.shearStrength = Strength.NORMAL
  this.fallStrength = Strength.NORMAL
  this.setBaseSurface(Surface.type.ROUGH)
  this.propforceMin = Strength.LIGHT
  this.crushingForce = Strength.CRUSHING


  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "crate")
    assignMaterials(mdl, materials)
    return mdl
  }
}

var IceBlock = function(zone, materials) {
  MovableObject.call(this, zone)
  this.hasSides = true
  this.AutoGravity = true
  zone.addTickListener(this.update)

  this.SpatialClass = "solid"
  this.state = ObjectState.IDLE

  this.shearStrength = Strength.NORMAL
  this.fallStrength = Strength.NORMAL
  this.setBaseSurface(Surface.type.SLICK)
  this.propforceMin = Strength.LIGHT
  this.crushingForce = Strength.CRUSHING


  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "iceblock")
    assignMaterials(mdl, materials)
    return mdl
  }
}

var Key = function(zone, color, code, materials) {
  MovableObject.call(this, zone)
  this.AutoGravity = true
  this.state = ObjectState.IDLE
  zone.addTickListener(this.update)

  this.itemType = "key"
  this.SpatialClass = "item"

  this.fallStrength = Strength.LIGHT
  this.setBaseSurface(Surface.type.COARSE)
  this.crushingForce = Strength.CRUSHING
  
  this.struck = function(force, otherOBJ, collision, crash=false) { 
    //console.log("key-struck", force, otherOBJ, collision, crash)
    if ((force.strength >= Strength.CRUSHING) && (!force.OBJ.isPlayer)) {
      this.defeat()
      zone.removeTickListener(this.update)
      if (force.pusher) {
        force.pusher.notify_ForcePropagationClearedObstruction(force, this)
      }
    }
    return false
  }

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
    color = parseColor(color)
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
    AnimateBlock(this.zone, this)
    this.idle()
    return true
  }

  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "key")
    assignMaterials(mdl, materials)
    mdl.children[0].material = Material(color)
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

var Lock = function(zone, color, code, materials) {
  StandardObject.call(this, zone)
  this.hasSides = true
  this.setBaseSurface(Surface.type.SMOOTH)

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
    color = parseColor(color)
  }
  this.color = color
  this.code = code

  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "lock")
    assignMaterials(mdl, materials)
    mdl.children[0].material = Material(color)
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
    AnimateBlock(zone, this)
    return true
  }
}










