export { AnimateBlock, AnimateCreature, VanishAnim }

import { T, getChildrenRecursive, releaseAsset } from '../libek/libek.js'
import { Model } from '../libek/model.js'
import { Transform } from '../libek/transform.js'
import { direction, crossDirections, setOrientation } from '../libek/direction.js'
import { CommandSequence } from '../libek/sequence.js'

import { orthotCTL, sviewCTL, inputCTL } from './orthot.js'

var doNothing = function() {}

/* Animation functions and animation controller generators
   This gets a bit crude, but due to a design quirk (insistance upon having regular objects treat movement the same for portals as for everywhere else),
   the animation system needs to be able to duplicate and delete objects, use multiple instances of the same [internal] animation controller, and be able to
   directly manipulate the camera.
*/
var AnimateBlock = function(zone, blk, orient) {
  let MDL = new Model(orthotCTL.assets, {default:blk.mdlgen})
  blk.obj = MDL.obj
  blk.mdl = MDL

  let transient = false
  let activeAnim

  blk.worldpos = new THREE.Vector3()

  let CFG = function(inst) {

    let ctl = inst.ctl
    let mainCMP = ctl.mainCMP = new inst.Component()

    let matrix = mainCMP.matrix
    let relpos = new THREE.Vector3()
    let scale = new THREE.Vector3(1,1,1)
    let worldpos = new THREE.Vector3()

    let orientation
    // offset and rotation to position object
    if (orient) {
      orientation = orient
      ctl.orientation = orient
    }
    else {
      orientation = ctl.orientation = {}
      setOrientation(orientation,  "south", "up")
    }

    // heading vectors
    let behind = new THREE.Vector3()
    let ahead = new THREE.Vector3()

    // Local coordinate vectors
    let up = new THREE.Vector3()
    let down =  new THREE.Vector3()
    let forward = new THREE.Vector3()
    let backward = new THREE.Vector3()
    let left = new THREE.Vector3()
    let right = new THREE.Vector3()
    let center = new THREE.Vector3()

    let _transient = transient

    let main_txSHIFT = new Transform(matrix)
        main_txSHIFT.orient(orientation)
        main_txSHIFT.translate(relpos)
        main_txSHIFT.translate(worldpos)

    let main_txIMPULSESHIFT = new Transform(matrix)
        main_txIMPULSESHIFT.orient(orientation)
        main_txIMPULSESHIFT.scale(scale)
        main_txIMPULSESHIFT.translate(relpos)
        main_txIMPULSESHIFT.translate(worldpos)

    let main_txIMPACTDOWN = new Transform(matrix)
        main_txIMPACTDOWN.orient(orientation)
        main_txIMPACTDOWN.scale(scale)
        main_txIMPACTDOWN.translate(worldpos)

    let _txSHIFT = [main_txSHIFT]
    let _txIMPULSESHIFT = [main_txIMPULSESHIFT]
    let _txIMPACTDOWN = [main_txIMPACTDOWN]

    //Corresponding transformations for side-attached objects
    //  For the time-being, the alignment of side-attached objects is ignored (should be a rotation and orientation specified by up and forward vectors)
    //  This should be correted after Orthot III becomes a bit more sophistimacated (specifically, the correction should come with logic for making
    //    animation configuration dynamic [ability to add and remove additional side-attached objects]).
    if (blk.sides) {
      for (let i = 1; i < blk.sides.length; i++) {
        let sidegrp = blk.sides[i]

        if (sidegrp.length > 0) {
          let side_orientation = direction.sideorientations[i]
          //console.log("ORIENT", i, orientation)
          let sideCMP = new inst.Component()
          let txmat = sideCMP.matrix
          for (let sobj of sidegrp) {
            sideCMP.setObject(sobj.type, sobj.mdlgen)
          }

          let txSIDE_SHIFT = new Transform(txmat)
              txSIDE_SHIFT.orient(side_orientation)
              txSIDE_SHIFT.translate(relpos)
              txSIDE_SHIFT.translate(worldpos)

          let txSIDE_IMPULSESHIFT = new Transform(txmat)
              //txSIDE_IMPULSESHIFT.orient(orientation)
              txSIDE_IMPULSESHIFT.orient(side_orientation)
              txSIDE_IMPULSESHIFT.scalePosition(scale)
              txSIDE_IMPULSESHIFT.translate(relpos)
              txSIDE_IMPULSESHIFT.translate(worldpos)

          let txSIDE_IMPACTDOWN = new Transform(txmat)
              txSIDE_IMPACTDOWN.orient(side_orientation)
              txSIDE_IMPACTDOWN.scale(scale)
              txSIDE_IMPACTDOWN.translate(worldpos)

          _txSHIFT.push(txSIDE_SHIFT)
          _txIMPULSESHIFT.push(txSIDE_IMPULSESHIFT)
          _txIMPACTDOWN.push(txSIDE_IMPACTDOWN)
        }
      }
    }


    let txSHIFT = function() {
      for (let tx of _txSHIFT) {
        tx.update()
      }
    }
    let txIMPULSESHIFT = function() {
      for (let tx of _txIMPULSESHIFT) {
        tx.update()
      }
    }
    let txIMPACTDOWN = function() {
      for (let tx of _txIMPACTDOWN) {
        tx.update()
      }
    }

    ctl.txMAIN = txSHIFT

    let init_still = (d,t)=>{
      relpos.copy(center)
    }
    let end_still = (d,t)=>{
      relpos.copy(center)
      txSHIFT()
    }

    let init = (d,t) =>{
      relpos.copy(behind)
      lerprelpos_startpos.copy(relpos)
      lerprelpos_endpos.set(0,0,0)
      lerprelpos_len = 1
      lerprelpos_start = 0
      if (_transient) {
        mainCMP.show()
      }
    }
    let end = (d,t)=>{
      relpos.copy(center)
      txSHIFT()
      if (_transient) {
        mainCMP.hide()
      }
    }

    /*  Animation component:  "lerprelpos"
        This sets up a LERP of relpos from a specified start point to a specified end point over a specified time interval */
    let lerprelpos_startpos = new THREE.Vector3()
    let lerprelpos_endpos = new THREE.Vector3()
    let lerprelpos_start, lerprelpos_len
    let lerprelpos = function(d,t) {
      relpos.lerpVectors(lerprelpos_startpos, lerprelpos_endpos, (t-lerprelpos_start) / lerprelpos_len)
    }

    let lerpscale_startscale = new THREE.Vector3()
    let lerpscale_endscale = new THREE.Vector3()
    let lerpscale_start, lerpscale_len
    let lerpscale = function(d,t) {
      scale.lerpVectors(lerpscale_startscale, lerpscale_endscale, (t-lerpscale_start) / lerpscale_len)
    }

    let vec = new THREE.Vector3()
    let vec2 = new THREE.Vector3()
    let vec3 = new THREE.Vector3()

    ctl.ready = function(wpos) {
      mainCMP.setObject("box")
      if (wpos) {
        worldpos.copy(wpos)
        txSHIFT()
      }
      else {
        mainCMP.hide()
      }
    }

    ctl.configure = function(_position, _heading, _forward, _up) {
      if (activeAnim) {
        activeAnim.stop()
        activeAnim = null
      }
      if (_position) {
        worldpos.copy(_position)
      }

      setOrientation(orientation, _forward, _up)
      forward.copy(direction.vector[_forward])
      backward.copy(direction.vector[direction.invert[_forward]])
      up.copy(direction.vector[_up])
      down.copy(direction.vector[direction.invert[_up]])
      let _right = crossDirections(_forward, _up)
      right.copy(direction.vector[_right])
      left.copy(direction.vector[direction.invert[_right]])
      ahead.copy(direction.vector[_heading])
      behind.copy(direction.vector[direction.invert[_heading]])
    }

    ctl.cancelActiveAnim = function() {
      if (activeAnim) {
        activeAnim.stop()
        activeAnim = null
      }
    }

    ctl.shift = new CommandSequence(
      init, end, 1,

      (d,t) => {
        relpos.lerpVectors(behind, center, t)
        txSHIFT()
      }
    )


    let exg = 0.125
    // Orthot III blocks are ... "high-tech"
    ctl.impulseShift = new CommandSequence(
      init, end, 1,
      [ {at:0.00, cmd: d => {
          vec2.set(1,1,1)
          vec3.set(1+exg-Math.abs(ahead.x)*exg*2, 1+exg-Math.abs(ahead.y)*exg*2, 1+exg-Math.abs(ahead.z)*exg*2)
          vec.copy(ahead)
          vec.multiplyScalar(exg)
          vec.add(behind)
          relpos.copy(vec)
        }},
        (d,t) => {
          scale.lerpVectors(vec2, vec3, t*3)
        },
        {at:0.333, cmd:doNothing},
        (d,t) => {
          scale.lerpVectors(vec2, vec3, 2-(t*3))
        },
        {at:0.667, cmd:doNothing},
      ],
      (d,t) => {
        relpos.lerpVectors( vec, center, t)
        txIMPULSESHIFT()
      }
    )

    ctl.squeezethroughportal = new CommandSequence(
      init, end, 1,
      [ {at:0.00, cmd: d => {
          lerpscale_startscale.set(1,1,1)
          vec.set(1,1,1)
          vec2.copy(ahead)
          vec2.multiplyScalar(exg*2)
          vec2.x -= exg
          vec2.y -= exg
          vec2.z -= exg
          lerpscale_endscale.addVectors(vec, vec2)
          lerpscale_start = 0
          lerpscale_len = 0.25
        }},
        lerpscale,
        {at:0.25, cmd: d => {
        }},
        {at:0.75, cmd: d => {
          lerpscale_startscale.copy(lerpscale_endscale)
          lerpscale_endscale.set(1,1,1)
          lerpscale_start = 0.75
          lerpscale_len = 0.25
        }},
        lerpscale,
        {at:1, cmd: d => { scale.set(1,1,1) }},
      ],
      lerprelpos,
      txIMPULSESHIFT
    )

    ctl.impactDown = new CommandSequence(
      init, end, 1,
      [ {at:0.00, cmd: d => {
          vec.set(1,1,1)
          vec2.set(1.25, 0.75, 1.25)
        }},
        (d,t) => {
          scale.lerpVectors(vec, vec2, t*3)
          txIMPACTDOWN()
        },
        {at:0.333, cmd: d => { }},
        (d,t) => {
          scale.lerpVectors(vec, vec2, 2-(t*3))
          txIMPACTDOWN()
        },
        {at:0.667, cmd: d => { }},
        (d,t) => {
          scale.set(1,1,1)
          txIMPACTDOWN()
        }
      ]
    )

    ctl.pickedup = new CommandSequence(
      (d,t) => {
        relpos.set(0,0,0)
        scale.set(1,1,1)
      },
      doNothing, 1,
      (d,t) => {
        scale.y -= (d*0.5)
        relpos.y += d*0.5
        txIMPULSESHIFT()
      },
      { at:0.5, cmd:doNothing },
      (d,t) => {
        relpos.y -= (d*0.125)
        vec.x = Math.abs(ahead.x)
        vec.y = Math.abs(ahead.y)
        vec.z = Math.abs(ahead.z)
        vec.multiplyScalar( d )
        scale.sub(vec)
        vec.copy(ahead)
        vec.multiplyScalar(d*0.125)
        relpos.add(vec)
        //scale.z -= d
        txIMPULSESHIFT()
      }
    )

    // A multi-axail rotation animator.
    // This composes any number of angle-axis rotations, incrementing them in proportion to a per-rotation specified speed on each frame
    // All rotations are centered around the specified pivot point.  If no pivot is specified, it will pivot around (0,0,0)
    ctl.continuousmultiaxialrotator = function(speed, axis, pivot) {
      if (!Array.isArray(speed)) {
        speed = [speed]
        axis = [axis]
      }

      let rots = []
      let state = []
      for (let i = 0; i < speed.length; i++) {
        rots.push(new THREE.Quaternion())
        state.push(0)
        speed[i] /= 1000
      }

      let invpivot
      let tx = new Transform(matrix)

      if (pivot) {
        invpivot = pivot.clone().negate()
        tx.translate(invpivot)
      }
      for (let i = 0; i < speed.length; i++) {
        tx.rotate(rots[i])
      }
      if (pivot) {
        tx.translate(pivot)
      }
      tx.translate(worldpos)

      return new CommandSequence(
        doNothing, doNothing, Number.MAX_VALUE,
        (d,t) => {
          for (let i = 0; i < speed.length; i++) {
            state[i] = (state[i] + d*speed[i]) % T
            rots[i].setFromAxisAngle(axis[i], state[i])
          }
          tx.update()
        }
      )
    }

    ctl.continuousrandomflipper = function(flip_threshold, decay, flip_cost) {
      let tx = new Transform(matrix)
      let scVec = new THREE.Vector3(1,1,1)
      tx.scale(scVec)
      tx.orient(orientation)
      tx.translate(worldpos)
      let state = flip_cost
      return new CommandSequence(
        doNothing, doNothing, Number.MAX_VALUE,
        (d,t) => {
          state -= Math.random()
          if (state < flip_threshold) {
            state += flip_cost
            scVec.x *= -1
            tx.update()
          }
        }
      )
    }
  }

  let mainINST = new MDL.Instance("main", CFG)
  transient = true
  let altINST = new MDL.Instance("alt", CFG)
  altINST.ctl.ready()

  blk.ready = function() {
    mainINST.ctl.ready(blk.worldpos)
  }

  blk.animCTL = {
    orientation:mainINST.ctl.orientation,

    destroy:function() {
      MDL.destroy()
    },
    shift:function(force) {
      mainINST.ctl.configure(blk.worldpos, force.toHEADING, force.toFORWARD, force.toUP)

      if (force.isPortaljump) {
        let hop = force.path[0]
        altINST.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(altINST.ctl.squeezethroughportal)
        zone.addCommandsequence_short(mainINST.ctl.squeezethroughportal)
      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.shift)
      }
    },

    impulseShift:function(force) {
      mainINST.ctl.configure(blk.worldpos, force.toHEADING, force.toFORWARD, force.toUP)

      if (force.isPortaljump) {
        let hop = force.path[0]
        altINST.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(altINST.ctl.squeezethroughportal)
        zone.addCommandsequence_short(mainINST.ctl.squeezethroughportal)
      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.impulseShift)
      }
    },

    impactDown:function(force) {
      mainINST.ctl.configure(blk.worldpos, force.fromHEADING, force.fromFORWARD, force.fromUP)

      if (force.isPortaljump) {
        let hop = force.path[0]
        altINST.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(altINST.ctl.squeezethroughportal)
        zone.addCommandsequence_short(mainINST.ctl.squeezethroughportal)
      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.impactDown)
      }
    },
    startContinuousMultiaxialRotator:function(speed, axis, pivot) {
      mainINST.ctl.cancelActiveAnim()
      let rotator = mainINST.ctl.continuousmultiaxialrotator(speed, axis, pivot)
      zone.addCommandsequence_realtime(rotator)
      activeAnim = rotator
    },
    startContinuousRandomFlipper:function(flip_threshold, decay, flip_cost) {
      mainINST.ctl.cancelActiveAnim()
      let flipper = mainINST.ctl.continuousrandomflipper(flip_threshold, decay, flip_cost)
      zone.addCommandsequence_realtime(flipper)
      activeAnim = flipper
    },
    pickedup(grabber_heading) {
      mainINST.ctl.configure(blk.worldpos, grabber_heading,  direction.code.SOUTH,  direction.code.UP)
      zone.addCommandsequence_short(mainINST.ctl.pickedup)
    }
  }
}

