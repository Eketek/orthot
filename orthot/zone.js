export { Zone }
import { trit, T, getAsset, storeAsset, releaseAsset, Material } from '../libek/libek.js'
import { property, properties_fromstring, mergeObjects, parseVec3, parseColor } from '../libek/util.js'
import { BoxTerrain, DECAL_UVTYPE } from '../libek/gen.js'
import { VxScene } from '../libek/scene.js'
import { Reticle } from '../libek/reticle.js'

import { renderCTL, sviewCTL, inputCTL, orthotCTL } from './orthot.js'
import { parseO2Orientation } from './util.js'
import { Container } from './container.js'
import { direction, rotateDirection_bydirections } from '../libek/direction.js'
import { Wall, ScenePortal, InfoBlock, Stair, PushBlock, Crate, IceBlock, Key, Lock, Flag, Exit } from './simpleobjects.js'
import { Ladder, Portal, Button, Icefloor } from './attachments.js'
import { Gate, GateGroup } from './gate.js'
import { Player } from './player.js'
import { Collision, ObjectState } from './enums.js'
import { Mouse, Moose } from './creatures.js'
import { deactivateTextDisplay } from './textdisplay.js'

var Zone = function(ekvx, override_startloc, name) {
  this.isZone = true
  let isGeomValid = true
  this.name = name

  let bxtbldr = new BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
  let vxc = new VxScene({
    boxterrain:bxtbldr,
    chunks_per_tick:4
  })

  this.scene = vxc.scene

  vxc.default = Container


  let rawdata = {}
  let flipWorld = (ekvx.data_version <= 5)

  let walltemplates = {}
  let targets = {}

  // For now, lighting is simplified to global ambient + global directional light + player-held lantern + maybe one light-bearing object
  //  ANd...  just because there otherwise isn't much interesting about lighting, the global directional light rotates very slowly as time passes
  var amblCol = new THREE.Color("white")
  var vambl = new THREE.AmbientLight(amblCol, 0.125)
  var ambl = new THREE.AmbientLight(0xffffff, 0.125)
  this.scene.add(ambl)
  this.scene.add(vambl)
  let dlight = new THREE.DirectionalLight( 0xffffff, 1 )
  dlight.position.set(0,1000,0)
  this.scene.add(dlight)

  let dlTarget = new THREE.Object3D()
  dlTarget.position.set(0,0,0)
  this.scene.add(dlTarget)
  let dlrot = Math.random()*T

  //clear out any lingering input

  this.ticknum = -1
  let prevtick = Date.now()
  let prevtime = prevtick
  let prevreltime = 0
  this.ticklen = 200

  let player
  let startloc = vxc.get(0,1,0)

  let tickListeners = []
  let tmp_tickListeners = []
  let deferredActions = []

  //set up "reticles" that can show which keys will work with which locks
  let keys = []
  let locks = []
  let reticlemat
  let activeReticle
  let baseReticleOBJ = orthotCTL.assets.cubereticle
  if (baseReticleOBJ) {
    reticlemat = baseReticleOBJ.children[0].material
  }
  else {
    baseReticleOBJ = getAsset(orthotCTL.assets, "CubeMark")
    orthotCTL.assets.cubereticle = baseReticleOBJ
    reticlemat = Material({color:"green", emissive:"green", emissiveIntensity:0.333})
    baseReticleOBJ.children[0].material = reticlemat
    storeAsset(orthotCTL.assets, "cubereticle", baseReticleOBJ)
  }
  let keyReticle = new Reticle(orthotCTL.assets, baseReticleOBJ)
  let lockReticle = new Reticle(orthotCTL.assets, baseReticleOBJ)
  this.scene.add(keyReticle.obj)
  this.scene.add(lockReticle.obj)

  let setReticle = function(reticle, objs, code, color) {
    if (activeReticle) {
      activeReticle.clear()
    }
    activeReticle = reticle

    let hue = color.getHSL().h+0.5
    reticlemat.color.setHSL(hue, 1, 0.5)
    reticlemat.emissive.setHSL(hue, 1, 0.5)

    for (let obj of objs) {
      if (obj.code == code) {
        reticle.add(obj.ctn)
      }
    }
  }
  this.clearReticle = function() {
    if (activeReticle) {
      activeReticle.clear()
    }
  }

  this.showKeys = function(code, color="green") {
    setReticle(keyReticle, keys, code, color)
  }
  this.showLocks = function(code, color="green") {
    setReticle(lockReticle, locks, code, color)
  }

  let sigReceivers = {}
  this.signal = function(name, value=true) {
    let receivers = sigReceivers[name]
    if (receivers) {
      for (let receiver of receivers) {
        receiver(name, value)
      }
    }
  }
  this.addSignalreceiver = function(name, receiver) {
    let receivers = sigReceivers[name]
    if (!receivers) {
      receivers = sigReceivers[name] = []
    }
    receivers.push(receiver)
  }
  this.removeSignalreceiver = function(name, receiver) {
    let receivers = sigReceivers[name]
    let i = receivers.indexOf(receiver)
    if (i != -1) {
      receivers.splice(i,1)
    }
  }

  /*  Rules for determining which objects can enter space occupied by other objects
      These rules are assymetric (liquid objects can not enter space occupied by solid objects, but solid objects can enter space occupied by liquid)
      These rules apply to movements of objects under forces and to certain topology considerations.
  */
  let traverseTestTBL = {
    // no traversal of anything
    wall:[],

    //basic classes
    solid:["liquid", "gas", "item"],
    liquid:["solid"],
    gas:[],

    //Ramps are a special case because there is not presently a mechanism for tilted objects resting on top of a ramp and partially occupying an adjacent space
    ramp:[],

    // interactive objects
    float:["gas"],    // (ice, wood, or any other bouyant solid objects)
    creature:["player", "item", "liquid", "gas", "ramp"],
    player:["creature", "item", "liquid", "gas", "ramp"],
    item:["player", "creature", "liquid", "gas"]
  }

  this.HALT = function(reason) {
    console.log("ZONE-HALT because:", reason)
    HALTED = true
  }


  // Command sequences that are added at the beginning of a tick, end at the beginning of the next tick, and are measured in seconds (floating point values)
  this.addCommandsequence_short = function(cmdseq) {
    cmdSequences_short.push(cmdseq)
    cmdseq.start()
  }
  this.removeCommandsequence_short = function(cmdseq) {
    if (cmdseq && cmdSequences_short.indexOf(cmdseq)) {
      cmdseq.stop()
      cmdSequences_short.splice(cmdSequences_short.indexOf(cmdseq), 1)
    }
  }
  let cmdSequences_short = []

  // Command sequences that are added at the beginning of a tick, end at the beginning of any future tick, and are measured in seconds (floating point values)
  this.addCommandsequence_long = function(cmdseq) {
    cmdSequences_long.push(cmdseq)
    cmdseq.start()
  }
  let cmdSequences_long = []

  // Command sequences that are added at an arbitrary time, end at an arbitrary time, and are measured in seconds (floating point values)
  this.addCommandsequence_realtime = function(cmdseq) {
    cmdSequences_realtime.push(cmdseq)
    cmdseq.start()
  }
  let cmdSequences_realtime = []


  let tHue = 0, hue = 0, hueIncr = 0.001
  let setHueTarget = function() {
    tHue = Math.random()
    hueIncr = Math.random() > 0.5 ? 1/6000 : -1/6000
  }
  hue = Math.random()
  amblCol.setHSL ( hue, 1, 0.5 )
  vambl.color = amblCol
  setHueTarget()
 // col = new THREE.Color()

  let HALTED = false

  this.onFrame = function() {
    if (HALTED) {
      return
    }
    //update geometry
    vxc.buildChunks()

    //Move the global directional light a bit
    dlrot += 0.0003
    dlight.position.x = Math.cos(dlrot%T)*2000
    dlight.position.z = Math.sin(dlrot%T)*2000

    hue += hueIncr
    amblCol.setHSL ( hue, 1, 0.5 )
    vambl.color = amblCol
    if (hueIncr > 0) {
      if (hue >= tHue) {
        setHueTarget()
      }
    }
    else {
      if (hue <= tHue) {
        setHueTarget()
      }
    }

    //timekeeping
    let t = Date.now()
    let dt = t-prevtime
    prevtime = t


    for (let i = 0; i < cmdSequences_realtime.length; i++) {
      let seq = cmdSequences_realtime[i]
      if (!seq.advance(dt)) {
        cmdSequences_realtime.splice(i,1)
        i--
      }
    }

    let reltime = (t-prevtick) / this.ticklen
    let d = reltime-prevreltime
    prevreltime = reltime

    for (let i = 0; i < cmdSequences_long.length; i++) {
      let seq = cmdSequences_long[i]
      if (!seq.advance(d)) {
        cmdSequences_long.splice(i,1)
        i--
      }
    }

    //update command sequences
    if (reltime < 1) {
      for (let seq of cmdSequences_short) {
        seq.advance(d)
      }
    }
    else {
      // Complete all short animations.  "Now" here is immediately before the next tick.
      if (cmdSequences_short.length != 0) {
        for (let seq of cmdSequences_short) {
          seq.stop()
        }
        cmdSequences_short = []
      }
      prevreltime -= 1
      prevtick = t
      tick()
    }
  }

  let tick = (function() {
    this.ticknum++
    let input = inputCTL.keystate.query()

    if (this.ticknum > 0) {
      if (tmp_tickListeners.length > 0) {
        for (let f of tmp_tickListeners) {
          f()
        }
        tmp_tickListeners = []
      }

      for (let i = tickListeners.length; i >= 0; i--) {
        let f = tickListeners[i]
        if (f) {
          f()
        }
      }

      if (player) {
        player.recvInput(input)
      }

      while (true) {
        if ( (num_movers == 0) && (deferredActions.length == 0)) {
          break
        }
        if (num_movers > 0) {
          processMovement()
        }
        if (deferredActions.length != 0) {
          let _da = deferredActions
          deferredActions = []
          for (let act of _da) {
            act()
          }
        }
      }

    }
  }).bind(this)

  /*  Interpret arguments form an Array as a spatial reference
      This allows any Zone functions to accept spatial references in the following formats:
        x,y,z             -- an absolute spatial reference passed as a set of three arguments
        {x,y,z}           -- An absolute spatial reference contained by an object with x,y, and z properties (such as THREE.Vector3)
        <Container>       -- A direct reference to the container

      This returns an array: [X, Y, Z, Container, ...]  (the coordinates, followed by the container, followed by everything else passed in

      This is intended to be used with destructuring assignments

      Example usage:

      doStuff=function(...args) {
        [x,y,z, ctn, obj] = unpack_LOC_ARGS(args)
        ctn.content.push(obj)
        console.log(`Added object "${obj.name}" to container at location x=${x}, y=${y}, z=${z}`)
      }
      doStuff(_x, _y, _z, obj1)
      doStuff(someCTN, obj2)

      This is also probably one of the more dubious utility functions...
   */
  let unpack_LOC_ARGS = function(args, pos=0) {
    let x,y,z,ctn, i=pos
    if (typeof(args[pos]) == "number") {
      x = args[pos]
      y = args[pos+1]
      z = args[pos+2]
      ctn = vxc.get(x,y,z)
      i+=3
    }
    else if (args[pos].content) {
      ctn = args[pos]
      x = ctn.x
      y = ctn.y
      z = ctn.z
      i++
    }
    else {
      let vec = args[pos]
      x = vec.x
      y = vec.y
      z = vec.z
      ctn = vxc.get(x,y,z)
      i++
    }

    let r = [x,y,z, ctn]

    if (args.length > i) {
      r = r.concat(args.splice(i))
    }
    return r
  }

  this.addTickListener = function(f) {
    if (tickListeners.indexOf(f) == -1) {
      tickListeners.push(f)
    }
  }
  this.removeTickListener = function(f) {
    let i = tickListeners.indexOf(f)
    if (i != -1) {
      tickListeners.splice(i,1)
    }
    if (tickListeners.indexOf(f) != -1) {
      console.log("ERROR:  multiple instances of a ticklistener present!")
    }
  }
  this.addTickListener_temp = function(f) {
    tmp_tickListeners.push(f)
  }

  this.addDeferredAction = function(f) {
    if (deferredActions.indexOf(f) == -1) {
      deferredActions.push(f)
    }
  }

  this.inputAvailable = function() {
    if ( (orthotCTL.highResponsiveMode) || ((cmdSequences_short.length == 0) && (cmdSequences_long.length == 0))) {
      prevtick = Date.now() - this.ticklen
    }
  }

  this.removeGameobject = function(obj, destroy=true) {
    if (obj.ctn) {
      let i = obj.ctn.content.indexOf(obj)
      if (i != -1) {
        obj.ctn.content.splice(i,1)
      }
    }
    if (destroy) {
      obj.destroy()
    }
  }

  this.attach = function(...args) {
    let [x,y,z,ctn, o] = unpack_LOC_ARGS(args)
    for (let obj of ctn.content) {
      if (obj.hasSides) {
        obj.attach(o)
        return true
      }
    }
    console.log("FAILED to attach something...", args)
    return false
  }
  this.putGameobject = function(...args) {
    let [x,y,z,ctn, o] = unpack_LOC_ARGS(args)

    if (o.ctn) {
      o.ctn.removeObject(o)
    }
    o.ctn = ctn

    if (o.obj) {
      o.worldpos.set(x,y,z)
    }

    if (o.OnUpdateCTN) {
      o.OnUpdateCTN()
    }

    ctn.addObject(o)

    if (y < _min.y) {
      o.defeat()
    }
  }


  /*  Check a mover's spatial class against the spatial class of everything in the target container
      If anything obstructs the mover, return false
      If nothing obstructs the mover, return true

      This ignores any objects which do not posess a spatial class.  (presumably scenery or dummy objects)
  */
  this.isTraversable = function(from, fromDIR, to, toDIR, mover) {

    let mover_class = mover.SpatialClass

    if (mover_class) {
      let obstruction_class
      for (let obstruction of to.content) {
        obstruction_class = obstruction.SpatialClass
        if (obstruction_class && (traverseTestTBL[mover_class].indexOf(obstruction_class) == -1)) {
          return false
        }
      }
      for (let obj of from.content) {
        for (let obstruction of obj.sides[fromDIR]) {
          obstruction_class = obstruction.SpatialClass
          if (obstruction_class && (traverseTestTBL[mover_class].indexOf(obstruction_class) == -1)) {
            return false
          }
        }
      }
    }
    return true
  }

  this.impededBy = function( mover, impeder ) {
    if (!impeder.SpatialClass || !mover.SpatialClass) {
      return false
    }
    if (!traverseTestTBL[mover.SpatialClass]) {
      return true
    }
    return (traverseTestTBL[mover.SpatialClass].indexOf(impeder.SpatialClass) == -1)
  }

  this.getObstructor = function(mover, ctn) {
    let mover_class = mover.SpatialClass

    if (mover_class) {
      let obstruction_class
      for (let obstruction of ctn.content) {
        obstruction_class = obstruction.SpatialClass
        if (obstruction_class && (traverseTestTBL[mover_class].indexOf(obstruction_class) == -1)) {
          return obstruction
        }
      }
    }
  }

  this.getAdjacentCTN = function(ctn, dir) {
    switch(dir) {
      case direction.code.UP: return vxc.get(ctn.x, ctn.y+1, ctn.z)
      case direction.code.DOWN: return vxc.get(ctn.x, ctn.y-1, ctn.z)
      case direction.code.NORTH: return vxc.get(ctn.x, ctn.y, ctn.z+1)
      case direction.code.EAST: return vxc.get(ctn.x-1, ctn.y, ctn.z)
      case direction.code.SOUTH: return vxc.get(ctn.x, ctn.y, ctn.z-1)
      case direction.code.WEST: return vxc.get(ctn.x+1, ctn.y, ctn.z)
    }
  }

  /*  Determine where a portal is pointing.
      This resolves multi-targets:
        If 3 or more portals belonging to the same "class", portals are are logically a circular group
          (determined by the order in which they are read from the ekvx, though eventually, this should be specifiable by a level designer)
        Portal selection is governed by two priorities:
          Top priority is an unobstructed destination
          Secondary priority is the next portal [counting from the source portal] in the portal group, with wraparound to the end

      This also resolves daisy-chaining:
        If a destination portal feeds directly into another portal, the scan will traverse and select the destination of the entire daisy chain
  */
  let getPortalTarget = (function(portal, fromCTN, fromHEADING, obj, visited=[]) {
    visited.push(portal)
    let toCTN, toHEADING, dportal, nportal
    let traversable = false

    if (Array.isArray(portal.target)) {
      let ofs = portal.target.indexOf(portal) +1
      for (let _i = 0; _i < portal.target.length-2; _i++) {
        let i = (_i + ofs) % portal.target.length
        dportal = portal.target[i]
        if (visited.indexOf(dportal) == -1) {
          toHEADING = dportal.up
          toCTN = this.getAdjacentCTN(dportal.host.ctn, toHEADING)

          nportal = adjCTN.getSideobject_bytype(direction.invert[toHEADING], "portal")
          if (nportal) {
            if (visited.indexOf(nportal) == -1) {
              let _dportal = getPortalTarget(nportal, fromCTN, fromHEADING, obj, visited)
              if (_dportal) {
                return _dportal
              }
              else {
                //insert it into the "visited" list to mark it as an invalid path.
                visited.push(nportal)
              }
            }
          }
        }
        //If a multitarget, prioritize the traversable portal.
        if (this.isTraversable(fromCTN, fromHEADING, outCTN, outHEADING, obj)) {
          traversable = true
          break
        }
      }

      //if nothing is observably traversable, select the next non-daisy-chain portal without regard for obstructions
      //  I dont want to deal with the convoluted logic needed to prioritize a portal with an unblocked pushable object in front.
      if (!traversable) {
        for (let _i = 0; _i < portal.target.length-1; _i++) {
          let i = (_i + ofs) % portal.target.length
          dportal = portal.target[i]
          toHEADING = dportal.up
          toCTN = this.getAdjacentCTN(dportal.host.ctn, toHEADING)

          //accept the portal if it has not been rejected by a chained scan
          if (visited.indexOf(dportal == -1)) {
            break
          }
        }
        dportal = undefined
      }
    }
    else {
      dportal = portal.target
      toHEADING = dportal.up
      toCTN = this.getAdjacentCTN(dportal.host.ctn, toHEADING)
    }
    if (dportal) {
      nportal = toCTN.getSideobject_bytype(direction.invert[toHEADING], "portal")
      if (nportal) {
        if (visited.indexOf(nportal) == -1) {
          return getPortalTarget(nportal, fromCTN, fromHEADING, obj, visited)
        }
        else {
          //If at this point it is still looking at previously visited portals, there is nothing left to scan - this portal goes nowhere.
          return
        }
      }
      else {
        return dportal
      }
    }
  }).bind(this)

  /*  Given an input object, position, vector, and orientation, determine the destination, vector, and orientation.
   *  If there is no portal involved, this returns the adjacent space and the input vector & orientation.
   *  If there is a portal, this returns the portal destination and vector & orientation as transformed by the portal
   *      (Portals transform objects which pass through them, which typically involves altering movement and orientation vectors)
   *
   *  inputs:
   *    obj:  Object the topological scan is to be used for
   *    fromCTN:  originating position/container for the scan
   *    fromHEADING:  heading (scan-direction vector)
   *    fromFORWARD, fromUP:  Orientation
   *  outputs an array of these values:
   *    adjCTN:  The immediately position/container
   *    toCTN:  The result position/container (adjCTN ordinarilly, portal destination if a portal is crossed)
   *    toHEADING:  heading at destination (differs from fromHEADING if a portal redirects)
   *    toFORWARD, toUP:  Orientation at the target (differs from input orientation if a portal redirects)
   *    isPortalJump:  flag indicating if a portal is crossed
   *    isTraversable:  flag indicating if the traversal test is passed
  */
  this.getLocalTopology = function(obj, fromCTN, fromHEADING, fromFORWARD, fromUP) {
    let adjCTN = this.getAdjacentCTN(fromCTN, fromHEADING)
    let outCTN = adjCTN
    let outFORWARD = fromFORWARD
    let outUP = fromUP
    //let outHEADING = libek.direction.getRelDir(fromHEADING, outUP)
    let outHEADING = fromHEADING
    let isPortaljump = false

    let invHeading = direction.invert[fromHEADING]
    let portal = adjCTN.getSideobject_bytype(invHeading, "portal")
    if (portal) {
      let dportal = getPortalTarget(portal, fromCTN, fromHEADING, obj)
      if (dportal) {
        isPortaljump = true
        outHEADING = dportal.up
        //outFORWARD = dportal.up
        //outUP = dportal.forward
        let sv = (portal.up == direction.code.UP) || (portal.up == direction.code.DOWN)
        let dv = (dportal.up == direction.code.UP) || (dportal.up == direction.code.DOWN)
        if (sv && dv) {
          outFORWARD = dportal.up
          outUP = direction.invert[fromUP]
        }
        else if (!sv && !dv) {
          outFORWARD = dportal.up
          outUP = fromUP
        }
        else if (sv && !dv) {
          outFORWARD = direction.invert[rotateDirection_bydirections(fromFORWARD, portal.up, portal.forward, dportal.up, dportal.forward)]
          outUP = direction.invert[rotateDirection_bydirections(fromUP, direction.invert[portal.up], portal.forward, dportal.up, dportal.forward)]
        }
        else {
          outFORWARD = direction.invert[rotateDirection_bydirections(fromFORWARD, portal.up, portal.forward, dportal.up, dportal.forward)]
          outUP = direction.invert[rotateDirection_bydirections(fromUP, direction.invert[portal.up], portal.forward, dportal.up, dportal.forward)]
        }
        outCTN = this.getAdjacentCTN(dportal.host.ctn, outHEADING)
      }
    }
    let traversable = this.isTraversable(fromCTN, fromHEADING, outCTN, outHEADING, obj)
    return [adjCTN, outCTN, outHEADING, outFORWARD, outUP, isPortaljump, traversable]
  }

  /*  Return containers from which the specified container (thisCTN) may be directly accessed.
   *  "This" container may be accessed from "other" container under these circumstances:
   *    1:  "this" and "other" are literally adjacent and "this" does not contain a portal pointed at "other"
   *    2:  "other" has a path or multi-path of portals which has at least one portal-terminal at the literally adjacent container which is pointed at "this"
  */
  let getInboundNeighbors = (function(thisCTN, excludeDIR) {
    let portals = []
    let r = []

    let evaluateSide = (function(dir) {
      let invdir = direction.invert[dir]
      let otherCTN = this.getAdjacentCTN(thisCTN, dir)
      if (!thisCTN.getSideobject_bytype(dir, "portal")) {
        let otherPortal = otherCTN.getSideobject_bytype(invdir, "portal")
        if (otherPortal) {
          let sourcePortals = []
          findPortalSources(otherPortal, sourcePortals, [])
          for (let portal of sourcePortals) {
            if (portals.indexOf(portal) == -1) {
              portals.push(portal)
              let invsrcpdir = direction.invert[portal.up]
              r.push({ctn:this.getAdjacentCTN(portal.host.ctn, portal.up), dir:invsrcpdir, fromdir:dir, sourcePortal:portal, targetPortal:otherPortal})
            }
          }
        }
        else {
          r.push({ctn:otherCTN, dir:invdir, fromdir:dir})
        }
      }
    }).bind(this)
    for (let dir of Object.values(direction.code)) {
      if (dir != excludeDIR) {
        evaluateSide(dir)
      }
    }

    return r
  }).bind(this)

  /*  Given a target portal, find all potential source portals (anything directly or indirectly connected portal).
   *   An "other" portal is directly linked if one of the following conditions is true:
   *   1.  "other" and "this" are part of the same multiportal
   *   2.  "other" has "this" as its target
   *   3.  There is a daisy-chain of portals which may be followed from "other" to "this"
   */
  let findPortalSources = (function(targetPortal, result, visited) {
    visited.push(targetPortal)

    // Evaluate every portal in targetPortal.sources as a potential portal
    for (let portal of targetPortal.sources) {
      if (visited.indexOf(portal) == -1) {
        visited.push(portal)
        let pCTN = portal.host.ctn
        let adjCTN = this.getAdjacentCTN(pCTN, portal.up)
        let adjPortal = adjCTN.getSideobject_bytype(direction.invert[portal.up], "portal")
        if (adjPortal) {
          if (visited.indexOf(adjPortal == -1)) {
            // get THAT portal's sources too.  I must, Must, MUST have them!
            findPortalSources(adjPortal, result, visited)
          }
        }
        else {
          // Portal source.
          result.push(portal)
        }
      }
      //NOTE:  Any other path a source portal can point is irrelevant here (destinations based on portal class).
    }

    //It the portal is a multi-portal, extract every portal in it other than itself is a potential source portal
    if (Array.isArray(targetPortal.target)) {
      let pgroup = targetPortal.target
      let ofs = pgroup.indexOf(targetPortal) +1
      for (let _i = 0; _i < portal.target.length-1; _i++) {
        let i = (_i + ofs) % portal.target.length
        portal = pgroup[i]
        if (visited.indexOf(portal) == -1) {
          let pCTN = portal.host.ctn
          let adjCTN = this.getAdjacentCTN(pCTN, portal.up)
          let adjPortal = adjCTN.getSideobject_bytype(direction.invert[portal.up], "portal")
          if (adjPortal) {
            if (visited.indexOf(adjPortal == -1)) {
              // get THAT portal's sources too.  I must, Must, MUST have them!
              findPortalSources(adjPortal, result, visited)
            }
          }
          else {
            // Portal source.
            result.push(portal)
          }
        }
      }
    }
  }).bind(this)

  // Secondary forces is additional forces exerted upon neighboring objects by the movement of an object:
  //    things like Release of tension, gravity, riding, and shearing are triggered through this
  //
  //  This, incidentally, was conceived as an extremely roundabout [but thorough] way to make keys and crates ride moving objects...
  let processIndirectForces = function(force) {
    let ctn = force.fromCTN
    let from_nbrpaths = getInboundNeighbors(force.fromCTN, force.fromHEADING)

    // outbound secondary forces - these apply to neighbors of force.fromCTN
    for (let path of from_nbrpaths) {

      // If the neighbor is behind a portal, inverse-portal the secondary force out to the neighbor (from targetPortal to sourcePortal).
      // The inverse-portal'd force should be transformed by the portal to whatever the movement should look like form the source portal
      //NOTE:  This also is a wild guess.  I am unsure whether or not this even should give a *correct* transformation of a secondary force
      // through an inverse portal.
      let heading = path.sourcePortal ?
        rotateDirection_bydirections(
          force.fromHEADING,
          direction.invert[path.targetPortal.up],
          direction.invert[path.targetPortal.forward],
          path.sourcePortal.up,
          path.sourcePortal.forward
        )
        : force.fromHEADING
      if (path.sourcePortal) {
      }
      path.ctn.applyOutboundIndirectForce(heading, path.dir, path.fromdir, force)
    }

    // inbound secondary forces - these apply to neighbors of force.toCTN
    let to_nbrpaths = getInboundNeighbors(force.toCTN, direction.invert[force.toHEADING])
    for (let path of to_nbrpaths) {
      let heading = path.sourcePortal ?
        rotateDirection_bydirections(
          force.fromHEADING,
          direction.invert[path.targetPortal.up],
          direction.invert[path.targetPortal.forward],
          path.sourcePortal.up,
          path.sourcePortal.forward
        )
        : force.fromHEADING
      path.ctn.applyInboundIndirectForce(heading, path.dir, path.fromdir, force)
    }
  }

  //----------------------------------------------------------------------------------------------------------------------------------
  //  MOVEMENT ENGINE
  //----------------------------------------------------------------------------------------------------------------------------------
  //
  //  It might not seem like it on the surface, but Orthot III requires a complex physics engine to manage collisions and topology.
  //  Everything is discrete (things occupy specific unit cubes), low-frequency (200 millisecond ticks), symmetric (not biased by
  //  any spatial, temporal, or random ordering), and subject to portals (any interaction may just as easily take place across a portal
  //  as between adjacent objects)
  //
  //----------------------------------------------------------------------------------------------------------------------------------
  //
  //  General Algorithm:
  //
  //    1:  tick-start
  //    2a:   Collect Forces      - Forces are registered with Zone, in arbitrary order, through Object activity callbacks
  //          Until no Unprocessed Forces:
  //    2b:     Propogate Forces  - Propagate each force to the next object, Collect any resulting Forces (continuation of 2a)
  //    3:  Graph Forces          - generate a Directed graph of all forces, compute the collision type for each node
  //        Until no Unprocessed Nodes:
  //    4:    Process simple collisions (order is something like non-collisions & simple collision > chase > strike)
  //
  //----------------------------------------------------------------------------------------------------------------------------------

  // table of moving objects, indexed by object ID
  let active_movers = {}
  let all_movers = {}

  // table of lists of dependant forces, indexed by ID of the object belonging to the impeding force
  // this is a dynamic dependency graph representing unresolved collisions between forces.
  // A dependent force is a force which is possibly impeded by another force.  The impeding force may be either of these two situations:
  //    an incoming object (impedes if it passes)
  //    an outgoing (impedes if it fails)
  //
  // This is updated every time dependencies between forces are found, resolved, deferred, or nullified.
  let depend

  let num_movers = 0

  //Moves listed by originating position
  //{pos, [node]}
  let moves_by_dest = {}

  //Moves listed by destination
  //{pos, [node]}
  let moves_by_source = {}
  let recent_insertion

  let cmp_forces = function(a,b) {
    if (a.priority == b.priority) {
      return b.strength - a.strength
    }
    else {
      return b.priority - a.priority
    }
  }

  this.addForce = (function(force) {

    //If the object has not moved this tick, add the force
    //If the object did move already, skip ahead a bit, propagate the force, then return.
    if (force.OBJ.movedAt != this.ticknum) {
      recent_insertion = true

      force.incoming = []
      force.outgoing = []


      //let obj = force.OBJ
      if (force.OBJ.recently != this.ticknum) {
        force.OBJ.recently = this.ticknum
        active_movers[force.OBJ.id] = force.OBJ
        all_movers[force.OBJ.id] = force.OBJ
        force.OBJ.forces = [force]
        delete force.OBJ.depend
        num_movers++
      }

      //If the force has a higher priority than the object's active force, replace the active force with the new one and clear the dependancy (if present)
      else if (cmp_forces(force.OBJ.forces[0], force) > 0) {
        force.OBJ.forces.unshift(force)
        if (force.OBJ.depend) {
          let depOBJs = depend[force.OBJ.depend]
          if (depOBJs) {
            let i = depOBJs.indexOf(force.OBJ)
            if (i != -1) {
              if (depOBJs.length == 1) {
                delete depend[force.OBJ.depend]
              }
              else {
                depOBJs.splice(i,1)
              }
              active_movers[force.OBJ.id] = force.OBJ
              all_movers[force.OBJ.id] = force.OBJ
            }
          }
        }
      }
      else {
        force.OBJ.forces.push(force)
        force.OBJ.forces.sort(cmp_forces)
      }
      //forces.push(force)

      // Organize forces into a pair of tables - one indexed by source, the other indexed by destination
      let srcID = force.fromCTN.id
      let destID = force.toCTN.id

      let srclist = moves_by_source[srcID]
      let dstlist = moves_by_dest[destID]

      if (!srclist) {
        srclist = []
        moves_by_source[srcID] = srclist
      }
      if (!dstlist) {
        dstlist = []
        moves_by_dest[destID] = dstlist
      }

      // Movement insertion during processMovement() [generally dragging and falling] might need to result in re-classification of movement in affected spaces,
      // but this doesn't seem particularly important.  So, for now, any movement inserted during processMovement() is assumed to be non-controversial and will
      // be blindly accepted.
      //
      // if (processMovementActive) {
      //   classifyNearCollisions(srcID)
      //   classifyFarCollisions(destID)
      // }

      // Classify near-collisions with objects moving away from the destination (force-originating Object entering a space occupied by a departing Object)
      let tgtList = moves_by_source[destID]
      if (tgtList && tgtList.length > 0) {
        for (let tgtForce of tgtList) {
          if ((force.OBJ != tgtForce.OBJ) && this.impededBy(force.OBJ, tgtForce.OBJ)) {
            //force.outgoing.push(tgtForce)
            //If the directions match, the source is chasing the target
            if (force.toHEADING == tgtForce.fromHEADING) {
              if (tgtForce.moved) {
                //stackfall!
              }
              else {
                let ocol = {target:tgtForce, type:Collision.CHASE}
                force.outgoing.push( ocol )
                tgtForce.incoming.push({source:force, collision:ocol})
              }
            }

            //If the directions are opposite, the source and target are ramming each other
            else if (force.toHEADING == direction.invert[tgtForce.fromHEADING]) {
              let ocol = {target:tgtForce, type:Collision.NEAR_RAM}
              force.outgoing.push( ocol )
              tgtForce.incoming.push({source:force, collision:ocol})
            }

            //If the directions are neither, the source is striking the target's side
            else {
              let ocol = {target:tgtForce, type:Collision.EDGE_RAM}
              force.outgoing.push( ocol )
              tgtForce.incoming.push({source:force, collision:ocol})
            }
          }
        }
      }
      // Classify near-collisions with objects moving toward the origin  (force-originating object entering a space occupied by a departing Object)
      let srcList = moves_by_dest[srcID]
      if (srcList && srcList.length > 0) {
        for (let srcForce of srcList) {
          if ((force.OBJ != srcForce.OBJ) && this.impededBy(force.OBJ, srcForce.OBJ)) {
            //force.outgoing.push(tgtForce)
            //If the directions match, the source is chasing the target
            if (srcForce.toHEADING == force.fromHEADING) {
              if (srcForce.moved) {
                //stackfall!
              }
              else {
                let ocol = {target:force, type:Collision.CHASE}
                srcForce.outgoing.push( ocol )
                force.incoming.push({source:srcForce, collision:ocol})
              }
            }
            else if (srcForce.toHEADING != direction.invert[force.fromHEADING]) {
              let ocol = {target:force, type:Collision.EDGE_RAM}
              srcForce.outgoing.push( ocol )
              force.incoming.push({source:srcForce, collision:ocol})
            }
          }
        }
      }

      // Classify far-collisions (Two objects attempting to enter the same destination)
      tgtList = moves_by_dest[destID]
      if (tgtList && tgtList.length > 0) {
        for (let otherForce of tgtList) {
          if ((force.OBJ != otherForce.OBJ) && this.impededBy(force.OBJ, otherForce.OBJ)) {
            let srcForce = force
            let tgtForce = otherForce

            // Two forces separated by one space moving toward that space
            if (force.toHEADING == direction.invert[otherForce.toHEADING]) {
              let ocol = {target:otherForce, type:Collision.FAR_RAM}
              force.outgoing.push( ocol )
              otherForce.incoming.push({source:force, collision:ocol})

              ocol = {target:force, type:Collision.FAR_RAM}
              otherForce.outgoing.push( ocol )
              force.incoming.push({source:otherForce, collision:ocol})
            }
            // Two diagonally adjacent forces headed toward a common adjacent space
            else if (force.toHEADING != tgtForce.toHEADING) {
              let ocol = {target:otherForce, type:Collision.CORNER_RAM}
              force.outgoing.push( ocol )
              otherForce.incoming.push( {source:force, collision:ocol})

              ocol = {target:force, type:Collision.CORNER_RAM}
              otherForce.outgoing.push( ocol )
              force.incoming.push({source:otherForce, collision:ocol})
            }
          }
        }
      }

      srclist.push(force)
      dstlist.push(force)
    }

    //  Force propagation
    //
    //  This is not *completely* necessesary, as the movement engine is capable of managing live insertions.  However, it is required if forces need to be
    //  processed in an unbiased manner.  (Any forces processed as live-insertions will not be affected by movement occuring prior to insertion)
    //
    //  Also, for force can be propagated without OrthotObject.propagateForce() -- but the call into it form here avoids infinite loops by only accepting one
    //  force per direction per tick.
    //
    //  This differs significantly form Orthot II - force propagation is now managed by the movement engine, rather than the individual objects
    //    ( OrthotObject.__propagate__() is part of the movement engine)

    let fpropagated = false
    for (let obj of force.toCTN.content) {
      fpropagated |= obj.__propagate_force__(force, this.ticknum)
    }
    return fpropagated
  }).bind(this)


  let processMovement = (function() {
    try {

      depend = {}

      let resolved_any = true

      while (true) {
        while (resolved_any || recent_insertion) {
          recent_insertion = false
          resolved_any = false
          for (let id in active_movers) {
            let mover = active_movers[id]
            let force = mover.forces[0]

            //handle force cancellation triggered by logic outside of the movement engine
            if (force.cancelled) {
              //delete the force, if no forces left for the object, remove it from the movement data and re-activate any dependencies
              mover.forces.shift()
              if (mover.forces.length == 0) {
                num_movers--
                let depOBJs = depend[id]
                if (depOBJs) {
                  for (let depOBJ of depOBJs) {
                    active_movers[depOBJ.id] = depOBJ
                  }
                }
                delete active_movers[id]
                delete depend[id]
                continue
              }
            }

            let priorityResolve = true
            let simpleResolve = true

            let deferTO

              // Check to see if the force can be resolved simply.
            for (let collision of force.outgoing) {
              if (!collision.target.cancelled) {

                // This may be problematic in a difficult-to-test case:  If a force ("force-A") with two collisions ("force-B" and "force-C") claims priority over
                //  force-B, does not claim priority over force-C, force-C obstructs only if it succeessfully moves its object, and force-C is impeded in some way,
                //  does force-A with its priority over force-B get respected?
                if (!force.OBJ.hasMovementPriority(force, collision.target, collision.type)) {
                  priorityResolve = false
                  if (collision.type != Collision.NONE) {
                    simpleResolve = false
                    if (!deferTO) {
                      deferTO = collision.target
                    }
                  }
                }
              }
            }

            if (!(simpleResolve || priorityResolve)) {
              if (deferTO) {
                let depOBJs = depend[deferTO.OBJ.id]
                if (!depOBJs) {
                  depend[deferTO.OBJ.id] = depOBJs = []
                }
                depOBJs.push(force.OBJ)
                //depend[deferTO.OBJ.id] = force.OBJ
                force.OBJ.depend = deferTO.OBJ.id
                delete active_movers[id]
                resolved_any = true
              }
            }
            else {
              //Attempt to move
              //  The move can succeeed, fail, or get deferred.
              //  success (trit.TRUE) - the force resolved, and the object moved
              //  fail (trit.FALSE)   - the force resolved, but the object stayed put
              //  defer (trit.MAYBE)  - Additional forces have been added (which are to be processed, to be followed with another call to move())
              let moveResult = force.OBJ.move(force)
              switch(moveResult) {
                // If the object pushed another object, attempt to resolve inserted forces
                case trit.MAYBE:

                  // NOTE:  deferred forces is somewhat of a relic of an earlier and incomplete version of the movement engine.  Force deferral was a hack to
                  //        re-order forces when pushing objects (which has since been cleaned up and handled by the force propagation mechanism)
                  //        force deferral is now automatic and tied directly to collision detection.
                  //        However, this is to be kept as-is because it us useful if pushing an object can result in that object moving through some
                  //        mechanism other than regular force propagation (such as a button attached to the side of an otherwise immobile object which triggers
                  //        its movement)
                  if (force.deferred) {
                    //If the move gets deferred a second time, panic-fail to prevent it from turning into an infinite loop.
                    console.log("  Movement Engine PANIC:  Force deferred a second time!", force)
                    mover.strike(force, undefined, Collision.FAKE)
                    resolvedAny = true
                    force.cancelled = true
                    mover.shift()
                    if (mover.forces.length == 0) {
                      num_movers--
                      let depOBJs = depend[id]
                      if (depOBJs) {
                        for (let depOBJ of depOBJs) {
                          active_movers[depOBJ.id] = depOBJ
                        }
                      }
                      delete active_movers[id]
                      delete depend[id]
                    }
                  }
                  else {
                    resolved_any = true
                    force.deferred = true
                  }
                  break
                case trit.TRUE:
                  resolved_any = true
                  force.moved = true
                  num_movers--
                  //force.priority = Number.MAX_SAFE_INTEGER

                  //cancel all other forces still operating on the object, remove it from movement data, and reactivate any dependencies
                  mover.movedAt = this.ticknum
                  for (let i = 1; i < mover.forces.length; i++) {
                    mover.forces[i].cancelled = true
                  }
                  let depOBJs = depend[id]
                  if (depOBJs) {
                    for (let depOBJ of depOBJs) {
                      active_movers[depOBJ.id] = depOBJ
                    }
                  }
                  delete active_movers[id]
                  delete depend[id]

                  //If the object moves, simplify Collisions and mark them as deferred collisions
                  //  (collisions are "deferred" until it can be determined which force to use for it)
                  for (let collisionRef of force.incoming) {
                    let incCollision = collisionRef.collision
                    let incForce = incCollision.target

                    switch(incCollision.type) {
                      case Collision.CHASE:
                        incCollision.type = Collision.NONE
                        break
                      // If the object has movement priority, it wins FAR_RAM and CORNER_RAM collisions.
                      case Collision.FAR_RAM:
                        incCollision.type = Collision.PRIORITY_RAM       //POWER!!!
                        break
                      case Collision.CORNER_RAM:
                        incCollision.type = Collision.PRIORITY_STEAL
                        break
                    }
                  }
                  processIndirectForces(force)
                  break
                case trit.FALSE:
                  force.cancelled = true
                  resolved_any = true
                  for (let collisionRef of force.incoming) {
                    let incCollision = collisionRef.collision
                    let incForce = incCollision.target
                    switch(incCollision.type) {
                      case Collision.EDGE_RAM:
                      case Collision.NEAR_RAM:
                      case Collision.CHASE:
                        incCollision.type = Collision.SIMPLE
                        break
                      case Collision.FAR_RAM:
                      case Collision.CORNER_RAM:
                        incCollision.type = Collision.NONE
                        break
                    }
                  }

                  //delete the force, if no forces left for the object, remove it from the movement data and re-activate any dependencies
                  mover.forces.shift()
                  if (mover.forces.length == 0) {
                    num_movers--
                    let depOBJs = depend[id]
                    if (depOBJs) {
                      for (let depOBJ of depOBJs) {
                        active_movers[depOBJ.id] = depOBJ
                      }
                    }
                    delete active_movers[id]
                    delete depend[id]
                  }
                  break
              }
            }
          }
        }

        if (num_movers == 0) {
          break
        }

        if (num_movers > 0) {
          //console.log("-------------------------------------------")
          if (Object.values(active_movers).length != 0) {
            // This is supposed to be impossible - If the above loop does anything with any entry in movers, it runs another iteration
            console.log("  ERROR:  unexpected unprocessed non-dependent movement:", active_movers)
            for (let k in active_movers) {
              console.log(k, active_movers[k].id, active_movers[k].forces)
            }
            active_movers = {}
          }


          if (Object.values(depend).length != 0) {

            let checked = []

            main:
            for (let k in depend) {
              k = Number.parseInt(k)
              //Scan for the next unchecked object
              if (checked.indexOf(k) == -1) {
                let node = k
                let cycle_start
                let nodes = []
                //trace through force-dependencies until a loop can be established
                while (true) {
                  let cycle_start = nodes.indexOf(node)
                  if (cycle_start != -1) {
                    break
                  }
                  nodes.push(node)
                  checked.push(node)
                  node = depend[node][0].depend

                  //If the loop has already been encountered, bail out.  (this should be impossible)
                  if ( (checked.indexOf(node) != -1) && (nodes.indexOf(node) == -1) ) {
                    console.log("ERROR:  loop-crasher implicated a force dependency in a previously crashed loop!", node, all_movers[node], nodes, checked)
                    continue main
                  }
                }
                if (cycle_start == -1) {
                  continue main
                }
                //remove nodes which only lead into the loop
                nodes = nodes.splice(cycle_start)

                if (nodes.length > 0) {
                  resolved_any = true

                  //crash the loop
                  for (let id of nodes) {
                    let dobj = all_movers[id]
                    let force = dobj.forces.shift()
                    force.cancelled = true

                    for (let outCollision of force.outgoing) {
                      let outForce = outCollision.target
                      force.OBJ.strike(outForce, outForce.OBJ, outCollision.type, true)
                      outForce.OBJ.struck(force, force.OBJ, outCollision.type, true)
                    }

                    if ( (dobj.forces.length == 0) && (active_movers[dobj.id]) ) {
                      delete active_movers[dobj.id]
                    }
                  }

                  //unleash all forces which are dependent upon anything in the loop and which are not [obviously] part of the loop
                  for (let id of nodes) {
                    let depOBJs = depend[id]
                    if (depOBJs) {
                      for (let depOBJ of depOBJs) {
                        if (depOBJ.forces.length > 0) {
                          active_movers[depOBJ.id] = depOBJ
                          num_movers++
                        }
                      }
                    }
                    delete depend[id]
                  }
                }
              }
            }
            depend = {}
          }
          else {
            all_movers = {}
            active_movers = {}
            num_movers = 0
          }
        }
      }
    }
    catch (err) {
      console.log("  Error processing movement:", err)
      active_movers = {}
      all_movers = {}
      num_movers = 0
    }

    //Moves listed by originating position
    //{pos, [node]}
    moves_by_dest = {}

    //Moves listed by destination
    //{pos, [node]}
    moves_by_source = {}
  }).bind(this);


  let defineWallTerrain = function(id, color) {
    bxtbldr.defineSurface_8bit(id, {
      color:color,
      uv2info:{type:DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*4)+32 }}
    })
    bxtbldr.defineSurface_8bit(id+'H', {
      color:color,
      uv2info:{type:DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*5)}}
    })
    bxtbldr.defineTerrain(id, id,id,id,id,id+'H',id+'H')
  }
  
  ekvx.loadConfig( (id, rawtemplate) => {
    let template = properties_fromstring(rawtemplate.data)

    if (!template.type) {
      return undefined
    }

    switch(template.type) {
      case undefined:
        return undefined
      case 'wall': {
        template.id = id
        if (!template.color) {
          template.color = "rgba,1,1,1,1"
        }
        if (walltemplates[template.color]) {
          return walltemplates[template.color]
        }
        defineWallTerrain(id, template.color)
        walltemplates[template.color] = template
      }
        break
      default:
        //console.log(template)
        break
    }
    return template
  })

  let _min = {
    x:Number.MAX_VALUE,
    y:Number.MAX_VALUE,
    z:Number.MAX_VALUE,
  }
  let _max = {
    x:Number.MIN_VALUE,
    y:Number.MIN_VALUE,
    z:Number.MIN_VALUE,
  }

  let loadData = (function() {

    let gategroups = []
    let targetted_portals = []
    let portals_byname = {}
    let portals_byclass = {}

    let loaded_objects = []
    let ldstage = 1
    let start_align, start_fpmode
    ekvx.loadData( (x,y,z, template, data) => {
      if (flipWorld) {
        z *= -1
      }

      if (x<_min.x) _min.x=x
      if (y<_min.y) _min.y=y
      if (z<_min.z) _min.z=z

      if (x>_max.x) _max.x=x
      if (y>_max.y) _max.y=y
      if (z>_max.z) _max.z=z

      if (data) {
        data = properties_fromstring(data)
      }

      let datas = [template, data]

      let loc = vxc.get(x,y,z)
      let gobj
      let align, color
      let adjctn


      // If an object has an enable or disable code, it gets enabled or disabled based on codes persisted Progress Codes.
      //  But, gates are a special case - A code specified on a gate is applied to the entire gategroup which the gate is a member of
      if (template.type != "gate") {
        let enableInfo = property("if", datas)
        let disableInfo = property("ifnot", datas)

        if (enableInfo && enableInfo != "") {
          if (!orthotCTL.matchCode(enableInfo)) {
            return false
          }
        }
        if (disableInfo && disableInfo != "") {
          if (orthotCTL.matchCode(disableInfo)) {
            return false
          }
        }
      }

      if (ldstage == 1) {
        switch(template.type) {

          // return "true" to defer side-attached objects to a 2nd pass (need to make sure that the carrying objects are instantiated first)
          default:
            return true
            break

          case 'wall':
            vxc.loadTerrain(x,y,z, template.id)
            this.putGameobject(loc, new Wall(this))
            break
          case 'stairs': {
              color = property("color", datas, "white", parseColor)
              align = property("align", datas, undefined, parseO2Orientation)
              gobj = new Stair(this,  color, align)
              adjctn = this.getAdjacentCTN(loc, direction.invert[align.up])
              vxc.setTerrainKnockout(adjctn, align.up)
              adjctn = this.getAdjacentCTN(loc, direction.invert[align.forward])
              vxc.setTerrainKnockout(adjctn, align.forward)

            }
            break
          case 'key': {
              color = property("color", datas, "white")
              let code = property("code", datas)
              gobj = new Key(this, color, code)
              keys.push(gobj)
            }
            break
          case 'lock': {
              color = property("color", datas, "white")
              let code = property("code", datas)
              gobj = new Lock(this, color, code)
              locks.push(gobj)
            }
            break
          case 'target': {
            let campos = property("camPos", datas, undefined, parseVec3)
            if (flipWorld) {
              campos.z *= -1
            }
            campos.x = campos.x - x
            campos.y = campos.y - y + 0.5
            campos.z = campos.z - z
            targets[property("name", datas)] = {
              loc:loc,
              campos:campos
            }
          }
            break
          case 'pblock':
            color = property("color", datas, "red", parseColor)
            gobj = new PushBlock(this, color)
            break
          case 'crate':
            gobj = new Crate(this)
            break
          case 'iceblock':
            gobj = new IceBlock(this)
            break
          case 'sceneportal': {
            let dest = property("dest", datas)
            let target = property("target", datas)
            gobj = new ScenePortal(this, dest, target)
          }
          break

          case 'space_light':
          case 'face_light':
          //  ...  Will have to re-think lighting.  Previous version used unrestricted dynamic lighting, computed it directly and baked it in as VertexColors,
          //        and had lights only affect dynamic objects (for which Unity would base decisions off of proximity between objects and lights)
          //
          //  For now, going with a global directional light
            /*
            let light = new THREE.PointLight(
              property( "color", 16, libek.util.color.toBinary, data, template),
              property( "intensity", 1, Number.parseFloat, data, template),
              property( "range", 16, Number.parseFloat, data, template)/5,
              1
            )
            light.position.set( x,y,z );
            this.scene.add( light );

            console.log(light)
            */
            break
          case "start": {
              let campos = property("camPos", datas, undefined, parseVec3)
              if (flipWorld) {
                campos.z *= -1
              }
              start_align = property("align", datas, undefined, parseO2Orientation)
              start_fpmode = property("camPos", datas) == "fp"
              campos.x = campos.x - x
              campos.y = campos.y - y + 0.5
              campos.z = campos.z - z
              targets.__STARTLOC = {
                loc:loc,
                campos:campos
              }
              let tipMSG = property("tip", datas)
              let defeatMSG
              if (this.resetCause == "defeated") {
                defeatMSG = property("defeat", datas)
                if (!defeatMSG) {
                  defeatMSG = property("death", datas)
                }
              }
              
              // If the startblock data has a message specified, set up am invisible InfoBlock for it
              if ( (tipMSG != undefined) | (defeatMSG != undefined) ) {
                let info_obj = new InfoBlock(this, false, tipMSG, defeatMSG)
                loaded_objects.push(info_obj)
                this.putGameobject(x,y,z, info_obj)
              }
              
            }
            break
          case "info":
            gobj = new InfoBlock(this, true, property("tip", datas))
            break
          case "cammode":
            console.log(datas)
          break
          case "gate": {
            color = property("color", datas, "white", parseColor)
            align = property("align", datas, undefined, parseO2Orientation)
            let mprops = mergeObjects(datas)
            let gate = new Gate(this, loc, color, align, mprops)
            gategroups.push(new GateGroup(this, gate))
          }
          break
          case "moose": {
            align = property("align", datas, undefined, parseO2Orientation)
            gobj = new Moose(this, align)
          }
          break
          case "mouse": {
            align = property("align", datas, undefined, parseO2Orientation)
            gobj = new Mouse(this, align)
          }
          break
          case "flag": {
            let mprops = mergeObjects(datas)
            align = property("align", datas, undefined, parseO2Orientation)
            let code = property("code", datas)
            //console.log("FLAG", mprops)
            gobj = new Flag(this, align, code)
          }
          break
          case "exit": {
            let mprops = mergeObjects(datas)
            align = property("align", datas, undefined, parseO2Orientation)
            //let code = property("code", datas)
            let dest = property("dest", datas)
            let target = property("target", datas)
            gobj = new Exit(this, align, dest, target)
          }
          break
        }
      }
      else {
        switch(template.type) {
          case "paneportal": {
              let p_class = property("class", datas)
              let p_name = property("name", datas)
              let p_target = property("target", datas)

              align = property("align", datas, undefined, parseO2Orientation)
              vxc.setTerrainKnockout(loc, align.up)
              let portal = new Portal(
                align,
                property("color", datas, "white", parseColor),
                p_class, p_name, p_target
              )
              this.attach(x,y,z, portal)

              if (p_target && p_class) {
                console.log("WARNING:  portal defines both single-target and class-based multitargeting (can't do both):", portal)
              }

              if (p_name) {
                portals_byname[pname] = portal
              }
              if (p_target) {
                targetted_portals.push(portal)
              }
              if (p_class) {
                let clist = portals_byclass[p_class]
                if (!clist) {
                  clist = portals_byclass[p_class] = []
                }
                clist.push(portal)
              }
            }
            break
          case "icefloor":
            //console.log("icefloor", datas)
            align = property("align", datas, undefined, parseO2Orientation)
            vxc.setTerrainKnockout(loc, align.up)
            let icf = new Icefloor( align )
            this.attach(x,y,z, icf)
            break
          case "ladder":
            let ldr = new Ladder(
              property("align", datas, undefined, parseO2Orientation),
              property("color", datas, "white", parseColor)
            )
            this.attach(x,y,z, ldr)
            break
          case "button":
            let btn = new Button( this,
              property("align", datas, undefined, parseO2Orientation),
              property("color", datas, "white", parseColor),
              property("size", datas, "small"),
              property("press", datas),
              property("release", datas)
            )
            this.attach(x,y,z, btn)
            break
          default:
            console.log(datas)
            break
        }
      }

      if (gobj) {loadData
        loaded_objects.push(gobj)
        this.putGameobject(x,y,z, gobj)
      }
      return false
    },
    function() {
      ldstage=2
    })

    // graphics & insertion is deferred until after data loading to allow for attached objects
    for (let ld_gobj of loaded_objects) {
      if (ld_gobj.initGraphics()) {
        this.scene.add(ld_gobj.obj)
        if (!ld_gobj.worldpos) {
          ld_gobj.worldpos = ld_gobj.obj.position
        }
        let ctn = ld_gobj.ctn
        ld_gobj.worldpos.set(ctn.x, ctn.y, ctn.z)
        
        // Easiest way I can think of to crank out polygons for InfoBlock-Base without having to add another layer of complexity to the animation system
        //  <<(Featuritis deferred)>>
        if (ld_gobj.staticObjects) {
          for (let obj of ld_gobj.staticObjects) {
            this.scene.add(obj)
            obj.position.set(ctn.x, ctn.y, ctn.z)
          }
        }
      }
      ld_gobj.ready()
    }
    

    let start_target = targets[override_startloc]
    if (!start_target) {
      start_target = targets.__STARTLOC
    }
    // Fallback for an undefined starting position:  invent one.
    if (!start_target) {
      start_align = {
        up:direction.code.UP,
        forward:direction.code.NORTH,
      }
      start_fpmode = false
      
      let x = Math.floor((_min.x+_max.x)/2)
      let y = Math.floor((_min.y+_max.y)/2)
      let z = Math.floor(_min.z-3)
      
      let msg
      if (_max.x == Number.MIN_VALUE) {
        msg = "CONTENTCREATOR forgot to create content, so EKETEK enabled EASY MODE for you.\nHave Fun!" 
        x = 0
        y = 0
        z = 0
        _min.x = -5
        _min.y = -5
        _min.z = -5
        _max.x = 5
        _max.y = 5
        _max.z = 5
      }
      else {
        msg = "CONTENTCREATOR forgot to define a start position, so EKETEK enabled EASY MODE for you.\nHave Fun!"
        _min.x -= 5
        _min.z -= 5
      }
      start_target = {
        loc:{ x:x, y:y, z:z },
        campos:{ x:x-3, y:y+4, z:z-5 }
      }
      
      let info_obj = new InfoBlock(this, false, msg)
      loaded_objects.push(info_obj)
      this.putGameobject(x,y,z, info_obj)
      
      let id = 99999999
      defineWallTerrain( id, "rgba,0,0,0,1")
      
      let buildWall = (function(x,y,z) {
        let loc = vxc.get(x,y,z)
        vxc.loadTerrain(x,y,z, id)
        this.putGameobject(loc, new Wall(this))
      }).bind(this)
      for (let _x = x-4; _x <= x+4; _x++) {
        for (let _z = z-1; _z <= z+1; _z++) {
          buildWall(_x, y-1, _z)
        }
      }
    }
    startloc = start_target.loc
    sviewCTL.setFPmode(false)
    sviewCTL.pickplane.constant = start_target.loc.y+0.5
    sviewCTL.camtarget.set(start_target.loc.x,start_target.loc.y+0.5,start_target.loc.z)
    sviewCTL.setCamposFromCartisian(start_target.campos)
    sviewCTL.updateCamera(true)

    let pl_align
    if (start_align) {
      pl_align = {
        forward:direction.invert[start_align.forward],
        up:start_align.up
      }
    }
    player = new Player(this, pl_align, start_fpmode)
    
    player.initGraphics()
    this.putGameobject(start_target.loc, player)
    this.scene.add(player.obj)
    player.ready()

    //process multi-targetted portals
    for (let k in portals_byclass) {
      let plist = portals_byclass[k]

      //If only a two-entry multitarget spec, simplify it to a pair of one-way links
      if (plist.length == 2) {
        let p1 = plist[0]
        let p2 = plist[1]
        p1.target = p2
        p2.target = p1
        p1.sources.push(p2)
        p2.sources.push(p1)
      }
      else if (plist.length > 2) {
        for (let portal of plist) {
          portal.target = plist
        }
      }
      // list with length 0 is unpossible.
      // if list has one entry, disregard portal class
    }

    //process single-targetted portals
    for (let psrc of targetted_portals) {
      psrc.target = portals_byname[psrc.target]
      psrc.target.sources.push(psrc)
    }

    // Merge gate groups.
    // Result will be that all gates which have the same alignment and are lined up in a row without interruption will be part of the same group.
    let merged_any = true
    while (merged_any) {
      merged_any = false
      for (let i = 0; i < gategroups.length; i++) {
        for (let j = 0; j < gategroups.length; j++) {
          if (i != j) {

            //try a merge and, if successful, drop the merged-in group.
            if (gategroups[i].merge(gategroups[j])) {
              merged_any = true
              gategroups.splice(j,1)

              // decrement indices
              if (i >= j) {
                i--
              }
              j--
            }
          }
        }
      }
    }

    for (let ggroup of gategroups) {
      ggroup.init()
      /*
      for (let gate of ggroup.gates) {
        // For the time being, I want gates which unlock by progress to be visible, but non-obstructing.
        if (ggroup.code) {
          delete gate.SpatialClass
        }
      }
      */
    }
    //console.log(gategroups)
  }).bind(this)
  loadData()

  this.unload = function() {
    deactivateTextDisplay()
    this.destroyObjects()
    this.destroyTerrain()
    if (this.scene.children.length > 0) {
      //console.log("Objects remaining on scene unload:", this.scene.children)
    }

  }
  this.destroyObjects = function() {
    keys = []
    locks = []
    keyReticle.clear()
    lockReticle.clear()
    vxc.forAll(ctn => {
      for (let gobj of ctn.content) {
        gobj.destroy()
      }
    })
  }

  this.destroyTerrain = function() {
    vxc.dispose()
  }

  this.setFPmode = function(fpmode_on, fpmode_moused) {
    if (player) {
      player.setFPmode(fpmode_on, fpmode_moused)
    }
  }

  this.reset = function(resetCause) {
    deactivateTextDisplay()
    this.resetCause = resetCause
    this.destroyObjects()
    dlight.position.set(0,1000,0)
    dlTarget.position.set(0,0,0)
    dlrot = Math.random()*T
    this.ticknum = -1
    prevtick = Date.now()
    prevtime = prevtick
    prevreltime = 0
    this.ticklen = 200
    startloc = vxc.get(0,1,0)
    player = undefined

    isGeomValid = true
    cmdSequences_short = []
    cmdSequences_long = []
    cmdSequences_realtime = []
    tmp_tickListeners = []
    tickListeners = []
    deferredActions = []

    sigReceivers = {}

    vxc.resetData()
    vxc.default = Container
    _min = {
      x:Number.MAX_VALUE,
      y:Number.MAX_VALUE,
      z:Number.MAX_VALUE,
    }
    _max = {
      x:Number.MIN_VALUE,
      y:Number.MIN_VALUE,
      z:Number.MIN_VALUE,
    }
    loadData()
  }
}