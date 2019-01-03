/*  Containers represent one unit of space which an Orthot Object (solid or spatially-positioned Puzzle element) may occupy.

    In additional to helping structure the data, Containers also provide queries and helper functions 
        (rather than scattering many queries throughout puzzle element code)
*/
orthot.Container = function(x,y,z) {
  let r = {
    x:x, 
    y:y, 
    z:z, 
    content:[], 
    id:`${x}|${y}|${z}`,
    
    bump:function() {
      let falltriggered = false
      for (let internalOBJ of r.content) {
        falltriggered |= internalOBJ.bump()
      }
      return falltriggered
    },
    push:function(force) {
      let internalOBJ_moved
      for (let internalOBJ of r.content) {        
        if (internalOBJ.push(force)) {
          internalOBJ_moved = internalOBJ
        }
      }
      if (internalOBJ_moved) {
        force.OBJ.notify_PushClearedObstruction(force, internalOBJ_moved)
        return true
      }
      return false
    },
    
    addObject:function(obj) {
      r.content.push(obj)
      for (let other of r.content) {
        if (other != obj) {
          other.intruded(obj)
        }
      }
    },
    
    /*  Query the container for an object matching the specified type
    */
    getObject_bytype:function(type) {    
      if (type) {
        for (let obj of r.content) {
          if (obj.types.indexOf(type) != -1) {
            return obj
          }
        }
      }
    },
    stackFall:function(force) {
      let nforce
      let _force
      for (let obj of r.content) {
         _force = obj.stackFall(force)
         if (_force) {
          nforce = _force
         }
      }
      if (nforce) {
        nforce.OBJ.zone.getAdjacentCTN(r, libek.direction.code.UP).stackFall(nforce)
      }
    },
    
    applyInboundSecondaryForce(secondaryForce) {
      //console.log("IB-secondary force")
      //console.log(secondaryForce, this)
    },
    applyOutboundSecondaryForce(secondaryForce) {
      //console.log("OB-secondary force")
      //console.log(secondaryForce, this)    
    },
    
    /*  Query the container for a side-attachment.  (This is mainly for finding portals and ladders)
    */
    getSideobject_bytype:function(side, type) {
      for (let obj of r.content) {
        let sideobj = obj.getSideobject_bytype(side, type)
        if (sideobj) {
          return sideobj
        }
      }
    },
  }
  return r
}






