export { plotLine, debugLine }
import { direction, toForward } from './direction.js'

// A 3-dimensional line plotter.
//
// This is a raycasting function that provides pretty much everything one might want to know about in a cubic-voxel-type world in which non-volumetric objects
//  can be positioned and oriented in relation to the sides of volumetric objects
//
// This plots a line from a start position to an end position.
// The plotted line will be contiguous in all dimnensions
//   (each pair of adjacent positions will differ from each other only in one dimension, even if an "intercepted" position is an edge or a corner)
// At every point along the line, the "plot()" callback is called.
// In each invocation of plot(), these values are passed:
//    the integer coordinate of the plotted position is passed,
//    the local intercept position 
//      (real numbers, [-0.5 </<= val </<= 0.5], all dimnesions, inclusivity or exclusivity is somewhat arbitrary - edge values are indicative of ambiguity)
//    The normal vector of the intercepted face [of a unit-cube] at that position
//    Closes orthogonal forward vector of the point of intersection (vector pointing from the center of the face to the point of intersection)
// The computations involved are a simplified equivalent to raycasting against a set of collider cubes [arranged in a 3d matrix] in a physics engine
var plotLine = function(start, end, plot) {
    
  // convert vector format to absolute-value and sign
  //  The plotter operates in a simplified domain - uses a positive slope in all dimensions
  let diffx = end.x - start.x
  let diffy = end.y - start.y
  let diffz = end.z - start.z
  let signx = Math.sign(diffx)
  let signy = Math.sign(diffy)
  let signz = Math.sign(diffz)
  diffx = Math.abs(diffx)
  diffy = Math.abs(diffy)
  diffz = Math.abs(diffz)
  
  // prepare position and accumulator fields
  let posx = 0
  let posy = 0
  let posz = 0
  let accx = start.x%1
  let accy = start.y%1
  let accz = start.z%1
  
  // force the accumulator into range [0:1]
  if (accx < 0) {
    accx+=1
  }
  if (accy < 0) {
    accy+=1
  }
  if (accz < 0) {
    accz+=1
  }
  
  // truncate the start coordinates [to be re-combined with the accumulator values for the output plots]
  let ofsx = start.x-accx
  let ofsy = start.y-accy
  let ofsz = start.z-accz
  
  //Additionally, if any negative in any dimension, flip the corresponding accumulator to the other side
  //  (product of successful shotgun debugging: after adding this adjustment, the plotted path aligned with the requested path in all cases)
  if (signx == -1) {
    accx = 1-accx
  }
  if (signy == -1) {
    accy = 1-accy
  }
  if (signz == -1) {
    accz = 1-accz
  }
  
  // output "up" vectors (normals of front-faces intersected by the line)
  //  (these are the inverses of [orthogonal] directions the line is pointing toward)
  let dirx = signx > 0 ? direction.code.EAST : direction.code.WEST
  let diry = signy > 0 ? direction.code.DOWN : direction.code.UP
  let dirz = signz > 0 ? direction.code.SOUTH : direction.code.NORTH
  
  // slope of the line in each dimension in relation to the other dimensions (change in dimension A when dimension B is increased by 1)
  let xry = diffx / diffy
  let xrz = diffx / diffz
  let yrx = diffy / diffx
  let yrz = diffy / diffz
  let zrx = diffz / diffx
  let zry = diffz / diffy
  
  // utility function to construct and submit a single output
  let doplot = function(up, fwd) {
  
    let coord = {
      // transform x,y,z from the simplified domain the plotter operates on back to the domain of the requested line
      x:ofsx + posx * signx,
      y:ofsy + posy * signy,
      z:ofsz + posz * signz,
      
      //attach the up vector (normal of the intercepted face)
      up:up,
    }
    
    // local intercept position
    coord.interceptX = signx > 0 ? accx : 1-accx
    coord.interceptY = signy > 0 ? accy : 1-accy
    coord.interceptZ = signz > 0 ? accz : 1-accz
    
    //local intercept position offset for the purpose of forward vector calculation
    let ix = signx > 0 ? accx-0.5 : 0.5-accx
    let iy = signy > 0 ? accy-0.5 : 0.5-accy
    let iz = signz > 0 ? accz-0.5 : 0.5-accz
    
    // Find the best forward vector and attach it to the output
    //   (orthogonal direction which is closest to the vector originating at the center of the intercepted face and pointing toward the intercept)
    // if the intercept is exactly equal to the face center, a null direction is used
    ;[coord.forward, coord.rad] = toForward(up, ix, iy, iz)
    return plot(coord)
  }
  
  // use a complete plotter if the X slope is non-zero (zero
  if (diffx != 0) {
    while (true) {
      //compute proposed x accumulator values
      //each proposed value is the local X value which corresponds to a local X or Y or Z value of 1
      let naccx_x = 1
      let naccx_y = accx+(xry*(1-accy))
      let naccx_z = accx+(xrz*(1-accz))
      
      //select the smallest deviation (proposed X values are used as proxies for candidate positions to plot)
      if ( (naccx_x <= naccx_y) && (naccx_x <= naccx_z) ) {
        let shift = 1-accx
        accx = 1
        accy += shift*yrx
        accz += shift*zrx
      }
      else if (naccx_y <= naccx_z) {
        let shift = 1-accy
        accx += shift*xry
        accy = 1
        accz += shift*zry
      }
      else {
        let shift = 1-accz
        accx += shift*xrz
        accy += shift*yrz
        accz = 1
      }
      
      //If the best candidate position is out of the domain of the line, plotting is done
      if ((posx+accx) > diffx) {
        return
      }
      
      //plot the hit position (as well as any arbitrary positions needed to keep the line contiguous)
      if (accx >= 1) {
        posx += 1
        accx -= 1
        if (!doplot(dirx)) {
          return
        }
      }
      if (accy >= 1) {
        posy += 1
        accy -= 1
        if (!doplot(diry)) {
          return
        }
      }
      if (accz >= 1) {
        posz += 1
        accz -= 1
        if (!doplot(dirz)) {
          return
        }
      }
    }
  }
  // use a partial plotter if the X slope is zero, but Y is non-zero
  else if (diffy != 0) {
    while (true) {
      //compute proposed y accumulator values
      //each proposed value is the local Y value which corresponds to a local Y or Z value of 1
      let naccy_y = 1
      let naccy_z = accy+(yrz*(1-accz))
      
      //select the smallest deviation (proposed Y values are used as proxies for candidate positions to plot)
      if (naccy_y <= naccy_z) {
        let shift = 1-accy
        accy = 1
        accz += shift*zry
      }
      else {
        let shift = 1-accz
        accy += shift*yrz
        accz = 1
      }
      
      //If the best candidate position is out of the domain of the line, plotting is done
      if ((posy+accy) > diffy) {
        return
      }
      
      //plot the hit position (as well as any arbitrary positions needed to keep the line contiguous)
      if (accy >= 1) {
        posy += 1
        accy -= 1
        if (!doplot(diry)) {
          return
        }
      }
      if (accz >= 1) {
        posz += 1
        accz -= 1
        if (!doplot(dirz)) {
          return
        }
      }
    }
  }
  // use a simple plotter if the only non-zero slope is Z
  else if (diffz != 0) {
    while (true) {
      posz += 1
      if (posz > diffz) {
        return
      }
      if (!doplot(dirz)) {
        return
      }
    }
  }
  
  // use a trivial plotter if there is no plotting to do
  else {
    console.log("WARNING:  zero-length line plotted", start, end)
  }
}

