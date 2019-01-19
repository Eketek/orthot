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
    
    // Somewhat lazy adjacentcy test.  Returns true if one of the other container's coordinates differs by 1.  This assumes that coordinates have integer values.
    isAdjacent:function(other) {
      return ((Math.abs(x-other.x) + Math.abs(y-other.y) + Math.abs(z-other.z)) == 1)
    },
    
    push:function(force) {
      let internalOBJ_moved
      for (let internalOBJ of r.content) {        
        if (internalOBJ.push(force)) {
          internalOBJ_moved = internalOBJ
        }
        else if (internalOBJ.hasSides) {
          let pside = libek.direction.invert[force.toHEADING]
          let attachments = internalOBJ.sides[pside]
          for (let sobj of attachments) {
            if (sobj.push) {
              sobj.push()
            }
          }
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
          obj.intrude(other)
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
    
    /*  Query the container for an object matching any specified spatial class
    */
    getObject_byspatialclass:function(sclass) {  
      if (!Array.isArray(sclass)) {
        sclass = [sclass]
      }
      for (let obj of r.content) {
        if (sclass.indexOf(obj.SpatialClass) != -1) {
          return obj
        }
      }
    },
    
    /*  An object is moving out of some container other than this one, into a container which is adjacent to this container
     *
     *  heading:
     *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
     *    which points at the location the object is moving into
     *  normal:
     *    A vector pointing toward the space which the object is moving into
     *  originatingForce:
     *    The [primary] force which is causing this secondary force to be applied
     */
    applyInboundIndirectForce(heading, normal, from_normal, originatingForce) {
      for (let obj of r.content) {
        obj.applyInboundIndirectForce(heading, normal, from_normal, originatingForce)
      }
    },
    
    /*  An object is moving out of an adjacent container, into some container other than this one
     *
     *  heading:
     *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
     *    which points at the location the object is moving away from
     *  normal:
     *    A vector pointing toward the space which the object is moving away from
     *  originatingForce:
     *    The [primary] force which is causing this secondary force to be applied
     */
    applyOutboundIndirectForce(heading, normal, from_normal, originatingForce) {
      for (let obj of r.content) {
        obj.applyOutboundIndirectForce(heading, normal, from_normal, originatingForce)
      }
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






