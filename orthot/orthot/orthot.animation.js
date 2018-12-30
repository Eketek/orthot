/* Animation functions and animation controller generators
   This gets a bit crude, but due to a design quirk (insistance upon having regular objects treat movement the same for portals as for everywhere else),
   the animation system needs to be able to duplicate and delete objects, use multiple instances of the same [internal] animation controller, and be able to
   directly manipulate the camera.  
*/



orthot.AnimateBlock = function(zone, blk) {
  let MDL = new libek.Model({default:blk.mdlgen})
  blk.obj = MDL.obj  
    
  let CFG = function(inst) {  
    
    let ctl = inst.ctl
    let mainCMP = ctl.mainCMP = new inst.Component()
    
    let matrix = mainCMP.matrix
    let relpos = new THREE.Vector3()
    
    let scale = new THREE.Vector3(1,1,1)  
    let center = new THREE.Vector3()
    let worldpos = new THREE.Vector3()    
    
    let main_txSHIFT = new libek.Transform(matrix)
        main_txSHIFT.translate(relpos)
        main_txSHIFT.translate(worldpos)
    
    let main_txIMPULSESHIFT = new libek.Transform(matrix)
        main_txIMPULSESHIFT.scale(scale)
        main_txIMPULSESHIFT.translate(relpos)
        main_txIMPULSESHIFT.translate(worldpos)
    
    let main_txIMPACTDOWN = new libek.Transform(matrix)
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
          let orientation = libek.direction.sideorientations[i]   
          //console.log("ORIENT", i, orientation)
          let sideCMP = new inst.Component()
          let txmat = sideCMP.matrix
          for (let sobj of sidegrp) {
            sideCMP.setObject(sobj.type, sobj.mdlgen)
          }                 
          
          let txSIDE_SHIFT = new libek.Transform(txmat)
              txSIDE_SHIFT.orient(orientation)
              txSIDE_SHIFT.translate(relpos)
              txSIDE_SHIFT.translate(worldpos)
          
          let txSIDE_IMPULSESHIFT = new libek.Transform(txmat)
              //txSIDE_IMPULSESHIFT.orient(orientation)
              txSIDE_IMPULSESHIFT.rotate(orientation.rotation)
              txSIDE_IMPULSESHIFT.translate(orientation.position)
              txSIDE_IMPULSESHIFT.scalePosition(scale)
              txSIDE_IMPULSESHIFT.translate(relpos)
              txSIDE_IMPULSESHIFT.translate(worldpos)
              
          let txSIDE_IMPACTDOWN = new libek.Transform(txmat)
              txSIDE_IMPACTDOWN.orient(orientation)
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
            
    let backward = new THREE.Vector3()
    let forward = new THREE.Vector3()
    let up = new THREE.Vector3(0,1,0)
    let down = new THREE.Vector3(0,-1,0)
    
    ctl.up = up
    ctl.down = down
    ctl.backward = backward
    ctl.forward = forward 
    ctl.worldpos = worldpos
    ctl.txMAIN = txSHIFT
    
    let init_still = (d,t)=>{   
      relpos.copy(center)
    }
    let end_still = (d,t)=>{ 
      relpos.copy(center)
      txSHIFT()
    }
    
    let init = (d,t) =>{   
      relpos.copy(backward)
    }
    let end = (d,t)=>{ 
      relpos.copy(center)
      txSHIFT()
    }
    
    /*  Animation component:  "shortmove"
        This sets up a LERP of relpos from a specified start point to a specified end point over a specified time interval */
    let shortmove_startpos = new THREE.Vector3()
    let shortmove_endpos = new THREE.Vector3()
    let shortmove_start, shortmove_len      
    let shortmove = function(d,t) {   
      relpos.lerpVectors(shortmove_startpos, shortmove_endpos, (t-shortmove_start) / shortmove_len)
    }
    
    let vec = new THREE.Vector3()
    let vec2 = new THREE.Vector3()
    let vec3 = new THREE.Vector3()
    
    ctl.ready = function() {
      mainCMP.setObject("box")
      txSHIFT()
    }
    
    ctl.shift = new libek.CommandSequence(
      init, end, 1,
      
      (d,t) => { 
        relpos.lerpVectors(backward, center, t) 
        txSHIFT()
      }
    )
    
    let exg = 0.125
    // Orthot III blocks are ... "high-tech"
    ctl.impulseShift = new libek.CommandSequence(
      init, end, 1, 
      [ {time:0.00, at: d => {
          vec2.set(1,1,1)
          vec3.set(1+exg-Math.abs(forward.x)*exg*2, 1+exg-Math.abs(forward.y)*exg*2, 1+exg-Math.abs(forward.z)*exg*2)
          vec.copy(forward)
          vec.multiplyScalar(exg)
          vec.add(backward)
          relpos.copy(vec)
        }},
        (d,t) => {          
          scale.lerpVectors(vec2, vec3, t*3)    
        },
        {time:0.333, at: d => {  }},
        (d,t) => {          
          scale.lerpVectors(vec2, vec3, 2-(t*3))    
        },
        {time:0.667, at: d => {  }},  
      ],     
      (d,t) => {
        relpos.lerpVectors( vec, center, t)  
        txIMPULSESHIFT()   
      }
    )
    
    ctl.impactDown = new libek.CommandSequence(
      init, end, 1,
      [ {time:0.00, at: d => {  
          vec.set(1,1,1)
          vec2.set(1.25, 0.75, 1.25)
        }},
        (d,t) => {          
          scale.lerpVectors(vec, vec2, t*3)        
          txIMPACTDOWN()
        },
        {time:0.333, at: d => { }},
        (d,t) => {          
          scale.lerpVectors(vec, vec2, 2-(t*3))        
          txIMPACTDOWN()
        },
        {time:0.667, at: d => { }},
        (d,t) => {          
          scale.set(1,1,1)        
          txIMPACTDOWN()
        }
      ]
    )
  }  
  
  let mainINST = new MDL.Instance("main", CFG)  
  let main_pos = blk.worldpos = new THREE.Vector3()
  
  blk.ready = function() {
    mainINST.ctl.worldpos.copy(blk.worldpos)
    mainINST.ctl.ready()
  }
  
  blk.animCTL = {
    //orientation:mainINST.ctl.orientation,    
    
    destroy:function() {
      MDL.destroy()
    },
    shift:function(force) {
      mainINST.ctl.worldpos.copy(blk.worldpos)
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
      mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
      zone.addCommandsequence_short(mainINST.ctl.shift)
    },
    
    impulseShift:function(force) {
      mainINST.ctl.worldpos.copy(blk.worldpos)
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
      mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
      zone.addCommandsequence_short(mainINST.ctl.impulseShift)
    },
    
    impactDown:function() { 
      mainINST.ctl.worldpos.copy(blk.worldpos)
      zone.addCommandsequence_short(mainINST.ctl.impactDown)
    },
  }
}

