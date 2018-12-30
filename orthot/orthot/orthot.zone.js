orthot.Zone = function(ekvx, override_startloc) {
  this.isZone = true
  let isGeomValid = true
  
  bxtbldr = new libek.gen.BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
  let vxc = new libek.VxScene({
    boxterrain:bxtbldr,
    chunks_per_tick:4
  })

  this.scene = vxc.scene
  
  vxc.default = orthot.Container
  
  let rawdata = {}
  let flipWorld = (ekvx.data_version <= 5)
  
  let walltemplates = {}  
  let targets = {}
  
  // For now, lighting is simplified to global ambient + global directional light + player-held lantern + maybe one light-bearing object
  //  ANd...  just because there otherwise isn't much interesting about lighting, the global directional light rotates very slowly as time passes
	var ambl = new THREE.AmbientLight(0xffffff, 0.075)
	this.scene.add(ambl)	
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
  let ticklen = 200
  
  let player
  let startloc = vxc.get(0,1,0)
  
  let activeObjects = []
  let tmp_activeObjects = [] 
  
  /*  Rules for determining which objects can enter space occupied by other objects
      These rules are assymetric (liquid objects can not enter space occupied by solid objects, but solid objects can enter space occupied by liquid)
      These rules apply to movements of objects under forces and to certain topology considerations.
  */
  let traverseTestTBL = {  
    // no traversal of anything 
    wall:[],
    
    //basic classes
    solid:["liquid", "gas"],
    liquid:["solid"],
    gas:[],
    
    //Ramps are a special case because there is not presently a mechanism for tilted objects resting on top of a ramp and partially occupying an adjacent space    
    ramp:[],    
    
    // interactive objects
    float:["gas"],    // (ice, wood, or any other bouyant solid objects)
    creature:["player", "item", "liquid", "gas", "ramp"],
    player:["creature", "item", "liquid", "gas", "ramp"],
    item:["player", "creature", "liquid", "gas"],
  }
	
  
  // Command sequences that are added at the beginning of a tick, end at the beginning of the next tick, and are measured in seconds (floating point values)
  this.addCommandsequence_short = function(cmdseq) {
    //console.log("add-short-sequence", cmdseq)
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
  
  
  this.onFrame = function() {
    //update geometry
    vxc.buildChunks()
    
    //Move the global directional light a bit
    dlrot += 0.0003
    dlight.position.x = Math.cos(dlrot%T)*2000
    dlight.position.z = Math.sin(dlrot%T)*2000
    
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
    
    let reltime = (t-prevtick) / ticklen  
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
        //console.log("advance-short-sequence", seq)
        seq.advance(d)
      }
    }
    else {
      // Complete all short animations.  "Now" here is immediately before the next tick.
      if (cmdSequences_short.length != 0) {
        for (let seq of cmdSequences_short) {
          //console.log("complete-short-sequence", seq)
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
      
      if (tmp_activeObjects.length > 0) {
        for (let obj of tmp_activeObjects) {
          obj.update()
        }
        tmp_activeObjects = []
      }
      
      for (let i = activeObjects.length; i >= 0; i--) {
        let obj = activeObjects[i]
        if (obj) {
          obj.update()
        }
      } 
      
      if (player) {
        player.recvInput(input)
      }
      //
      if (forces.length > 0) {
        processMovement()
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
    
    r = [x,y,z, ctn]
    
    if (args.length > i) {      
      r = r.concat(args.splice(i))
    }    
    return r
  }
  
  this.activate = function(obj) {
    if (activeObjects.indexOf(this) == -1) {
      activeObjects.push(obj)
    }
  }
  this.deactivate = function(obj) {
    let i = activeObjects.indexOf(obj)
    if (i != -1) {
      activeObjects.splice(i,1)
    }
  }
  this.acivate_temp = function(obj) {
    tmp_activeObjects.push(obj)
  } 
  
  this.inputAvailable = function() {
    if ( (cmdSequences_short.length == 0) && (cmdSequences_long.length == 0)) {
      prevtick = Date.now() - ticklen
    }
  }
  
  this.removeGameobject = function(obj) {
    if (obj.ctn) {
      let i = obj.ctn.content.indexOf(obj)
      if (i != -1) {
        obj.ctn.content.splice(i,1)
      }
    }
    obj.destroy()
  }
  
  this.attach = function(...args) {
    let [x,y,z,ctn, o] = unpack_LOC_ARGS(args)   
    for (let obj of ctn.content) {
      if (obj.attach) {
        obj.attach(o)
        return true
      }
    }
    return false
  }
  this.putGameobject = function(...args) {
    let [x,y,z,ctn, o] = unpack_LOC_ARGS(args)    
    
    if (o.ctn) {
      let i = o.ctn.content.indexOf(o)
      if (i != -1) {
        o.ctn.content.splice(i,1)
      }
      let nctn = this.getAdjacentCTN(o.ctn, libek.direction.code.UP)      
      if (nctn.bump()) {
        while (true) {
          nctn = this.getAdjacentCTN(nctn, libek.direction.code.UP)
          if (nctn.content.length == 0) {
            break
          }
          if (!nctn.bump(true)) {
            break
          }
        }
      }
    }
    o.ctn = ctn   
    
    if (o.obj) {
      o.worldpos.set(x,y,z)
      //o.obj.position.set(x,y,z)
      //if (o.obj.parent != this.scene) {
      //  this.scene.add(o.obj)  
      //}
    }
    
    //ctn.content.push(o)
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
  
  this.getAdjacentCTN = function(ctn, dir) {    
    switch(dir) {
      case libek.direction.code.UP: return vxc.get(ctn.x, ctn.y+1, ctn.z)
      case libek.direction.code.DOWN: return vxc.get(ctn.x, ctn.y-1, ctn.z)
      case libek.direction.code.NORTH: return vxc.get(ctn.x, ctn.y, ctn.z+1)
      case libek.direction.code.EAST: return vxc.get(ctn.x-1, ctn.y, ctn.z)
      case libek.direction.code.SOUTH: return vxc.get(ctn.x, ctn.y, ctn.z-1)
      case libek.direction.code.WEST: return vxc.get(ctn.x+1, ctn.y, ctn.z)
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
          
          nportal = adjCTN.getSideobject_bytype(libek.direction.invert[toHEADING], "portal")
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
        for (let _i = 0; _i < portal.target.length-2; _i++) {
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
      nportal = toCTN.getSideobject_bytype(libek.direction.invert[toHEADING], "portal")
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
    //console.log(obj, fromCTN, adjCTN)
    let outCTN = adjCTN
    let outFORWARD = fromFORWARD
    let outUP = fromUP
    //let outHEADING = libek.direction.getRelDir(fromHEADING, outUP)
    let outHEADING = fromHEADING
    let isPortaljump = false
    
    let invHeading = libek.direction.invert[fromHEADING]
    let portal = adjCTN.getSideobject_bytype(invHeading, "portal")
    if (portal) {
      let dportal = getPortalTarget(portal, fromCTN, fromHEADING, obj)
      if (dportal) {
        isPortaljump = true 
        outHEADING = dportal.up
        outFORWARD = dportal.up
        outUP = dportal.forward
        outCTN = this.getAdjacentCTN(dportal.host.ctn, outHEADING)
      }
    }
    traversable = this.isTraversable(fromCTN, fromHEADING, outCTN, outHEADING, obj)
    return [adjCTN, outCTN, outHEADING, outFORWARD, outUP, isPortaljump, traversable]
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
  
  let forces = []
    
  //Moves listed by originating position
  //{pos, [node]}
  let moves_by_dest = {}
  
  //Moves listed by destination
  //{pos, [node]}
  let moves_by_source = {}
  let recent_insertion
    
  this.addForce = (function(force) {
    //console.log("addforce 1", force)
    recent_insertion = true
    forces.push(force)
    
    force.incoming = []
    force.outgoing = []  
    
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
    
    //console.log("addforce 2")
    
    // Movement insertion during processMovement() [generally dragging and falling] might need to result in re-classification of movement in affected spaces,
    // but this doesn't seem particularly important.  So, for now, any movement inserted during processMovement() is assumed to be non-controversial and will
    // be blindly accepted.
    //
    // if (processMovementActive) { 
    //   classifyNearCollisions(srcID)
    //   classifyFarCollisions(destID)
    // }
    
    // Classify near-collisions (force-originating Object entering a space occupied by a departing Object)
    let tgtList = moves_by_source[destID]
    if (tgtList && tgtList.length > 0) {
      for (let tgtForce of tgtList) {
        //force.outgoing.push(tgtForce)        
        //If the directions match, the source is chasing the target
        if (force.toDIR == tgtForce.fromDIR) {          
          let ocol = {target:tgtForce, type:orthot.Collision.CHASE}
          force.outgoing.push( ocol )
          tgtForce.incoming.push({source:force, collision:ocol})
        }
        
        //If the directions are opposite, the source and target are ramming each other
        else if (force.toDIR == libek.direction.opposite[tgtForce.fromDIR]) {              
          let ocol = {target:tgtForce, type:orthot.Collision.NEAR_RAM}
          force.outgoing.push( ocol )
          tgtForce.incoming.push({source:force, collision:ocol})
        }
        
        //If the directions are neither, the source is striking the target's side
        else {
          //console.log("edge-ram", force.toDIR, tgtForce.fromDIR)
          let ocol = {target:tgtForce, type:orthot.Collision.EDGE_RAM}
          force.outgoing.push( ocol )
          tgtForce.incoming.push({source:force, collision:ocol})
        }
      }
    }
    //console.log("addforce 3")
    
    // Classify far-collisions (Two objects attempting to enter the same space)
    tgtList = moves_by_dest[destID]
    if (tgtList && tgtList.length > 0) {
      for (let otherForce of tgtList) {  
          
        let srcForce = force
        let tgtForce = otherForce
        
        // Two forces separated by one space moving toward that space
        if (force.toDIR == libek.direction.opposite[otherForce.toDIR]) {
          let ocol = {target:otherForce, type:orthot.Collision.FAR_RAM}
          force.outgoing.push( ocol )
          otherForce.incoming.push({source:force, collision:ocol})
          
          ocol = {target:force, type:orthot.Collision.FAR_RAM}
          force.outgoing.push( ocol )
          force.incoming.push({source:otherForce, collision:ocol})
        }
        // Two diagonally adjacent forces headed toward a common adjacent space
        else if (force.toDIR != tgtForce.toDIR) {
          let ocol = {target:otherForce, type:orthot.Collision.CORNER_RAM}
          force.outgoing.push( ocol )
          otherForce.incoming.push( {source:force, collision:ocol})
          
          ocol = {target:force, type:orthot.Collision.CORNER_RAM}
          force.outgoing.push( ocol )
          force.incoming.push({source:otherForce, collision:ocol})
        }
      }
    }
    
    //console.log("addforce 4")
    srclist.push(force)
    dstlist.push(force)
    
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
    //console.log("addforce 5")
  }).bind(this)
  
  let processMovement = function() { 
   
    try {
      let resolved_any = true;
      main:
      while (recent_insertion || resolved_any) {
        resolved_any = false
        recent_insertion = false
        
        pass:
        for (let i = forces.length-1; i >= 0; i--) {
          let force = forces[i]
          if (force.resolved) {
            forces.splice(i, 1)
            continue pass
          }
          let priorityResolve = true
          let simpleResolve = true
          if (!force.deferred) {
            for (let collision of force.outgoing) {
              console.log(collision.type)
              if (!force.OBJ.hasMovementPriority(collision.target.OBJ, collision.target.fromDIR, force.toDIR, collision.type)) {
                priorityResolve = false
              }          
              if (collision.type != orthot.Collision.NONE) {
                simpleResolve = false
              }
            }
          }
          if (priorityResolve || simpleResolve) {
          
            //Attempt to move
            //  The move can succeeed, fail, or get deferred.
            //  success (trit.TRUE) - the force resolved, and the object moved
            //  fail (trit.FALSE)   - the force resolved, but the object stayed put
            //  defer (trit.MAYBE)  - Additional forces have been added (which are to be processed, to be followed with another call to move())
            let moveResult = force.OBJ.move(force)          
            switch(moveResult) {          
              // If the object pushed another object, attempt to resolve inserted forces
              case trit.MAYBE:
                if (force.deferred) {
                  //If the move gets deferred a second time, panic-fail to prevent it from turning into an infinite loop.
                  forces.splice(i, 1)
                  console.log("Movement Engine PANIC:  Force deferred a second time!", force)
                  force.OBJ.strike(force, undefined, orthot.Collision.FAKE)                
                  resolvedAny = true
                  //continue pass
                }
                else {                
                  resolved_any = true
                  force.deferred = true
                }
                continue pass
              break
              case trit.TRUE:
                forces.splice(i, 1)
                resolved_any = true
                
                //If the object moves, simplify Collisions
                for (let collisionRef of force.incoming) {
                  let incCollision = collisionRef.collision
                  let incForce = incCollision.target
                  switch(incCollision.type) {
                    case orthot.Collision.CHASE:
                      incCollision.type = orthot.Collision.NONE                  
                    break
                    
                    // If the object has movement priority, it wins FAR_RAM and CORNER_RAM collisions.
                    case orthot.Collision.FAR_RAM:
                      //incCollision.type = orthot.collision.PRIORITY_RAM       //POWER!!! 
                      force.OBJ.strike(force, incForce.OBJ, orthot.Collision.PRIORITY_RAM)
                      incForce.OBJ.struck(force, force.OBJ, orthot.Collision.PRIORITY_RAM)
                      incForce.resolved = true
                    break 
                    case orthot.Collision.CORNER_RAM:
                      //incCollision.type = orthot.collision.PRIORITY_STEAL     
                      force.OBJ.strike(force, incForce.OBJ, orthot.Collision.PRIORITY_STEAL)
                      incForce.OBJ.struck(force, force.OBJ, orthot.Collision.PRIORITY_STEAL)
                      incForce.resolved = true
                    break
                  }
                }
              break
              case trit.FALSE:
                forces.splice(i, 1)
                resolved_any = true
                
					      //If the move failed for some reason (such as a SIMPLE collision with a very stationary object), 
					      //degenerate all incoming collisions.
                
                for (let collisionRef of force.incoming) {
                  let incCollision = collisionRef.collision
                  let incForce = incCollision.target
                  switch(incCollision.type) {
                    case orthot.Collision.EDGE_RAM:
                    case orthot.Collision.NEAR_RAM:
                    case orthot.Collision.CHASE:
                      incCollision.type = orthot.Collision.SIMPLE
                      //incForce.OBJ.strike(incForce, force.OBJ, orthot.collision.SIMPLE)
                      //force.OBJ.struck(incForce, incForce.OBJ, collision.SIMPLE)
                      //incForce.resolved = true
                    break
                    case orthot.Collision.FAR_RAM:
                    case orthot.Collision.CORNER_RAM:
                      incCollision.type = orthot.Collision.NONE
                    break
                  }
                }
              break
            }
          }
        }
      }
      if (!resolved_any) {
        if (forces.length != 0) {
          //In theory, if there are still forces around, but none can be resolved, then it is because ther forces are all looped (no leaf-nodes to work from)
          //  So, to resolve it, all remaining forces "crash"
          for (let force of forces) {
            if (!force.resolved) {
              for (let collision of force.outgoing) {
                force.OBJ.strike(force, collision.target.OBJ, collision.type, true)
                collision.target.OBJ.struck(force, force.OBJ, collision.type, true)
              }
            }
          }
          forces = []
          
          //  It might be appropriate to check for and allow an unimpeded loop of moving objects with only non-blocking collisions (CHASE and permissively EDGE_RAM)  
          //  and a prime mover as one of the objects (think of this case as a train pushing its own caboose)
        }
        //break main
      }
      
      if (forces.length > 0) {
        console.log("ERROR:  force list not empty at end of processMovement()", forces)
      /* for (let force of forces) {
          console.log("domove: ", force)
          force.OBJ.move(force)
        }
        */
        forces = []
        
      }
    }
    catch (err) {
      console.log("Error processing movement:", err)
      forces = []
    }
    
    //Moves listed by originating position
    //{pos, [node]}
    moves_by_dest = {}
    
    //Moves listed by destination
    //{pos, [node]}
    moves_by_source = {}
  }
  
    
  ekvx.loadConfig( (id, rawtemplate) => {    
    let template = libek.util.properties_fromstring(rawtemplate.data)
    
    if (!template.type) {
      return undefined
    }
        
    switch(template.type) {
      case undefined:
        return undefined
      case 'wall': {
        if (!template.color) {
          template.color = "rgba,1,1,1,1"
        }
  	    if (walltemplates[template.color]) {
  	      return walltemplates[template.color]
  	    }
  	    walltemplates[template.color] = template
  	    
  	    bxtbldr.defineSurface_8bit(id, {
  	      color:template.color, 
  	      uv2info:{type:libek.gen.DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*4)+32 }}
  	    })
  	    bxtbldr.defineSurface_8bit(id+'H', {
  	      color:template.color, 
  	      uv2info:{type:libek.gen.DECAL_UVTYPE.TILE, scale:33, lut:{num_rows:8, num_cols:8, entry:Math.floor(Math.random()*5)}}
  	    })
        bxtbldr.defineTerrain(id, id,id,id,id,id+'H',id+'H')
        
        template.id = id      
  	  }
  	  break
    }
    //switch(rawtemplate.name)
    console.log(template)
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
    let targetted_portals = []
    let portals_byname = {}
    let portals_byclass = {}
    
    let loaded_objects = []
    let ldstage = 1
    ekvx.loadData( (x,y,z, template, data) => {
      //console.log( "ADD", x,y,z, template, data)
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
        data = libek.util.properties_fromstring(data)
      }
      
      let datas = [template, data]
      
      let loc = vxc.get(x,y,z)
      let gobj
      let align, color
      let adjctn
      if (ldstage == 1) {
        switch(template.type) {
          case 'wall':
            vxc.loadTerrain(x,y,z, template.id)
            this.putGameobject(loc, new orthot.Wall(this))
            
          break
          case 'stairs': {
            //console.log("STAIRS", datas) 
            color = libek.util.property("color", datas, "white", libek.util.color.parse)
            align = libek.util.property("align", datas, undefined, orthot.util.parseO2Orientation)
            gobj = new orthot.Stair(this,  color, align)
            adjctn = this.getAdjacentCTN(loc, libek.direction.invert[align.up])
            vxc.setTerrainKnockout(adjctn, align.up)
            adjctn = this.getAdjacentCTN(loc, libek.direction.invert[align.forward])
            vxc.setTerrainKnockout(adjctn, align.forward)
            
          }
          break
          case 'target': {
            //console.log("TARGET", datas)
            let campos = libek.util.property("camPos", datas, undefined, libek.util.parseVec3)
            if (flipWorld) {
              campos.z *= -1
            }
            campos.x = campos.x - x
            campos.y = campos.y - y + 0.5
            campos.z = campos.z - z
            targets[libek.util.property("name", datas)] = { 
              loc:loc, 
              campos:campos
            }
          }
          break
          case 'pblock':
            gobj = new orthot.PushBlock(this)
            //console.log("PBLOC data", datas)
          break
          case 'sceneportal':
            gobj = new orthot.ScenePortal(this)
            gobj.destination = libek.util.property("dest", datas)
            gobj.target = libek.util.property("target", datas)
            //console.log("SCENEPORTAL", datas)
          break
          case 'space_light':
          case 'face_light':
          //  ...  Will have to re-think lighting.  Previous version used unrestricted dynamic lighting, computed it directly and baked it in as VertexColors,
          //        and had lights only affect dynamic objects (for which Unity would base decisions off of proximity between objects and lights)
          //
          //  For now, going with a global directional light
            /*
            let light = new THREE.PointLight(
              libek.util.property( "color", 16, libek.util.color.toBinary, data, template), 
              libek.util.property( "intensity", 1, Number.parseFloat, data, template),
              libek.util.property( "range", 16, Number.parseFloat, data, template)/5,
              1
            )
            light.position.set( x,y,z );
            this.scene.add( light );
            
            console.log(light)
            */
          break
          default:
            return true
          break
          case "start": {          
            //console.log("START", datas)
            
            let campos = libek.util.property("camPos", datas, undefined, libek.util.parseVec3)
            if (flipWorld) {
              campos.z *= -1
            }
            campos.x = campos.x - x
            campos.y = campos.y - y + 0.5
            campos.z = campos.z - z
            targets.__STARTLOC = { 
              loc:loc, 
              campos:campos
            }
          }
          break
        }
      }
      else {
        switch(template.type) {               
          case "paneportal": {
					    let p_class = libek.util.property("class", datas)
					    let p_name = libek.util.property("name", datas)
					    let p_target = libek.util.property("target", datas)
					    
              align = libek.util.property("align", datas, undefined, orthot.util.parseO2Orientation)
              vxc.setTerrainKnockout(loc, align.up)
					    let portal = new orthot.Portal(
                align,
                libek.util.property("color", datas, "white", libek.util.color.parse),
                p_class, p_name, p_target
              )
              //console.log("PORTAL", datas, align, portal)
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
          case "ladder":
            let ldr = new orthot.Ladder(
              libek.util.property("align", datas, undefined, orthot.util.parseO2Orientation),
              libek.util.property("color", datas, "white", libek.util.color.parse)
            )
            this.attach(x,y,z, ldr)
          break
        }
      }
      
      if (gobj) {     
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
      //ld_gobj._ekvxdata_ = datas 
      if (ld_gobj.initGraphics()) {
        //console.log(ld_gobj)
        this.scene.add(ld_gobj.obj)
        if (!ld_gobj.worldpos) {
          ld_gobj.worldpos = ld_gobj.obj.position
        }
        let ctn = ld_gobj.ctn
        ld_gobj.worldpos.set(ctn.x, ctn.y, ctn.z)
      }
      ld_gobj.ready()
    }
    
    let start_target = targets[override_startloc]
    if (!start_target) {
      start_target = targets.__STARTLOC
    }
    startloc = start_target.loc
    sviewCTL.pickplane.constant = start_target.loc.y+0.5
    sviewCTL.camtarget.set(start_target.loc.x,start_target.loc.y+0.5,start_target.loc.z)
    sviewCTL.setCamposFromCartisian(start_target.campos)
    sviewCTL.updateCamera(true)
    
    player = new orthot.Player(this)    
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
    }
    
  }).bind(this)
  loadData()
  
  this.unload = function() {
    this.destroyObjects()
    this.destroyTerrain()
    if (this.scene.children.length > 0) {
      console.log("FOUND THESE:")
      for (let obj of this.scene.children) {
        console.log(obj)
      }
    }
    
  }
  this.destroyObjects = function() {
    vxc.forAll(ctn => {
      for (let gobj of ctn.content) {
        //console.log(gobj)
        gobj.destroy()
      }
    })
  }
  
  this.destroyTerrain = function() {
    vxc.dispose()
  }
  
  this.reset = function() {    
    this.destroyObjects()    
    dlight.position.set(0,1000,0)
    dlTarget.position.set(0,0,0)
    dlrot = Math.random()*T
    this.ticknum = -1
    prevtick = Date.now()
    prevtime = prevtick
    prevreltime = 0
    ticklen = 200
    startloc = vxc.get(0,1,0) 
    player = undefined

    isGeomValid = true
    cmdSequences_short = []
    cmdSequences_long = []
    cmdSequences_realtime = [] 
    tmp_activeObjects = []
    activeObjects = []
    
    vxc.resetData()
    vxc.default = orthot.Container
    loadData()
  }
}