let debugLine = function(start, end, plot) {
  let obj = new THREE.Object3D()
  let main_mat = new THREE.LineBasicMaterial( {color:"green", linewidth:3} )
  let seg_mat = new THREE.LineBasicMaterial( {color:"red", linewidth:2} )
  let pt_mat = new THREE.MeshStandardMaterial( {color:"blue" } )
  let cube_mat = new THREE.MeshStandardMaterial( {color:"yellow", opacity:0.2, transparent:true } )
  
  let mark_line = function(mat, ... coords) {
    let geom = new THREE.Geometry()
    for (let coord of coords) {
      geom.vertices.push( new THREE.Vector3(coord.x-0.5, coord.y, coord.z-0.5) )
    }
    obj.add(new THREE.Line(geom, mat))
  }
  
  
  let mark_intercept = function(... coords) {
    for (let coord of coords) {
      var geom = new THREE.SphereGeometry( 0.125, 8, 8 )
      let sp = new THREE.Mesh(geom, pt_mat)
      sp.position.set(coord.x-0.5,coord.y,coord.z-0.5)
      obj.add( sp )
      
    }
  }
  
  let mark_position = function(... coords) {
    for (let coord of coords) {
      var geom = new THREE.BoxGeometry( 1,1,1 )
      let cb = new THREE.Mesh(geom, cube_mat)
      //cb.position.copy(coord)
      cb.position.set(coord.x,coord.y+0.5,coord.z)
      obj.add( cb )
    }
  }
  
  console.log("BEGIN DEBUG-LINE")
  console.log("START:", start)
  mark_line(main_mat, start, end)
  
  let prev = start
  let _plot = function(coord) {
    let realpos = { x:coord.x+coord.interceptX, y:coord.y+coord.interceptY, z:coord.z+coord.interceptZ }
    mark_line(seg_mat, prev, realpos)
    mark_intercept(realpos)
    mark_position(coord)
    prev = realpos
    console.log(coord)
    return plot(coord)
  }
  plotLine(start, end, _plot)
  console.log("END:", end)
  console.log("END DEBUG-LINE")
  return obj
}



