var AnimateCreature = function(zone, cr, nmap, _orient, trackcam=false) {
  let MDL = new Model(orthotCTL.assets, {nmap:nmap})
  cr.obj = MDL.obj

  let main_pos = cr.worldpos = new THREE.Vector3()

  let actually_trackcam = false
  let tmp_trackcam = trackcam
  let transient = false

  let CFG = function(inst) {
    let ctl = inst.ctl
    let mainCMP = ctl.mainCMP = new inst.Component()

    // exposed animation variables.
    //  scale is used externally (mainly by Vanish animator function)
    //  worldpos is where the object is located
    //  backward up, down, backward, forward, left, and right vectors are used to orient the animation
    //  orientation is used to orient the model  (this might later be combined with other orientation vectors for a general-purpose orientation data structure)
    let scale = ctl.scale = new THREE.Vector3(1,1,1)
    let worldpos = ctl.worldpos = new THREE.Vector3()

    // offset and rotation to position object
    let orientation = ctl.orientation = {}
    setOrientation(orientation,  "south", "up")

    // heading vectors
    let behind = new THREE.Vector3()
    let ahead = new THREE.Vector3()

    // Local coordinate vectors
    let up = new THREE.Vector3()
    let down =  new THREE.Vector3()
    let forward = new THREE.Vector3()
    let backward = new THREE.Vector3()
    let left = new THREE.Vector3()
    let right = new THREE.Vector3()
    let center = new THREE.Vector3()

    let ladder_offset_start = new THREE.Vector3()
    let ladder_offset_end = new THREE.Vector3()

    //current model offset
    let relpos = new THREE.Vector3()

    //generic vector for calculations
    let vec = new THREE.Vector3()

    //camera variables
    let tmp_camvec = new THREE.Vector3()
    let tmp_camvec_main = new THREE.Vector3()
    let main_startpos = new THREE.Vector3()


    // Posing functions.
    // These are libek.Transform (parameterized transformations) which pose the animated object
    // On each frame, the active Animation controller adjusts any number of Transform parameters and updates the transform, causing it
    // to re-calculate the THREE.Matrix4 for the displayed object.
    let txMAIN = new Transform(mainCMP.matrix)
    txMAIN.scale(scale)
    txMAIN.orient(orientation)
    txMAIN.translate(relpos)
    txMAIN.translate(worldpos)

    let relrot = new THREE.Quaternion()

    let txMAIN_WITH_RELROT = new Transform(mainCMP.matrix)
    txMAIN_WITH_RELROT.scale(scale)
    txMAIN_WITH_RELROT.orient(orientation)
    txMAIN_WITH_RELROT.rotate(relrot)
    txMAIN_WITH_RELROT.translate(relpos)
    txMAIN_WITH_RELROT.translate(worldpos)

    let _transient = transient
    let _trackcam = tmp_trackcam

    //  Animation INITIALIZERS and FINALIZERS
    //  These are used to enforce expected poses and set up animation temp variables
    //  In theory, these could be mostly omitted (replaced with just a generic function which resets only the the main offset "relpos")
    //  BUT, that is a lot of animations to be cautious about, and these are needed anyway since the animation system "starts over"
    //  every time an object passes through a portal (technically, this animation system was designed to allow individual animations to duplicate
    //  objects and animate through, but that easily doubles the amount of animations, so an intermediary controller was set up that abstracts the
    //  portals away by also duplicating the animation controllers).
    let init = (d,t) =>{
      relpos.copy(behind)
      main_startpos.copy(behind)
      lerprelpos_startpos.copy(relpos)
      lerprelpos_endpos.set(0,0,0)
      lerprelpos_len = 1
      lerprelpos_start = 0

      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }

    let init_still = (d,t)=>{
      relpos.copy(center)
      main_startpos.copy(center)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let end_still = (d,t)=>{
      relpos.copy(center)
      txMAIN.update()
      if (_trackcam && actually_trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }
    let init_ladder_exit = (d,t) => {
      ladder_offset_end.lerpVectors(center, backward, 0.75)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(down)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let init_ladder = (d,t) => {
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(down)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let init_ladder_high = (d,t) => {
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(up)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let init_ladder_still = (d,t) => {
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      //ladder_offset_start.addVectors(ladder_offset_end, down)
      relpos.copy(ladder_offset_end)
      main_startpos.copy(ladder_offset_end)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let init_flat_to_ladder = (d,t) => {
      relpos.copy(center)
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.addVectors(ladder_offset_end, down)
      main_startpos.copy(center)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let end_ladder = (d,t)=>{
      relpos.copy(ladder_offset_end)
      txMAIN.update()

      if (_trackcam && actually_trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.camtarget.add(relpos)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }

    let init_still_up = (d,t)=>{
      relpos.set(0, 0.5, 0)
      main_startpos.set(0, 0.5, 0)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let end_still_up = (d,t)=>{
      relpos.set(0, 0.5, 0)
      txMAIN.update()
      if (_trackcam && actually_trackcam) {
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }

    let init_up = (d,t) =>{
      relpos.copy(behind)
      relpos.y += 0.5
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }

    let init_uphigh = (d,t) =>{
      relpos.copy(behind)
      relpos.y += 1
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }
    let init_uphigher = (d,t) =>{
      relpos.copy(behind)
      relpos.y += 1.5
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }

    let init_down = (d,t) =>{
      relpos.copy(behind)
      relpos.y -= 0.5
      main_startpos.copy(relpos)
      if (_trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
      if (_transient) {
        mainCMP.show()
      }
    }

    let end = (d,t)=>{
      relpos.copy(center)
      txMAIN.update()

      if (_trackcam && actually_trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }

    let end_generic = (d,t)=>{
      txMAIN.update()

      if (_trackcam && actually_trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }

    let end_up = (d,t)=> {
      relpos.set(0, 0.5, 0)
      txMAIN.update()

      if (_trackcam && actually_trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.camtarget.add(relpos)
        sviewCTL.updateCamera()
      }
      if (_transient) {
        mainCMP.hide()
      }
    }
    /*  Animation component:  "lerprelpos"
        This sets up a LERP of relpos from a specified start point to a specified end point over a specified time interval */
    let lerprelpos_startpos = new THREE.Vector3()
    let lerprelpos_endpos = new THREE.Vector3()
    let lerprelpos_start, lerprelpos_len
    //let lerprelposTX = txMAIN
    let lerprelpos = function(d,t) {
      relpos.lerpVectors(lerprelpos_startpos, lerprelpos_endpos, (t-lerprelpos_start) / lerprelpos_len)
    }

    let slerprelrot_start, slerprelrot_len
    let slerprelrot_startrot = new THREE.Quaternion()
    let slerprelrot_endrot = new THREE.Quaternion()
    let slerprelrot = function(d,t) {
      THREE.Quaternion.slerp(slerprelrot_startrot, slerprelrot_endrot, relrot, (t-slerprelrot_start) / slerprelrot_len)
    }

    // camera tracking logic
    let begin_trackCam, end_trackCam
    if (tmp_trackcam) {
      begin_trackCam = function() {
        tmp_camvec.copy(relpos)
      }
      end_trackCam = function() {
        if (actually_trackcam) {
          tmp_camvec.sub(relpos)
          sviewCTL.camtarget.sub(tmp_camvec)
          sviewCTL.updateCamera()
        }
      }
    }

    // Callback used to instantiate andpose the displayed object (must be called before any animations are triggered)
    ctl.ready = function() {
      //console.log("READY")
      mainCMP.setObject("creature", "stand")
      txMAIN.update()
    }

    ctl.configure = function(_position, _heading, _forward, _up) {
      if (_position) {
        worldpos.copy(_position)
      }
      setOrientation(orientation, _forward, _up)

      forward.copy(direction.vector[_forward])
      backward.copy(direction.vector[direction.invert[_forward]])
      up.copy(direction.vector[_up])
      down.copy(direction.vector[direction.invert[_up]])
      let _right = crossDirections(_forward, _up)
      right.copy(direction.vector[_right])
      left.copy(direction.vector[direction.invert[_right]])
      ahead.copy(direction.vector[_heading])
      behind.copy(direction.vector[direction.invert[_heading]])
    }

    // Procedural Animation controllers.  Each manages one animated action.
    // REMINDER:  THREE.AnimationMixer may be used directly by these controllers to implement an animation.
    //            (libek.CommandSequence passes time-delta as the first parameter)

    ctl.fallAnim = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [{at:0.00, cmd: d => {
        lerprelpos_startpos.copy(behind)
        lerprelpos_endpos.set(0,0,0)
        lerprelpos_len = 1
        lerprelpos_start = 0
      }}],
      lerprelpos,
      txMAIN.update,
      end_trackCam,
    )
    ctl.halfdownfallAnim = new CommandSequence(
      init, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(up)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.5
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "stand"); scale.x = 1; scale.y = 1; }},
        lerprelpos,
        {at:0.50, cmd:doNothing}
      ],
      txMAIN.update,
      end_trackCam
    )
    ctl.flopoutofportal = new CommandSequence(
      init, (d,t) => {
        relpos.copy(lerprelpos_endpos)
        end_generic(d,t)
      }, 1,
      begin_trackCam,
      [{at:0.00, cmd: d => {
        lerprelpos_startpos.copy(behind)
        lerprelpos_endpos.set(0,0,0)
        lerprelpos_len = 0.5
        lerprelpos_start = 0
      }},
      lerprelpos,
      {at:0.50, cmd: d => {
        lerprelpos_startpos.set(0,0,0)
        lerprelpos_endpos.set(0,-0.4,0)
        lerprelpos_len = 0.5
        lerprelpos_start = 0.5
      }},
      lerprelpos,
      ],
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_flat_popupfromgroundportal = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [
        lerprelpos,
        txMAIN.update,
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        lerprelpos,
        txMAIN.update,
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1
          slerprelrot_startrot.setFromAxisAngle(right, 0)
          slerprelrot_endrot.setFromAxisAngle(right, T/4)
          slerprelrot_len = 0.5
          slerprelrot_start = 0.5

          lerprelpos_startpos.copy(relpos)
          lerprelpos_endpos.set(0,1,0)
          lerprelpos_endpos.sub(orientation.position)
          lerprelpos_len = 0.5
          lerprelpos_start = 0.5
        }},
        lerprelpos, slerprelrot, txMAIN_WITH_RELROT.update,
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        lerprelpos, slerprelrot, txMAIN_WITH_RELROT.update,
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      end_trackCam
    )

    ctl.walk_flatflat = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [ {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_flatuportal = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [ {at:0, cmd: d=> {
          lerprelpos_startpos.copy(down)
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_urampuramp = new CommandSequence(
      init_up, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.copy(center)
          lerprelpos_startpos.y = 0.5
          lerprelpos_endpos.y = 0.5
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampupdown = new CommandSequence(
      init_up, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.lerpVectors(behind, center, 0.5)
          lerprelpos_startpos.y = 0.5
          lerprelpos_endpos.y = 1
          lerprelpos_len = 0.5
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1;
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy( center)
          lerprelpos_endpos.y = 0.5
          lerprelpos_len = 0.5
          lerprelpos_start = 0.5
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampdownup = new CommandSequence(
      init_up, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.lerpVectors(behind, center, 0.5)
          lerprelpos_startpos.y = 0.5
          lerprelpos_len = 0.5
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1;
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy( center)
          lerprelpos_endpos.y = 0.5
          lerprelpos_len = 0.5
          lerprelpos_start = 0.5
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_flathop = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "leap")
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.lerpVectors(behind, center, 0.33)
          lerprelpos_endpos.y = 0.25
          lerprelpos_len = 0.33
          lerprelpos_start = 0
        }},
        {at:0.33, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.lerpVectors(behind, center, 0.67)
          lerprelpos_endpos.y = 0.25
          lerprelpos_len = 0.34
          lerprelpos_start = 0.33
        }},
        {at:0.67, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.33
          lerprelpos_start = 0.67
        }},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_urampup = new CommandSequence(
      init_up, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "leap")
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y = 0.5
          lerprelpos_endpos.lerpVectors(behind, center, 0.33)
          lerprelpos_endpos.y = 0.75
          lerprelpos_len = 0.33
          lerprelpos_start = 0
        }},
        {at:0.33, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.lerpVectors(behind, center, 0.67)
          lerprelpos_endpos.y = 0.75
          lerprelpos_len = 0.34
          lerprelpos_start = 0.33
        }},
        {at:0.67, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.33
          lerprelpos_start = 0.67
        }},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_urampgap = new CommandSequence(
      init_up, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "leap");
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y = 0.5
          lerprelpos_endpos.lerpVectors(behind, center, 0.33)
          lerprelpos_endpos.y = 0.75
          lerprelpos_len = 0.33
          lerprelpos_start = 0
        }},
        {at:0.33, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.lerpVectors(behind, center, 0.67)
          lerprelpos_endpos.y = 0.50
          lerprelpos_len = 0.34
          lerprelpos_start = 0.33
        }},
        {at:0.67, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.33
          lerprelpos_start = 0.67
        }},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_flatup = new CommandSequence(
      init, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, center, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand");
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_flatdown = new CommandSequence(
      init_uphigh, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y += 1
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, up, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk");scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampdownflat = new CommandSequence(
      init_up, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y += 0.5
          lerprelpos_endpos.lerpVectors(behind, center, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampupflat = new CommandSequence(
      init_down, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y -= 0.5
          lerprelpos_endpos.lerpVectors(behind, center, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )
    ctl.walk_rampuphop = new CommandSequence(
      init_down, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y -= 0.5
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, lerprelpos_endpos, 0.5)
          lerprelpos_endpos.y = 1
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "leap")
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampupup = new CommandSequence(
      init_down, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y -= 0.5
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.walk_rampdowndown = new CommandSequence(
      init_uphigher, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y += 1.5
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.10, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam,
    )

    ctl.pushstandAnim = new CommandSequence(
      init_still, end_still, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "walk");
          scale.x = 1; scale.y = 0.97;
          lerprelpos_startpos.copy(center);
          lerprelpos_endpos.lerpVectors(center, ahead, 0.2)
          lerprelpos_len = 0.25
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:0.25, cmd: d => { mainCMP.setObject("creature", "pushwalk"); relpos.copy(lerprelpos_endpos); }},
        {at:0.75, cmd: d => {
          mainCMP.setObject("creature", "walk");
          scale.x = -1;
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.25
          lerprelpos_start = 0.75
        }},
        lerprelpos,
        {at:1.00, cmd: d => {
          mainCMP.setObject("creature", "stand");
          scale.y = 1;
          relpos.copy(center)
        }},
      ],
      txMAIN.update,
      end_trackCam
    )
    ctl.halfuppushstandAnim = new CommandSequence(
      init_still_up, end_still_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "walk")
          scale.x = 1; scale.y = 0.97;
          lerprelpos_startpos.set(0, 0.5, 0);
          lerprelpos_endpos.copy(ahead)
          lerprelpos_endpos.y += 0.5
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, lerprelpos_endpos, 0.2)
          lerprelpos_len = 0.25
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:0.25, cmd: d => { mainCMP.setObject("creature", "pushwalk"); relpos.copy(lerprelpos_endpos); }},
        {at:0.75, cmd: d => {
          mainCMP.setObject("creature", "walk")
          scale.x = -1;
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.25
          lerprelpos_start = 0.75
        }},
        lerprelpos,
        {at:1.00, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1;
          relpos.set(0, 0.5, 0)
        }},
      ],
      txMAIN.update,
      end_trackCam
    )

    // ladder_offset_start
    // ladder_offset_end

    ctl.grabladder_flat = new CommandSequence(
      init_flat_to_ladder, end_ladder, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          mainCMP.setObject("creature", "walk");
          scale.y = 0.97;
          lerprelpos_startpos.copy(center);
          lerprelpos_endpos.copy(ladder_offset_end)
          lerprelpos_len = 0.25
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:0.25, cmd: d => { mainCMP.setObject("creature", "push"); scale.y = 1; }},
      ],
      txMAIN.update,
      end_trackCam
    )

    ctl.hopoffladder = new CommandSequence(
      init_ladder_still, end_still, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(ladder_offset_end);
          lerprelpos_endpos.lerpVectors(ladder_offset_end, center, 1/3)
          lerprelpos_endpos.y = 0.3
          lerprelpos_len = 1/6
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:1/6, cmd: d => {
          mainCMP.setObject("creature", "stand");
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.lerpVectors(ladder_offset_end, center, 2/3)
          lerprelpos_endpos.y = 0.4
          lerprelpos_len = 1/6
          lerprelpos_start = 1/6
        }},
        lerprelpos,
        {at:2/6, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.copy(center)
          lerprelpos_endpos.y = 0.3
          lerprelpos_len = 1/6
          lerprelpos_start = 2/6
        }},
        lerprelpos,
        {at:0.5, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 0.5
          lerprelpos_start = 0.5
        }},
        lerprelpos
      ],
      txMAIN.update,
      end_trackCam
    )

    ctl.exitladder = new CommandSequence(
      init_ladder_exit, end, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(ladder_offset_start);
          lerprelpos_endpos.copy(ladder_offset_end)
          lerprelpos_len = 3/6
          lerprelpos_start = 0
        }},
        lerprelpos, txMAIN.update,
        {at:1/6, cmd: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        lerprelpos, txMAIN.update,
        {at:2/6, cmd: d => {
          mainCMP.setObject("creature", "pushleap");
          slerprelrot_startrot.setFromAxisAngle(right, 0)
          slerprelrot_endrot.setFromAxisAngle(right, T/4)
          slerprelrot_len = 1/6
          slerprelrot_start = 2/6
        }},
        lerprelpos, slerprelrot, txMAIN_WITH_RELROT.update,
        {at:3/6, cmd: d => {
          mainCMP.setObject("creature", "leap");
          lerprelpos_startpos.copy(ladder_offset_end);
          lerprelpos_endpos.lerpVectors(ladder_offset_end, center, 1/3)
          lerprelpos_endpos.y += 0.3
          lerprelpos_len = 1/6
          lerprelpos_start = 3/6
        }},
        lerprelpos, txMAIN.update,
        {at:4/6, cmd: d => {
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.lerpVectors(ladder_offset_end, center, 2/3)
          lerprelpos_endpos.y += 0.2
          lerprelpos_len = 1/6
          lerprelpos_start = 4/6
        }},
        lerprelpos, txMAIN.update,
        {at:5/6, cmd: d => {
          mainCMP.setObject("creature", "stand");
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.copy(center)
          lerprelpos_len = 1/6
          lerprelpos_start = 5/6
        }},
        lerprelpos, txMAIN.update,
      ],
      end_trackCam
    )

    ctl.climbupladder = new CommandSequence(
      init_ladder, end_ladder, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(ladder_offset_start);
          lerprelpos_endpos.copy(ladder_offset_end)
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.125, cmd: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        {at:0.375, cmd: d => {
          mainCMP.setObject("creature", "stand");
        }},
        {at:0.625, cmd: d => {
          mainCMP.setObject("creature", "pushwalk");
          scale.x = -1
        }},
        {at:0.875, cmd: d => {
          mainCMP.setObject("creature", "stand");
          scale.x = 1
        }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.climbdownladder = new CommandSequence(
      init_ladder_high, end_ladder, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(ladder_offset_start);
          lerprelpos_endpos.copy(ladder_offset_end)
          lerprelpos_len = 1
          lerprelpos_start = 0
        }},
        {at:0.125, cmd: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        {at:0.375, cmd: d => {
          mainCMP.setObject("creature", "stand");
        }},
        {at:0.625, cmd: d => {
          mainCMP.setObject("creature", "pushwalk");
          scale.x = -1
        }},
        {at:0.875, cmd: d => {
          mainCMP.setObject("creature", "stand");
          scale.x = 1
        }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    let randslidepose = function() {
      mainCMP.setObject("creature", "slide"+(Math.floor(1+Math.random()*5)))
      scale.x = (Math.random() > 0.5 ? 1 : -1)
    }

    ctl.slide_flatflat = new CommandSequence(
      init, end, 1,
      begin_trackCam,
      [ {at:0.125, cmd:randslidepose},
        {at:0.375, cmd:randslidepose},
        {at:0.625, cmd:randslidepose},
        {at:0.875, cmd:randslidepose},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.slide_flatdown = new CommandSequence(
      init_uphigh, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_startpos.y += 1
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, up, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.125, cmd:randslidepose},
        {at:0.375, cmd:randslidepose},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand")
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.slide_flatup = new CommandSequence(
      init, end_up, 1,
      begin_trackCam,
      [ {at:0.00, cmd: d => {
          lerprelpos_startpos.copy(behind)
          lerprelpos_endpos.lerpVectors(lerprelpos_startpos, center, 0.5)
          lerprelpos_len = 0.50
          lerprelpos_start = 0
        }},
        {at:0.125, cmd:randslidepose},
        {at:0.375, cmd:randslidepose},
        {at:0.50, cmd: d => {
          mainCMP.setObject("creature", "stand");
          scale.y = 1
          lerprelpos_startpos.copy(lerprelpos_endpos)
          lerprelpos_endpos.set(0, 0.5, 0)
          lerprelpos_len = 0.50
          lerprelpos_start = 0.50
        }},
        {at:0.60, cmd: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {at:1.00, cmd: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      lerprelpos,
      txMAIN.update,
      end_trackCam
    )

    ctl.slidestrike = new CommandSequence(
      init_still, end_still, 1,
      begin_trackCam,
      [ {at:0,     cmd:d=>{
          lerprelpos_startpos.copy(center)
          lerprelpos_endpos.lerpVectors(center, ahead, 0.2)
          lerprelpos_len = 0.2
          lerprelpos_start = 0
        }},
        lerprelpos,
        {at:0.125, cmd:randslidepose},
        lerprelpos,
        {at:0.2,   cmd:d=>{
          relpos.copy(lerprelpos_endpos)
        }},
        {at:0.375,   cmd:d=>{
          mainCMP.setObject("creature", "stand")
          lerprelpos_startpos.copy(lerprelpos_endpos);
          lerprelpos_endpos.copy(center)
          lerprelpos_start = 0.375
          lerprelpos_len = 0.625
        }},
        lerprelpos,
      ],
      txMAIN.update,
      end_trackCam
    )
  }

  //set up the main instance
  let mainINST = new MDL.Instance("main", CFG, true)
  tmp_trackcam = false
  transient = true
  let minorINST1 = new MDL.Instance("inst1", CFG, false)
  let minorINST2 = new MDL.Instance("inst1", CFG, false)

  minorINST1.ctl.ready()
  minorINST2.ctl.ready()

  cr.ready = function() {
    mainINST.ctl.worldpos.copy(cr.worldpos)
    mainINST.ctl.ready()
  }

  let configurecam = function(refocus) {
    if (trackcam) {
      if (refocus) {
        orthotCTL.event.dispatchEvent(new Event("quickrefocus"))
        actually_trackcam = false
      }
      else {
        actually_trackcam = true
      }
    }
  }

  //The high-level animation controller.
  //In general, these select an animation, then configure the animation, then trigger it.
  //If a portal is involved, these will also enable dummy objects for each portal crossed and configure and trigger animations for the dummy objects
  let mCTL = cr.animCTL = {
    orientation:mainINST.ctl.orientation,
    setNMAP:function(nmap) {
      MDL.nmap = nmap
    },
    destroy:function() {
      MDL.destroy()
    },

    fall:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)

      switch(force.toHEADING) {
        case direction.code.UP:
            zone.addCommandsequence_short(mainINST.ctl.fallAnim)
          break

        case direction.code.DOWN:
          if (force.toCTN.getObject_bytype("ramp")) {
            zone.addCommandsequence_short(mainINST.ctl.halfdownfallAnim)
          }
          else {
            zone.addCommandsequence_short(mainINST.ctl.fallAnim)
          }
          break

        default:
          zone.addCommandsequence_short(mainINST.ctl.flopoutofportal)
          break
      }

      if (force.isPortaljump) {
        let hop = force.path[0]
        minorINST1.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(minorINST1.ctl.fallAnim)
      }
    },
    defeat:function() {
      VanishAnim(zone, mainINST.ctl.mainCMP.getObject("creature"), {scale:mainINST.ctl.scale, orientation:mainINST.ctl.orientation, pos:mainINST.ctl.worldpos})
    },

    pushfixedobjectAnim:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.fromCTN, force.toHEADING, force.toFORWARD, force.toUP)
      if (force.fromCTN.getObject_bytype("ramp")) {
        zone.addCommandsequence_short(mainINST.ctl.halfuppushstandAnim)

      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.pushstandAnim)
           //   this.animCTL.pushstandAnim(force)
      }
    },

    slidestrike:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.fromCTN, force.toHEADING, force.toFORWARD, force.toUP)
      if (force.fromCTN.getObject_bytype("ramp")) {
        //Impossible.  For now.  But...  maybe ice-ramps could be a fun way to get launched?
        zone.HALT('Unimplemented Animation "halfupslidestrike" requested but is still supposed to be impossible...  Did DEVELOPER perhaps forget to assign surface types on an OrthotObject?')
        console.log(cr, force)
        zone.addCommandsequence_short(mainINST.ctl.halfupslidestrike)
      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.slidestrike)
      }
    },

    slide:function(force) {
      configurecam(force.isPortaljump)

      let animName

      {  //flat ground
        if (force.toUPRAMP) {
          animName = "flatup"
        }
        else if (force.toDOWNRAMP) {
          animName = "flatdown"

        }
        else if (force.hopOUT) {
          animName = "flatflat"
        }
        else {  //flat ground
          animName = "flatflat"
        }
      }


      if (animName) {
        //console.log("run animation:  ", animName)
        animName = "slide_" + animName
        if (force.isPUSH) {
          animName = "push" + animName
        }
        //animName += "_anim"


        if (mainINST.ctl[animName]) {
          mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)

          if (force.isPortaljump) {
            let hop = force.path[0]
            minorINST1.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
            zone.addCommandsequence_short(minorINST1.ctl[animName])
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
          else {
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
        }
        else {
          console.log(`ERROR:  ANIMATION "${animName}" Is not implemented!`)
        }
      }
    },

    walk:function(force) {
      configurecam(force.isPortaljump)

      let animName
      if (force.fromUPRAMP) {
        if (force.toUPRAMP) {
          animName = "rampupup"
        }
        else if (force.toDOWNRAMP) {
          animName = "rampupdown"
        }
        else if (force.hopOUT) {
          animName = "rampuphop"
        }
        else {
          animName = "rampupflat"
        }
      }
      else if (force.fromDOWNRAMP) {
        if (force.toUPRAMP) {
          animName = "rampdownup"
        }
        else if (force.toDOWNRAMP) {
          animName = "rampdowndown"
        }
        else if (force.hopOUT) {
          animName = "rampdownhop"

        }
        else {
          animName = "rampdownflat"
        }
      }
      else if (force.fromUNALIGNEDRAMP) {
        if (force.toUPRAMP) {
          animName = "urampup"
        }
        else if (force.toUNALIGNEDRAMP) {
          animName = "urampuramp"
        }
        else if (force.toGAP) {
          animName = "urampgap"
        }
      }
      else {
        if (force.toUPRAMP) {
          animName = "flatup"
        }
        else if (force.toDOWNRAMP) {
          animName = "flatdown"

        }
        else if (force.hopOUT) {
          animName = "flathop"
        }
        else {
          animName = "flatflat"
        }
      }


      if (animName) {
        animName = "walk_" + animName
        if (force.isPUSH) {
          animName = "push" + animName
        }


        if (mainINST.ctl[animName]) {
          mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)

          if (force.isPortaljump) {
            let hop = force.path[0]
            minorINST1.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
            zone.addCommandsequence_short(minorINST1.ctl[animName])
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
          else {
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
        }
      }
      else {
        console.log("ERROR: No defined walk-animation for requested move:", force)
      }
    },

    show:function() {
      mainINST.ctl.mainCMP.show()
    },
    hide:function() {
      mainINST.ctl.mainCMP.hide()
    },

    walk_flatflat:function(force) {
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)
      switch(force.toHEADING) {
        //walk through a vertical portal -> pop up out of a horizontal/ground portal
        case direction.code.UP:
          zone.addCommandsequence_short(mainINST.ctl.walk_flat_popupfromgroundportal)
          break
        //walk through a vertical portal -> fall out of a horizontal/ceiling portal
        case direction.code.DOWN:
          zone.addCommandsequence_short(mainINST.ctl.walk_flat_falloutofceilingportal)
          break
        default:
          //libek.direction.setOrientation(mainINST.ctl.orientation, force.toHEADING, force.toUP)
          zone.addCommandsequence_short(mainINST.ctl.walk_flatflat)
          break
      }
      if (force.isPortaljump) {
        let hop = force.path[0]
        minorINST1.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(minorINST1.ctl.walk_flatflat)
      }
    },

    walk_flathop:function(force) {
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)
      switch(force.toHEADING) {
        //walk through a vertical portal -> pop up out of a horizontal/ground portal
        case direction.code.UP:
          zone.addCommandsequence_short(mainINST.ctl.walk_flat_popupfromgroundportal)
          break
        //walk through a vertical portal -> fall out of a horizontal/ceiling portal
        case direction.code.DOWN:
          zone.addCommandsequence_short(mainINST.ctl.walk_flat_falloutofceilingportal)
          break
        default:
          //libek.direction.setOrientation(mainINST.ctl.orientation, force.toHEADING, force.toUP)
          zone.addCommandsequence_short(mainINST.ctl.walk_flathop)
          break
      }
      if (force.isPortaljump) {
        let hop = force.path[0]
        minorINST1.ctl.configure(hop.adjCTN, hop.fromHEADING, hop.fromFORWARD, hop.fromUP)
        zone.addCommandsequence_short(minorINST1.ctl.walk_flathop)
      }
    },

    grabLadder:function(force) {
      configurecam(false)
      mainINST.ctl.configure(force.fromCTN, force.toHEADING, force.toFORWARD, force.toUP)
      zone.addCommandsequence_short(mainINST.ctl.grabladder_flat)
    },
    hopoffLadder:function(forward, up) {
      configurecam(false)
      mainINST.ctl.configure(undefined, forward, forward, up)
      zone.addCommandsequence_short(mainINST.ctl.hopoffladder)
    },
    exitLadder:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)
      zone.addCommandsequence_short(mainINST.ctl.exitladder)
    },
    climbupLadder:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)
      zone.addCommandsequence_short(mainINST.ctl.climbupladder)
    },
    climbdownLadder:function(force) {
      configurecam(force.isPortaljump)
      mainINST.ctl.configure(force.toCTN, force.toHEADING, force.toFORWARD, force.toUP)
      zone.addCommandsequence_short(mainINST.ctl.climbdownladder)
    },
  }
}