orthot.AnimateCreature = function(zone, cr, nmap, _orient, trackcam=false) {
  let MDL = new libek.Model({nmap:nmap})
  cr.obj = MDL.obj  
  
  let main_pos = cr.worldpos = new THREE.Vector3()
  
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
    let backward = ctl.backward = new THREE.Vector3()
    let forward = ctl.forward = new THREE.Vector3()
    let up = ctl.up = new THREE.Vector3(0,1,0)
    let down = ctl.down = new THREE.Vector3(0,-1,0)
    let left = ctl.left = new THREE.Vector3()
    let right = ctl.right = new THREE.Vector3()
    let orientation = ctl.orientation = {}
        
    //start point positioning vectors
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
    
    libek.direction.setOrientation(orientation,  "south", "up")
    
    // Posing functions.
    // These are libek.Transform (parameterized transformations) which pose the animated object
    // On each frame, the active Animation controller adjusts any number of Transform parameters and updates the transform, causing it
    // to re-calculate the THREE.Matrix4 for the displayed object.
    let txMAIN = new libek.Transform(mainCMP.matrix)
    txMAIN.scale(scale)
    txMAIN.orient(orientation)
    txMAIN.translate(relpos)
    txMAIN.translate(worldpos)
    
    let rot = new THREE.Quaternion()
    
    let txMAIN_QROT = new libek.Transform(mainCMP.matrix)
    txMAIN_QROT.scale(scale)
    txMAIN_QROT.orient(orientation)
    txMAIN_QROT.rotate(rot)
    txMAIN_QROT.translate(relpos)
    txMAIN_QROT.translate(worldpos)
    
    let __trackcam = tmp_trackcam
        
    //  Animation INITIALIZERS and FINALIZERS
    //  These are used to enforce expected poses and set up animation temp variables
    //  In theory, these could be mostly omitted (replaced with just a generic function which resets only the the main offset "relpos") 
    //  BUT, that is a lot of animations to be cautious about, and these are needed anyway since the animation system "starts over" 
    //  every time an object passes through a portal (technically, this animation system was designed to allow individual animations to duplicate
    //  objects and animate through, but that easily doubles the amount of animations, so an intermediary controller was set up that abstracts the
    //  portals away by also duplicating the animation controllers).
    let init = (d,t) =>{   
      relpos.copy(backward)
      main_startpos.copy(backward)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    
    let init_still = (d,t)=>{   
      relpos.copy(center)
      main_startpos.copy(center)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let end_still = (d,t)=>{ 
      relpos.copy(center)
      txMAIN.update()
      if (__trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
    }
    let init_ladder_exit = (d,t) => {  
      ladder_offset_end.lerpVectors(center, backward, 0.75)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(down)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }    
    let init_ladder = (d,t) => {  
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(down)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let init_ladder_high = (d,t) => {  
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.copy(ladder_offset_end)
      ladder_offset_start.add(up)
      relpos.copy(ladder_offset_start)
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let init_ladder_still = (d,t) => {
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      //ladder_offset_start.addVectors(ladder_offset_end, down)
      relpos.copy(ladder_offset_end)
      main_startpos.copy(ladder_offset_end)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let init_flat_to_ladder = (d,t) => { 
      relpos.copy(center)
      ladder_offset_end.lerpVectors(center, forward, 0.25)
      ladder_offset_start.addVectors(ladder_offset_end, down)
      main_startpos.copy(center)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let end_ladder = (d,t)=>{ 
      relpos.copy(ladder_offset_end)
      txMAIN.update()
      
      if (__trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.camtarget.add(relpos)
        sviewCTL.updateCamera()
      }
    }
    
    let init_still_up = (d,t)=>{   
      relpos.set(0, 0.5, 0)
      main_startpos.set(0, 0.5, 0)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let end_still_up = (d,t)=>{ 
      relpos.set(0, 0.5, 0)
      txMAIN.update()
      if (__trackcam) {
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
    }
    
    let init_up = (d,t) =>{    
      relpos.copy(backward)
      relpos.y += 0.5
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    
    let init_uphigh = (d,t) =>{   
      relpos.copy(backward)
      relpos.y += 1
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    let init_uphigher = (d,t) =>{   
      relpos.copy(backward)
      relpos.y += 1.5
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    
    let init_down = (d,t) =>{   
      relpos.copy(backward)
      relpos.y -= 0.5
      main_startpos.copy(relpos)
      if (__trackcam) {
        tmp_camvec_main.copy(sviewCTL.camtarget)
      }
    }
    
    let end = (d,t)=>{ 
      relpos.copy(center)
      txMAIN.update()
      
      if (__trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.updateCamera()
      }
    }   
    
    let end_up = (d,t)=> { 
      relpos.set(0, 0.5, 0)
      txMAIN.update()
      
      if (__trackcam) {
        tmp_camvec_main.sub(main_startpos)
        sviewCTL.camtarget.copy(tmp_camvec_main)
        sviewCTL.camtarget.add(relpos)
        sviewCTL.updateCamera()
      }
    }
    
    /*  Animation component:  "longmove"
        This sets up a LERP of relpos from the rearward position to the center position over the duration of the animation */
    let longmove = (d,t)=>{ 
      relpos.lerpVectors(backward, center, t)
      txMAIN.update()      
    } 
    
    /*  Animation component:  "shortmove"
        This sets up a LERP of relpos from a specified start point to a specified end point over a specified time interval */
    let shortmove_startpos = new THREE.Vector3()
    let shortmove_endpos = new THREE.Vector3()
    let shortmove_start, shortmove_len      
    let shortmove = function(d,t) {   
      relpos.lerpVectors(shortmove_startpos, shortmove_endpos, (t-shortmove_start) / shortmove_len)
      txMAIN.update()      
    }
    
    // camera tracking logic
    let begin_trackCam, end_trackCam    
    if (tmp_trackcam) {
      begin_trackCam = function() {
        tmp_camvec.copy(relpos)
      } 
      end_trackCam = function() {
        tmp_camvec.sub(relpos)    
        sviewCTL.camtarget.sub(tmp_camvec)
        sviewCTL.updateCamera()
      } 
    }
    
    
    let show, hide
    if (transient) {
      show = mainCMP.show
      hide = mainCMP.hide
    }
    console.log(begin_trackCam, end_trackCam, show, hide)
    
    // Callback used to instantiate andpose the displayed object (must be called before any animations are triggered)
    inst.ctl.ready = function() {
      //console.log("READY")
      mainCMP.setObject("creature", "stand")
      txMAIN.update()
    }
    
    // Procedural Animation controllers.  Each manages one animated action.
    // REMINDER:  THREE.AnimationMixer may be used directly by these controllers to implement an animation.
    //            (libek.CommandSequence passes time-delta as the first parameter)
        
    ctl.fallAnim = new libek.CommandSequence(
      init, end, 1,
      begin_trackCam, show,
      longmove,
      end_trackCam, hide
    )
    ctl.halfdownfallAnim = new libek.CommandSequence(
      init, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {     
          shortmove_startpos.copy(up)
          shortmove_endpos.set(0, 0.5, 0)   
          shortmove_len = 0.5
          shortmove_start = 0
        }},
        shortmove,
        {time:0.10, at: d => { mainCMP.setObject("creature", "stand"); scale.x = 1; scale.y = 1; }},
        shortmove,
        {time:0.50, at: d => {}}
      ],
      end_trackCam
    )
    
    ctl.walk_flatflat_anim = new libek.CommandSequence(
      init, end, 1,
      begin_trackCam, show,
      [ {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      longmove,
      hide,
      end_trackCam
    )
    
    ctl.walk_urampuramp_anim = new libek.CommandSequence(
      init_up, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {     
          shortmove_startpos.copy(backward)
          shortmove_endpos.copy(center)        
          shortmove_startpos.y = 0.5
          shortmove_endpos.y = 0.5
          shortmove_len = 1
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampupdown_anim = new libek.CommandSequence(
      init_up, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {     
          shortmove_startpos.copy(backward)
          shortmove_endpos.lerpVectors(backward, center, 0.5)    
          shortmove_startpos.y = 0.5
          shortmove_endpos.y = 1
          shortmove_len = 0.5
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1;
          shortmove_startpos.copy(shortmove_endpos)
          shortmove_endpos.copy( center)
          shortmove_endpos.y = 0.5
          shortmove_len = 0.5
          shortmove_start = 0.5
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampdownup_anim = new libek.CommandSequence(
      init_up, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {     
          shortmove_startpos.copy(backward)
          shortmove_endpos.lerpVectors(backward, center, 0.5)    
          shortmove_startpos.y = 0.5
          shortmove_len = 0.5
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1;
          shortmove_startpos.copy(shortmove_endpos)
          shortmove_endpos.copy( center)
          shortmove_endpos.y = 0.5
          shortmove_len = 0.5
          shortmove_start = 0.5
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_flathop_anim = new libek.CommandSequence(
      init, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {       
          mainCMP.setObject("creature", "leap")      
          shortmove_startpos.copy(backward)
          shortmove_endpos.lerpVectors(backward, center, 0.33)
          shortmove_endpos.y = 0.25
          shortmove_len = 0.33
          shortmove_start = 0
        }},
        {time:0.33, at: d => {  
          shortmove_startpos.copy(shortmove_endpos)
          shortmove_endpos.lerpVectors(backward, center, 0.67)
          shortmove_endpos.y = 0.25
          shortmove_len = 0.34
          shortmove_start = 0.33
        }},
        {time:0.67, at: d => { 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.copy(center)
          shortmove_len = 0.33
          shortmove_start = 0.67
        }},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_urampup_anim = new libek.CommandSequence(
      init_up, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {       
          mainCMP.setObject("creature", "leap")    
          shortmove_startpos.copy(backward)
          shortmove_startpos.y = 0.5
          shortmove_endpos.lerpVectors(backward, center, 0.33)
          shortmove_endpos.y = 0.75
          shortmove_len = 0.33
          shortmove_start = 0
        }},
        {time:0.33, at: d => {  
          shortmove_startpos.copy(shortmove_endpos)
          shortmove_endpos.lerpVectors(backward, center, 0.67)
          shortmove_endpos.y = 0.75
          shortmove_len = 0.34
          shortmove_start = 0.33
        }},
        {time:0.67, at: d => { 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 0.33
          shortmove_start = 0.67
        }},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_urampgap_anim = new libek.CommandSequence(
      init_up, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {       
          mainCMP.setObject("creature", "leap");      
          shortmove_startpos.copy(backward)
          shortmove_startpos.y = 0.5
          shortmove_endpos.lerpVectors(backward, center, 0.33)
          shortmove_endpos.y = 0.75
          shortmove_len = 0.33
          shortmove_start = 0
        }},
        {time:0.33, at: d => {  
          shortmove_startpos.copy(shortmove_endpos)
          shortmove_endpos.lerpVectors(backward, center, 0.67)
          shortmove_endpos.y = 0.50
          shortmove_len = 0.34
          shortmove_start = 0.33
        }},
        {time:0.67, at: d => { 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.copy(center)
          shortmove_len = 0.33
          shortmove_start = 0.67
        }},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_flatup_anim = new libek.CommandSequence(
      init, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {              
          shortmove_startpos.copy(backward)
          shortmove_endpos.lerpVectors(shortmove_startpos, center, 0.5)
          shortmove_len = 0.50
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand");
          scale.y = 1 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 0.50
          shortmove_start = 0.50
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_flatdown_anim = new libek.CommandSequence(
      init_uphigh, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {              
          shortmove_startpos.copy(backward)
          shortmove_startpos.y += 1
          shortmove_endpos.lerpVectors(shortmove_startpos, up, 0.5)
          shortmove_len = 0.50
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk");scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand")
          scale.y = 1 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 0.50
          shortmove_start = 0.50
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampdownflat_anim = new libek.CommandSequence(
      init_up, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {              
          shortmove_startpos.copy(backward)
          shortmove_startpos.y += 0.5
          shortmove_endpos.lerpVectors(backward, center, 0.5)
          shortmove_len = 0.50
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand")
          scale.y = 1 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.copy(center)
          shortmove_len = 0.50
          shortmove_start = 0.50
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampupflat_anim = new libek.CommandSequence(
      init_down, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {              
          shortmove_startpos.copy(backward)
          shortmove_startpos.y -= 0.5
          shortmove_endpos.lerpVectors(backward, center, 0.5)
          shortmove_len = 0.50
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand")
          scale.y = 1 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.copy(center)
          shortmove_len = 0.50
          shortmove_start = 0.50
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    ctl.walk_rampuphop_anim = new libek.CommandSequence(
      init_down, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {                
          shortmove_startpos.copy(backward)
          shortmove_startpos.y -= 0.5
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_endpos.lerpVectors(shortmove_startpos, shortmove_endpos, 0.5)
          shortmove_endpos.y = 1
          shortmove_len = 0.50
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "leap")
          scale.y = 1 
          shortmove_startpos.copy(shortmove_endpos)    
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 0.50
          shortmove_start = 0.50
        }},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampupup_anim = new libek.CommandSequence(
      init_down, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {                 
          shortmove_startpos.copy(backward)
          shortmove_startpos.y -= 0.5   
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 1
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand")
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.walk_rampdowndown_anim = new libek.CommandSequence(
      init_uphigher, end_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {              
          shortmove_startpos.copy(backward) 
          shortmove_startpos.y += 1.5
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 1
          shortmove_start = 0
        }},
        {time:0.10, at: d => { mainCMP.setObject("creature", "walk"); scale.x = 1; scale.y = 0.97; }},
        {time:0.50, at: d => { 
          mainCMP.setObject("creature", "stand")
        }},
        {time:0.60, at: d => { mainCMP.setObject("creature", "walk"); scale.x = -1; scale.y = 0.97;}},
        {time:1.00, at: d => { mainCMP.setObject("creature", "stand"); scale.y = 1; }},
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.pushstandAnim = new libek.CommandSequence(
      init_still, end_still, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          mainCMP.setObject("creature", "walk"); 
          scale.x = 1; scale.y = 0.97; 
          shortmove_startpos.copy(center); 
          shortmove_endpos.lerpVectors(center, forward, 0.2)
          shortmove_len = 0.25
          shortmove_start = 0
        }},
        shortmove,
        {time:0.25, at: d => { mainCMP.setObject("creature", "pushwalk"); relpos.copy(shortmove_endpos); }},
        {time:0.75, at: d => { 
          mainCMP.setObject("creature", "walk"); 
          scale.x = -1; 
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.copy(center)
          shortmove_len = 0.25
          shortmove_start = 0.75
        }},
        shortmove,
        {time:1.00, at: d => { 
          mainCMP.setObject("creature", "stand"); 
          scale.y = 1; 
          relpos.copy(center)
        }},
      ],
      end_trackCam, hide
    )
    ctl.halfuppushstandAnim = new libek.CommandSequence(
      init_still_up, end_still_up, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          mainCMP.setObject("creature", "walk") 
          scale.x = 1; scale.y = 0.97; 
          shortmove_startpos.set(0, 0.5, 0); 
          shortmove_endpos.copy(forward)
          shortmove_endpos.y += 0.5          
          shortmove_endpos.lerpVectors(shortmove_startpos, shortmove_endpos, 0.2)
          shortmove_len = 0.25
          shortmove_start = 0
        }},
        shortmove,
        {time:0.25, at: d => { mainCMP.setObject("creature", "pushwalk"); relpos.copy(shortmove_endpos); }},
        {time:0.75, at: d => { 
          mainCMP.setObject("creature", "walk")
          scale.x = -1; 
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.set(0, 0.5, 0)
          shortmove_len = 0.25
          shortmove_start = 0.75
        }},
        shortmove,
        {time:1.00, at: d => { 
          mainCMP.setObject("creature", "stand") 
          scale.y = 1; 
          relpos.set(0, 0.5, 0)
        }},
      ],
      end_trackCam, hide
    )
    
    // ladder_offset_start
    // ladder_offset_end
    
    ctl.grabladder_flat = new libek.CommandSequence(
      init_flat_to_ladder, end_ladder, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          mainCMP.setObject("creature", "walk"); 
          scale.y = 0.97; 
          shortmove_startpos.copy(center); 
          shortmove_endpos.copy(ladder_offset_end)
          shortmove_len = 0.25
          shortmove_start = 0
        }},
        shortmove,
        {time:0.25, at: d => { mainCMP.setObject("creature", "push"); scale.y = 1; }},
      ],
      end_trackCam, hide
    )
    
    ctl.hopoffladder = new libek.CommandSequence(
      init_ladder_still, end_still, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          shortmove_startpos.copy(ladder_offset_end); 
          shortmove_endpos.lerpVectors(ladder_offset_end, center, 1/3)
          shortmove_endpos.y = 0.3
          shortmove_len = 1/6
          shortmove_start = 0
        }},
        shortmove,
        {time:1/6, at: d => { 
          mainCMP.setObject("creature", "stand");
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.lerpVectors(ladder_offset_end, center, 2/3)
          shortmove_endpos.y = 0.4
          shortmove_len = 1/6
          shortmove_start = 1/6
        }},
        shortmove,
        {time:2/6, at: d => {
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.copy(center)
          shortmove_endpos.y = 0.3
          shortmove_len = 1/6
          shortmove_start = 2/6
        }},
        shortmove,
        {time:0.5, at: d => {
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.copy(center)
          shortmove_len = 0.5
          shortmove_start = 0.5
        }},
        shortmove
      ],
      //txMAIN.update,
      end_trackCam, hide
    )
    
    ctl.exitladder = new libek.CommandSequence(
      init_ladder_exit, end, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          shortmove_startpos.copy(ladder_offset_start); 
          shortmove_endpos.copy(ladder_offset_end)
          shortmove_len = 3/6
          shortmove_start = 0
        }},
        
        shortmove,
        {time:1/6, at: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        shortmove,
        {time:1/3, at: d => {
          mainCMP.setObject("creature", "pushleap");
          right.crossVectors(forward, up)
        }},
        (d,t) => {
          rot.setFromAxisAngle(right, (t-1/3)*6*T*0.25)
          relpos.lerpVectors(shortmove_startpos, shortmove_endpos, (t-shortmove_start) / shortmove_len)
          txMAIN_QROT.update()
        },
        {time:3/6, at: d => {
          mainCMP.setObject("creature", "leap");
          shortmove_startpos.copy(ladder_offset_end); 
          shortmove_endpos.lerpVectors(ladder_offset_end, center, 1/3)
          shortmove_endpos.y += 0.3
          shortmove_len = 1/6
          shortmove_start = 3/6
        }},
        shortmove,
        {time:4/6, at: d => {
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.lerpVectors(ladder_offset_end, center, 2/3)
          shortmove_endpos.y += 0.2
          shortmove_len = 1/6
          shortmove_start = 4/6
        }},
        shortmove,
        {time:5/6, at: d => {
          mainCMP.setObject("creature", "stand");
          shortmove_startpos.copy(shortmove_endpos); 
          shortmove_endpos.copy(center)
          shortmove_len = 1/6
          shortmove_start = 5/6
        }},
        shortmove,
      ],
      end_trackCam, hide
    )
    
    ctl.climbupladder = new libek.CommandSequence(
      init_ladder, end_ladder, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          shortmove_startpos.copy(ladder_offset_start); 
          shortmove_endpos.copy(ladder_offset_end)
          shortmove_len = 1
          shortmove_start = 0
        }},
        {time:0.125, at: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        {time:0.375, at: d => {
          mainCMP.setObject("creature", "stand");
        }},
        {time:0.625, at: d => {
          mainCMP.setObject("creature", "pushwalk");
          scale.x = -1
        }},
        {time:0.875, at: d => {
          mainCMP.setObject("creature", "stand");
          scale.x = 1
        }},        
      ],
      shortmove,
      end_trackCam, hide
    )
    
    ctl.climbdownladder = new libek.CommandSequence(
      init_ladder_high, end_ladder, 1,
      begin_trackCam, show,
      [ {time:0.00, at: d => {
          shortmove_startpos.copy(ladder_offset_start); 
          shortmove_endpos.copy(ladder_offset_end)
          shortmove_len = 1
          shortmove_start = 0
        }},
        {time:0.125, at: d => {
          mainCMP.setObject("creature", "pushwalk");
        }},
        {time:0.375, at: d => {
          mainCMP.setObject("creature", "stand");
        }},
        {time:0.625, at: d => {
          mainCMP.setObject("creature", "pushwalk");
          scale.x = -1
        }},
        {time:0.875, at: d => {
          mainCMP.setObject("creature", "stand");
          scale.x = 1
        }},        
      ],
      shortmove,
      end_trackCam, hide
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
  
  //The high-level animation controller.
  //In general, these select an animation, then configure the animation, then trigger it.
  //If a portal is involved, these will also enable dummy objects for each portal crossed and configure and trigger animations for the dummy objects
  cr.animCTL = {
    orientation:mainINST.ctl.orientation,
    setNMAP:function(nmap) {
      MDL.nmap = nmap
    },
    destroy:function() {
      MDL.destroy()
    },
    fall:function(force) {            
      libek.direction.setOrientation(mainINST.ctl.orientation, force.toFORWARD, force.toUP)  
      mainINST.ctl.worldpos.set(force.toCTN.x, force.toCTN.y, force.toCTN.z)  
      mainINST.ctl.up.copy(libek.direction.vector[force.toUP])    
      mainINST.ctl.down.copy(libek.direction.vector[libek.direction.invert[force.toUP]])
      mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
      if (force.toCTN.getObject_bytype("ramp")) { 
        zone.addCommandsequence_short(mainINST.ctl.halfdownfallAnim)
      }
      else {
        zone.addCommandsequence_short(mainINST.ctl.fallAnim)
      }
    },
    defeat:function() {
      orthot.VanishAnim(zone, mainINST.ctl.mainCMP.getObject("creature"), {scale:mainINST.ctl.scale, orientation:mainINST.ctl.orientation, pos:mainINST.ctl.worldpos})
    },
      
    pushfixedobjectAnim:function(force) {            
      libek.direction.setOrientation(mainINST.ctl.orientation, force.toHEADING, force.toUP)
      //mainINST.ctl.backward.copy(force.inputDIR.inv)    
      //mainINST.ctl.forward.copy(force.inputDIR.vector)
      mainINST.ctl.up.copy(libek.direction.vector[force.toUP])    
      mainINST.ctl.down.copy(libek.direction.vector[libek.direction.invert[force.toUP]])
      mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
      
      if (force.fromCTN.getObject_bytype("ramp")) { 
        zone.addCommandsequence_short(mainINST.ctl.halfuppushstandAnim)
      }    
      else {
        zone.addCommandsequence_short(mainINST.ctl.pushstandAnim)
           //   this.animCTL.pushstandAnim(force)
      }
    },
    
    walk:function(force) {  
      //console.log("WALK", mainINST, force)
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
        else {  // flat ground   
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
        else {  // flat ground
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
        else if (force.toGAP) { //flat ground
          animName = "urampgap"    
        }      
      }
      else {  //flat ground
        if (force.toUPRAMP) {
          animName = "flatup"
        }
        else if (force.toDOWNRAMP) {
          animName = "flatdown"
        
        }
        else if (force.hopOUT) {
          animName = "flathop"      
        }
        else {  //flat ground
          animName = "flatflat"      
        }
      }
      if (animName) {
        animName = "walk_" + animName
        if (force.isPUSH) {
          animName = "push" + animName
        }
        animName += "_anim"
        
        if (mainINST.ctl[animName]) {
          //console.log(animName, force)
          //this.startAnimation(this.animCTL[animName])
          //console.log(main)
          libek.direction.setOrientation(mainINST.ctl.orientation, force.toHEADING, force.toUP)
          mainINST.ctl.worldpos.set(force.toCTN.x, force.toCTN.y, force.toCTN.z)      
          mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
          mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
          if (force.isPortaljump) {
            if (trackcam) {
              inputCTL.EventManager.dispatch_libek_event("quickrefocus")
            }
            //console.log("maybe-animate-portaljump?", force)
            
            let hop = force.path[0]
            libek.direction.setOrientation(minorINST1.ctl.orientation, hop.fromHEADING, hop.toUP)
            minorINST1.ctl.worldpos.set(hop.adjCTN.x, hop.adjCTN.y, hop.adjCTN.z)      
            minorINST1.ctl.forward.copy(libek.direction.vector[hop.fromHEADING])    
            minorINST1.ctl.backward.copy(libek.direction.vector[libek.direction.invert[hop.fromHEADING]])
            
            zone.addCommandsequence_short(minorINST1.ctl[animName])
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
          else {
            zone.addCommandsequence_short(mainINST.ctl[animName])
          }
        }
      }
    },
    grabLadder:function(force) {
      let animName = "grabladder_flat"
      if (mainINST.ctl[animName]) {
        libek.direction.setOrientation(mainINST.ctl.orientation, force.fromHEADING, force.toUP) 
        mainINST.ctl.forward.copy(libek.direction.vector[force.toHEADING])    
        mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toHEADING]])
        zone.addCommandsequence_short(mainINST.ctl[animName])
      }
    },
    hopoffLadder:function(forward, up) {
      console.log(forward, up)
      libek.direction.setOrientation(mainINST.ctl.orientation, forward, up) 
      mainINST.ctl.forward.copy(libek.direction.vector[forward])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[forward]])
      zone.addCommandsequence_short(mainINST.ctl.hopoffladder)
    },
    exitLadder:function(force) {
      libek.direction.setOrientation(mainINST.ctl.orientation, force.toFORWARD, force.toUP)  
      mainINST.ctl.worldpos.set(force.toCTN.x, force.toCTN.y, force.toCTN.z)      
      mainINST.ctl.forward.copy(libek.direction.vector[force.toFORWARD])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toFORWARD]])
      zone.addCommandsequence_short(mainINST.ctl.exitladder)
    },
    climbupLadder:function(force) {
      libek.direction.setOrientation(mainINST.ctl.orientation, force.toFORWARD, force.toUP)  
      mainINST.ctl.worldpos.set(force.toCTN.x, force.toCTN.y, force.toCTN.z)      
      mainINST.ctl.forward.copy(libek.direction.vector[force.toFORWARD])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toFORWARD]])
      zone.addCommandsequence_short(mainINST.ctl.climbupladder)
    },
    climbdownLadder:function(force) {
      libek.direction.setOrientation(mainINST.ctl.orientation, force.toFORWARD, force.toUP)  
      mainINST.ctl.worldpos.set(force.toCTN.x, force.toCTN.y, force.toCTN.z)      
      mainINST.ctl.forward.copy(libek.direction.vector[force.toFORWARD])    
      mainINST.ctl.backward.copy(libek.direction.vector[libek.direction.invert[force.toFORWARD]])
      zone.addCommandsequence_short(mainINST.ctl.climbdownladder)
    },
  }
}


orthot.VanishAnim = function(zone, obj, params = {}) {
  if (obj.isOrthotObject) {
    obj = obj.obj
  }
  let parent = obj.parent
  let chldrn = libek.getChildrenRecursive(obj)
  for (let ii = 0; ii < chldrn.length; ii++) {
    let mdl = chldrn[ii]
    let worldpos = params.pos
    let scale = params.scale ? params.scale : new THREE.Vector3(1,1,1)
    let orientation = params.orientation
    if (!orientation) {
      orientation = {}
      libek.direction.setOrientation(orientation,  "south", "up")
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
    zone.addCommandsequence_realtime(new libek.CommandSequence(
      (d,t) => {   
        
        let basematrix = mdl.matrixWorld.clone()
        basematrix.elements[12] -= worldpos.x
        basematrix.elements[13] -= worldpos.y
        basematrix.elements[14] -= worldpos.z
            
        if (mdl.parent) {
          libek.releaseAsset(mdl)
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
        
        instA_TX = new libek.Transform(instA_matrix, basematrix)
        instA_TX.scale(scale)
        instA_TX.scale(instA_scale)
        instA_TX.orient(orientation)
        instA_TX.rotate(instA_rotation)
        instA_TX.translate(worldpos)
        instA_mdl.matrix = instA_matrix
        orthot.ActiveZone.scene.add(instA_mdl)
        
        
        instB_TX = new libek.Transform(instB_matrix, basematrix)
        instB_TX.scale(scale)
        instB_TX.scale(instB_scale)
        instB_TX.orient(orientation)
        instB_TX.rotate(instB_rotation)
        instB_TX.translate(worldpos)
        instB_mdl.matrix = instB_matrix
        orthot.ActiveZone.scene.add(instB_mdl)
        
        
        instC_TX = new libek.Transform(instC_matrix, basematrix)
        instC_TX.scale(scale)
        instC_TX.scale(instC_scale)
        instC_TX.orient(orientation)
        instC_TX.rotate(instC_rotation)
        instC_TX.translate(worldpos)
        instC_mdl.matrix = instC_matrix
        orthot.ActiveZone.scene.add(instC_mdl)
        
        instD_TX = new libek.Transform(instD_matrix, basematrix)
        instD_TX.scale(scale)
        instD_TX.scale(instD_scale)
        instD_TX.orient(orientation)
        instD_TX.rotate(instD_rotation)
        instD_TX.translate(worldpos)
        instD_mdl.matrix = instD_matrix
        orthot.ActiveZone.scene.add(instD_mdl)
        
        for (let i = 0; i < mdl.children.length; i++) {
          let child = mdl.children[i]
          console.log(child)
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
        orthot.ActiveZone.scene.remove(instA_mdl)
        orthot.ActiveZone.scene.remove(instB_mdl)
        orthot.ActiveZone.scene.remove(instC_mdl)
        orthot.ActiveZone.scene.remove(instD_mdl)
        
        for (let mat of instA_mats) {
          mat.dispose()
        }
        
        if (params.end) {
          params.end()
        }
      },
      animlen,
      [ {time:animlen*0.1, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.2, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.25, at: (d,t) => { setOpacity(0.75, instB_mats, instC_mats,  instD_mats) }},
        {time:animlen*0.3, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.35, at: (d,t) => { setOpacity(0.5, instB_mats) }},
        {time:animlen*0.4, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.5, at: (d,t) => { adjustColors(t/animlen); setOpacity(0.75, instA_mats); setOpacity(0.5, instC_mats,  instD_mats) }},
        {time:animlen*0.6, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.65, at: (d,t) => { setOpacity(0.25, instC_mats); }},
        {time:animlen*0.7, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.75, at: (d,t) => { setOpacity(0.4, instA_mats); setOpacity(0.25, instD_mats);  }},
        {time:animlen*0.8, at: (d,t) => { adjustColors(t/animlen) }},
        {time:animlen*0.85, at: (d,t) => { setOpacity(0.25, instA_mats, instB_mats) }},
        {time:animlen*0.9, at: (d,t) => { adjustColors(t/animlen);  }},
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












