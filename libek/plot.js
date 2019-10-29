export { plotLine }
import { direction } from './direction.js'

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
plotLine = function(start, end, plot) {
  
  //unpack the arguments
  let startx = start.x
  let starty = start.y
  let startz = start.z
  let endx = end.x
  let endy = end.y
  let endz = end.z
  
  // convert vector format to absolute-value and sign
  //  The plotter operates in a simplified domain - uses a positive slope in all dimensions
  let diffx = endx - startx
  let diffy = endy - starty
  let diffz = endz - startz
  let signx = Math.sign(diffx)
  let signy = Math.sign(diffy)
  let signz = Math.sign(diffz)
  diffx = Math.abs(diffx)
  diffy = Math.abs(diffy)
  diffz = Math.abs(diffz)
  
  // prepare position and accumulator fields
  let intstartx = Math.floor(startx)
  let intstarty = Math.floor(starty)
  let intstartz = Math.floor(startz)
  let posx = intstartx
  let posy = intstarty
  let posz = intstartz
  let accx = startx-intstartx
  let accy = starty-intstarty
  let accz = startz-intstartz
  
  // output "up" vectors (normals of front-faces inrtersected by the line)
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
  
    coord = {
      // transform x,y,z from the simplified domain the plotter operates on back to the domain of the requested line
      x:intstartx + (posx-intstartx) * signx,
      y:intstarty + (posy-intstarty) * signy,
      z:intstartz + (posz-intstartz) * signz,
      
      //attach the up vector (normal of the intercepted face)
      up:up,
    }
    
    //local position of the intercept
    let ix = signx > 0 ? accx-0.5 : 0.5-accx
    let iy = signy > 0 ? accy-0.5 : 0.5-accy
    let iz = signz > 0 ? accz-0.5 : 0.5-accz
    coord.interceptX = ix
    coord.interceptY = iy
    coord.interceptZ = iz
    
    // Find the best forward vector and attach it to the output
    //   (orthogonal direction which is closest to the vector originating at the center of the intercepted face and pointing toward the intercept)
    // if the intercept is exactly equal to the face center, a null direction is used
    let rad
    switch (up) {
      case direction.code.UP:
      case direction.code.DOWN:
        rad = Math.atan2(iz, ix)
        coord.rad = rad
        if (rad > Math.PI * 0.75) {
          coord.fwd = direction.code.EAST
        }
        else if (rad > Math.PI * 0.25) {
          coord.fwd = direction.code.NORTH
        }
        else if (rad > Math.PI * -0.25) {
          if ( (rad == 0) && (iz == 0) && (ix == 0) ) {
            coord.fwd = direction.code.NODIR
          }
          else {
            coord.fwd = direction.code.WEST
          }
        }
        else if (rad > Math.PI * -0.75) {
          coord.fwd = direction.code.SOUTH
        }
        else {
          coord.fwd = direction.code.EAST
        }
        break
      case direction.code.NORTH:
      case direction.code.SOUTH:
        rad = Math.atan2(iy, ix)
        coord.rad = rad
        if (rad > Math.PI * 0.75) {
          coord.fwd = direction.code.EAST
        }
        else if (rad > Math.PI * 0.25) {
          coord.fwd = direction.code.UP
        }
        else if (rad > Math.PI * -0.25) {
          if ( (rad == 0) && (iy == 0) && (ix == 0) ) {
            coord.fwd = direction.code.NODIR
          }
          else {
            coord.fwd = direction.code.WEST
          }
        }
        else if (rad > Math.PI * -0.75) {
          coord.fwd = direction.code.DOWN
        }
        else {
          coord.fwd = direction.code.EAST
        }
        break
      case direction.code.EAST:
      case direction.code.WEST:
        rad = Math.atan2(iy, iz)
        coord.rad = rad
        if (rad > Math.PI * 0.75) {
          coord.fwd = direction.code.SOUTH
        }
        else if (rad > Math.PI * 0.25) {
          coord.fwd = direction.code.UP
        }
        else if (rad > Math.PI * -0.25) {
          if ( (rad == 0) && (iy == 0) && (iz == 0) ) {
            coord.fwd = direction.code.NODIR
          }
          else {
            coord.fwd = direction.code.NORTH
          }
        }
        else if (rad > Math.PI * -0.75) {
          coord.fwd = direction.code.DOWN
        }
        else {
          coord.fwd = direction.code.SOUTH
        }
        break
    }
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
      if ((posx+accx) > endx) {
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
      if ((posy+accy) > endy) {
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
      if (posz > endz) {
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