var VanishAnim = function(zone, obj, params = {}) {
  if (obj.isOrthotObject) {
    obj = obj.obj
  }
  let parent = obj.parent
  let chldrn = getChildrenRecursive(obj)
  for (let ii = 0; ii < chldrn.length; ii++) {
    let mdl = chldrn[ii]
    let worldpos = params.pos
    let scale = params.scale ? params.scale : new THREE.Vector3(1,1,1)
    let orientation = params.orientation
    if (!orientation) {
      orientation = {}
      setOrientation(orientation,  "south", "up")
    }

    let instA_TX, instA_mdl, instA_matrix, instA_mats, instA_colors, instA_colors_hsl, instA_scale, instA_rotation, instA_rotaxis, instA_rotspd
    let instB_TX, instB_mdl, instB_matrix, instB_mats, instB_colors, instB_colors_hsl, instB_scale, instB_rotation, instB_rotaxis, instB_rotspd
    let instC_TX, instC_mdl, instC_matrix, instC_mats, instC_colors, instC_colors_hsl, instC_scale, instC_rotation, instC_rotaxis, instC_rotspd
    let instD_TX, instD_mdl, instD_matrix, instD_mats, instD_colors, instD_colors_hsl, instD_scale, instD_rotation, instD_rotaxis, instD_rotspd

    let adjustColors = function(t) {
      for (let i = 0; i < instA_mats.length; i++) {
        instA_colors[i].setHSL(instA_colors_hsl[i].h+t*120, instA_colors_hsl[i].s, instA_colors_hsl[i].l)
        instB_colors[i].setHSL(instB_colors_hsl[i].h-t*120, THREE.Math.lerp(instB_colors_hsl[i].s,0, t), instB_colors_hsl[i].l)
        instC_colors[i].setHSL(instC_colors_hsl[i].h+t*360, instC_colors_hsl[i].s, THREE.Math.lerp(instC_colors_hsl[i].l,1,t))
        instD_colors[i].setHSL(instD_colors_hsl[i].h-t*360, instD_colors_hsl[i].s, THREE.Math.lerp(instD_colors_hsl[i].l,0,t))
      }
    }
    let setOpacity = function(amt, ... mats) {
      for (let mlist of mats) {
        for (let mat of mlist) {
          mat.opacity = amt
        }
      }
    }

    let spdscale = 1
    let animlen = 750
    zone.addCommandsequence_realtime(new CommandSequence(
      (d,t) => {

        let basematrix = mdl.matrixWorld.clone()
        basematrix.elements[12] -= worldpos.x
        basematrix.elements[13] -= worldpos.y
        basematrix.elements[14] -= worldpos.z

        if (mdl.parent) {
          releaseAsset(orthotCTL.assets, mdl)
        }

        instA_mdl = mdl.clone()
        instA_matrix = new THREE.Matrix4()
        instA_mdl.matrixAutoUpdate = false
        instA_mats = []
        instA_colors = []
        instA_colors_hsl = []
        instA_scale = new THREE.Vector3(1,1,1)
        instA_rotation = new THREE.Quaternion()
        instA_rotaxis = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1).normalize()
        instA_rotspd = (Math.random()*spdscale)**2

        instB_mdl = mdl.clone()
        instB_mdl.matrixAutoUpdate = false
        instB_matrix = new THREE.Matrix4()
        instB_mats = []
        instB_colors = []
        instB_colors_hsl = []
        instB_scale = new THREE.Vector3(1,1,1)
        instB_rotation = new THREE.Quaternion()
        instB_rotaxis = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1).normalize()
        instB_rotspd = (Math.random()*spdscale)**2

        instC_mdl = mdl.clone()
        instC_mdl.matrixAutoUpdate = false
        instC_matrix = new THREE.Matrix4()
        instC_mats = []
        instC_colors = []
        instC_colors_hsl = []
        instC_scale = new THREE.Vector3(1,1,1)
        instC_rotation = new THREE.Quaternion()
        instC_rotaxis = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1).normalize()
        instC_rotspd = (Math.random()*spdscale)**2

        instD_mdl = mdl.clone()
        instD_mdl.matrixAutoUpdate = false
        instD_matrix = new THREE.Matrix4()
        instD_mats = []
        instD_colors = []
        instD_colors_hsl = []
        instD_scale = new THREE.Vector3(1,1,1)
        instD_rotation = new THREE.Quaternion()
        instD_rotaxis = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1).normalize()
        instD_rotspd = (Math.random()*spdscale)**2

        instA_TX = new Transform(instA_matrix, basematrix)
        instA_TX.scale(scale)
        instA_TX.scale(instA_scale)
        instA_TX.orient(orientation)
        instA_TX.rotate(instA_rotation)
        instA_TX.translate(worldpos)
        instA_mdl.matrix = instA_matrix
        orthotCTL.ActiveZone.scene.add(instA_mdl)


        instB_TX = new Transform(instB_matrix, basematrix)
        instB_TX.scale(scale)
        instB_TX.scale(instB_scale)
        instB_TX.orient(orientation)
        instB_TX.rotate(instB_rotation)
        instB_TX.translate(worldpos)
        instB_mdl.matrix = instB_matrix
        orthotCTL.ActiveZone.scene.add(instB_mdl)


        instC_TX = new Transform(instC_matrix, basematrix)
        instC_TX.scale(scale)
        instC_TX.scale(instC_scale)
        instC_TX.orient(orientation)
        instC_TX.rotate(instC_rotation)
        instC_TX.translate(worldpos)
        instC_mdl.matrix = instC_matrix
        orthotCTL.ActiveZone.scene.add(instC_mdl)

        instD_TX = new Transform(instD_matrix, basematrix)
        instD_TX.scale(scale)
        instD_TX.scale(instD_scale)
        instD_TX.orient(orientation)
        instD_TX.rotate(instD_rotation)
        instD_TX.translate(worldpos)
        instD_mdl.matrix = instD_matrix
        orthotCTL.ActiveZone.scene.add(instD_mdl)

        for (let i = 0; i < mdl.children.length; i++) {
          let child = mdl.children[i]
          let _mat = child.material
          let mat = _mat.clone()
          instA_mats.push(mat)
          instA_colors.push(mat.color)
          instA_colors_hsl.push(mat.color.getHSL())
          mat.transparent = true
          instA_mdl.children[i].material = mat

          mat = _mat.clone()
          instB_mats.push(mat)
          instB_colors.push(mat.color)
          instB_colors_hsl.push(mat.color.getHSL())
          mat.transparent = true
          instB_mdl.children[i].material = mat

          mat = _mat.clone()
          instC_mats.push(mat)
          instC_colors.push(mat.color)
          instC_colors_hsl.push(mat.color.getHSL())
          mat.transparent = true
          instC_mdl.children[i].material = mat

          mat = _mat.clone()
          instD_mats.push(mat)
          instD_colors.push(mat.color)
          instD_colors_hsl.push(mat.color.getHSL())
          mat.transparent = true
          instD_mdl.children[i].material = mat
        }
      },
      (d,t) => {
        orthotCTL.ActiveZone.scene.remove(instA_mdl)
        orthotCTL.ActiveZone.scene.remove(instB_mdl)
        orthotCTL.ActiveZone.scene.remove(instC_mdl)
        orthotCTL.ActiveZone.scene.remove(instD_mdl)

        for (let mat of instA_mats) {
          mat.dispose()
        }

        if (params.end) {
          params.end()
        }
      },
      animlen,
      [ {at:animlen*0.1, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.2, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.25, cmd: (d,t) => { setOpacity(0.75, instB_mats, instC_mats,  instD_mats) }},
        {at:animlen*0.3, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.35, cmd: (d,t) => { setOpacity(0.5, instB_mats) }},
        {at:animlen*0.4, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.5, cmd: (d,t) => { adjustColors(t/animlen); setOpacity(0.75, instA_mats); setOpacity(0.5, instC_mats,  instD_mats) }},
        {at:animlen*0.6, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.65, cmd: (d,t) => { setOpacity(0.25, instC_mats); }},
        {at:animlen*0.7, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.75, cmd: (d,t) => { setOpacity(0.4, instA_mats); setOpacity(0.25, instD_mats);  }},
        {at:animlen*0.8, cmd: (d,t) => { adjustColors(t/animlen) }},
        {at:animlen*0.85, cmd: (d,t) => { setOpacity(0.25, instA_mats, instB_mats) }},
        {at:animlen*0.9, cmd: (d,t) => { adjustColors(t/animlen);  }},
      ],
      (d,t) => {
        t /= animlen
        instB_scale.x = 10*t
        instC_scale.y = 10*t
        instD_scale.z = 10*t

        instA_rotation.setFromAxisAngle ( instA_rotaxis, t*T*instA_rotspd )
        instB_rotation.setFromAxisAngle ( instB_rotaxis, t*T*instB_rotspd )
        instC_rotation.setFromAxisAngle ( instC_rotaxis, t*T*instC_rotspd )
        instD_rotation.setFromAxisAngle ( instD_rotaxis, t*T*instD_rotspd )

        instA_TX.update()
        instB_TX.update()
        instC_TX.update()
        instD_TX.update()
      }
    ))
  }
}












